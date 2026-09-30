import base64
from datetime import date, timedelta
from backend import push
from backend.db import get_db
from backend.main import app
from backend.models import Household, PushSubscription

FCM = "https://fcm.googleapis.com/fcm/send/abc"


def sub(endpoint=FCM):
    return {"endpoint": endpoint, "keys": {"p256dh": "key", "auth": "secret"}}


def keys(monkeypatch):
    private, public = [l.split("=", 1)[1] for l in push.generate_keys().split("\n")]
    monkeypatch.setenv("VAPID_PRIVATE_KEY", private)
    monkeypatch.setenv("VAPID_PUBLIC_KEY", public)
    return private, public


def test_generated_keys_match():
    from py_vapid import Vapid
    from cryptography.hazmat.primitives import serialization

    private, public = [l.split("=", 1)[1] for l in push.generate_keys().split("\n")]
    derived = Vapid.from_string(private).public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    assert base64.urlsafe_b64decode(public + "==") == derived


def test_disabled_without_keys(client, household, monkeypatch):
    h, _, _ = household
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    assert client.get("/api/me", headers=h).json()["push_enabled"] is False
    assert client.get("/api/push/key", headers=h).json()["public_key"] is None
    assert client.post("/api/push/subscribe", headers=h, json=sub()).status_code == 503


def test_subscribe_only_known_push_services(client, household, monkeypatch):
    h, _, _ = household
    keys(monkeypatch)
    for bad in (
        "http://fcm.googleapis.com/x",
        "https://127.0.0.1/x",
        "https://evil.com/fcm.googleapis.com",
        "https://fcm.googleapis.com.evil.com/x",
    ):
        r = client.post("/api/push/subscribe", headers=h, json=sub(bad))
        assert r.status_code == 422, bad
    for ok in (FCM, "https://web.push.apple.com/abc"):
        assert (
            client.post("/api/push/subscribe", headers=h, json=sub(ok)).status_code
            == 200
        )


def test_device_moves_to_new_login_and_unsubscribe(client, household, monkeypatch):
    h, _, _ = household
    keys(monkeypatch)
    client.post("/api/push/subscribe", headers=h, json=sub())
    other = client.post(
        "/api/auth/signup",
        json={
            "email": "two@example.com",
            "password": "securepass123",
            "household_name": "다른집",
        },
    ).json()
    o = {"Authorization": "Bearer " + other["access_token"]}
    client.post("/api/push/subscribe", headers=o, json=sub())
    db = next(app.dependency_overrides[get_db]())
    rows = db.query(PushSubscription).all()
    assert len(rows) == 1 and db.get(Household, rows[0].household_id).name == "다른집"
    client.post("/api/push/unsubscribe", headers=h, json={"endpoint": FCM})
    assert db.query(PushSubscription).count() == 1, "남의 구독은 해지할 수 없음"
    client.post("/api/push/unsubscribe", headers=o, json={"endpoint": FCM})
    assert db.query(PushSubscription).count() == 0


def test_daily_message_and_expired_cleanup(client, household, monkeypatch):
    h, _, shelf = household
    keys(monkeypatch)
    soon = (date.today() + timedelta(days=1)).isoformat()
    client.post(
        "/api/items",
        headers=h,
        json={
            "name": "두부",
            "quantity": 1,
            "location_id": shelf["id"],
            "expiry_date": soon,
        },
    )
    client.post("/api/push/subscribe", headers=h, json=sub())
    client.post("/api/push/subscribe", headers=h, json=sub(FCM + "-gone"))
    sent = []
    monkeypatch.setattr(
        push, "send", lambda s, p: sent.append(p) or not s.endpoint.endswith("gone")
    )
    db = next(app.dependency_overrides[get_db]())
    assert push.notify_all(db) == 1
    assert "유통기한 임박 1개: 두부" in sent[0]["body"]
    assert "장보기 1개: 두부" in sent[0]["body"]
    assert db.query(PushSubscription).count() == 1, "만료된 구독은 삭제"
    r = client.post("/api/push/test", headers=h)
    assert r.json() == {"sent": 1}
