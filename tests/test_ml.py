"""API 서버와 ML 서버 사이의 약속: 인증, 한 번에 묶어 호출, ML이 없을 때의 동작."""

import httpx
from fastapi.testclient import TestClient
from backend import intelligence
import ml.main


def receive(client, headers, location, name, quantity=5):
    r = client.post(
        "/api/items",
        headers=headers,
        json={"name": name, "quantity": quantity, "location_id": location["id"]},
    )
    assert r.status_code == 200, r.text


def test_internal_token_required(monkeypatch):
    monkeypatch.setattr(ml.main, "TOKEN", "shared-secret")
    c = TestClient(ml.main.app)
    body = {"today": "2026-09-30", "products": {"1": []}}
    assert c.post("/forecast", json=body).status_code == 401
    assert (
        c.post(
            "/forecast", json=body, headers={"X-Internal-Token": "wrong"}
        ).status_code
        == 401
    )
    r = c.post("/forecast", json=body, headers={"X-Internal-Token": "shared-secret"})
    assert r.status_code == 200 and r.json()["1"]["method"] == "insufficient"


def test_one_ml_call_per_screen(client, household):
    h, _, shelf = household
    for name in ("우유", "두부", "휴지"):
        receive(client, h, shelf, name)
    calls = []
    real_post = intelligence.ml.post
    intelligence.ml.post = lambda *a, **kw: calls.append(kw) or real_post(*a, **kw)
    try:
        r = client.get("/api/insights", headers=h)
    finally:
        intelligence.ml.post = real_post
    assert len(calls) == 1 and len(calls[0]["json"]["products"]) == 3
    assert {f["method"] for f in r.json()["forecasts"]} == {"insufficient"}


def test_alerts_work_when_ml_is_down(client, household):
    h, _, shelf = household
    receive(client, h, shelf, "우유", quantity=1)  # 최소 재고(2) 이하
    intelligence.ml = httpx.Client(base_url="http://127.0.0.1:9", timeout=0.5)
    r = client.get("/api/insights", headers=h)
    assert r.status_code == 200
    milk = r.json()["forecasts"][0]
    assert milk["method"] == "unavailable" and milk["buy"] is True
