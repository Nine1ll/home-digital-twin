from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import pytest
from sqlalchemy import create_engine, text
from backend.migrations import upgrade
from backend.intelligence import container_forecast


def milk(client, headers, shelf, quantity=2):
    r = client.post(
        "/api/items",
        headers=headers,
        json={
            "name": "우유",
            "quantity": quantity,
            "location_id": shelf["id"],
            "unit": "팩",
            "consumption_mode": "container",
        },
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_portion_preserves_count_until_finished(client, household):
    h, _, shelf = household
    item = milk(client, h, shelf)
    url = f"/api/items/{item['id']}/portion"
    assert client.post(url, headers=h, json={"action": "cup"}).status_code == 409
    opened = client.post(url, headers=h, json={"action": "open"}).json()
    assert opened["quantity"] == 2 and opened["unopened_quantity"] == 1
    assert client.post(url, headers=h, json={"action": "open"}).status_code == 409
    for action in ["cup", "half", "low"]:
        r = client.post(url, headers=h, json={"action": action})
        assert r.status_code == 200 and r.json()["quantity"] == 2
    assert (
        client.post(
            f"/api/items/{item['id']}/actions",
            headers=h,
            json={"action": "consume", "quantity": 1},
        ).status_code
        == 409
    )
    finished = client.post(url, headers=h, json={"action": "finish"}).json()
    assert finished["quantity"] == 1 and finished["remaining_level"] == "closed"
    logs = client.audit(h)
    assert sum(e["quantity"] for e in logs if e["action"] == "consume") == 1
    assert next(e for e in logs if e["action"] == "cup")["quantity"] == 0


def test_low_container_purchase_and_discard(client, household):
    h, _, shelf = household
    item = milk(client, h, shelf, 1)
    client.put(
        f"/api/products/{item['product_id']}",
        headers=h,
        json={
            "name": "우유",
            "minimum": 0,
            "lead_days": 0,
            "consumption_mode": "container",
        },
    )
    url = f"/api/items/{item['id']}/portion"
    for action in ["open", "low"]:
        assert client.post(url, headers=h, json={"action": action}).status_code == 200
    assert client.get("/api/insights", headers=h).json()["forecasts"][0]["buy"]
    assert (
        client.post(url, headers=h, json={"action": "discard"}).json()["quantity"] == 0
    )
    assert not any(e["action"] == "consume" for e in client.audit(h))


@pytest.mark.parametrize(
    "preset", ["studio", "one_half", "two", "three", "three_one", "three_two"]
)
def test_presets_are_editable_and_do_not_replace_home(client, preset):
    token = client.post(
        "/api/auth/signup",
        json={"email": "preset@example.com", "password": "testpassword"},
    ).json()["access_token"]
    h = {"Authorization": "Bearer " + token}
    assert (
        client.post("/api/home-preset", headers=h, json={"preset": preset}).status_code
        == 200
    )
    rows = client.get("/api/locations", headers=h).json()
    assert all(r["x"] + r["width"] <= 20 and r["y"] + r["height"] <= 20 for r in rows)
    assert any(r["name"] == "냉장고" for r in rows)
    assert (
        client.post("/api/home-preset", headers=h, json={"preset": preset}).status_code
        == 409
    )
    row = rows[0]
    assert (
        client.put(
            f"/api/locations/{row['id']}", headers=h, json={**row, "name": "내 방"}
        ).status_code
        == 200
    )


def test_copy_structure_without_inventory_and_bulk_bounds(client, household):
    h, room, shelf = household
    milk(client, h, shelf)
    copied = client.post(
        f"/api/locations/{room['id']}/duplicate", headers=h, json={"name": "주방 복사"}
    )
    assert copied.status_code == 200
    rows = client.get("/api/locations", headers=h).json()
    assert len(rows) == 4 and len(client.get("/api/items", headers=h).json()) == 1
    assert any(
        r["parent_id"] == copied.json()[0]["id"] and r["name"] == "냉장고" for r in rows
    )
    grouped = client.post(
        "/api/space-groups",
        headers=h,
        json={"name": "상부장", "count": 16, "parent_id": room["id"]},
    ).json()
    assert grouped[-1]["name"] == "상부장 16"
    assert all(
        r["x"] + r["width"] <= 20 and r["y"] + r["height"] <= 20 for r in grouped
    )
    assert (
        client.post(
            "/api/space-groups", headers=h, json={"name": "칸", "count": 17}
        ).status_code
        == 422
    )
    token = client.post(
        "/api/auth/signup",
        json={"email": "other@example.com", "password": "testpassword"},
    ).json()["access_token"]
    other = {"Authorization": "Bearer " + token}
    assert (
        client.post(
            f"/api/locations/{room['id']}/duplicate",
            headers=other,
            json={"name": "복사"},
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/space-groups",
            headers=other,
            json={"name": "칸", "parent_id": room["id"]},
        ).status_code
        == 404
    )


def test_names_and_audit_privacy(client, household):
    h, _, shelf = household
    assert (
        client.put(
            "/api/settings",
            headers=h,
            json={"name": "우리집", "expiry_days": 3, "display_name": "아빠"},
        ).status_code
        == 200
    )
    assert client.get("/api/me", headers=h).json()["display_name"] == "아빠"
    milk(client, h, shelf)
    assert client.audit(h)[0]["actor"] == "아빠"
    assert client.get("/api/activity", headers=h).status_code == 404
    assert (
        client.put(
            "/api/settings",
            headers=h,
            json={"name": "집", "expiry_days": 3, "display_name": "   "},
        ).status_code
        == 422
    )


def test_invalid_barcode_cannot_be_learned(client, household):
    h, _, shelf = household
    assert client.get("/api/barcode/8801234567890", headers=h).status_code == 422
    assert (
        client.post(
            "/api/items",
            headers=h,
            json={
                "name": "우유",
                "quantity": 1,
                "location_id": shelf["id"],
                "barcode": "8801234567890",
            },
        ).status_code
        == 422
    )


def test_additive_migration_preserves_existing_rows(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "legacy.db"))
    with engine.begin() as c:
        c.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)"))
        c.execute(text("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)"))
        c.execute(
            text("CREATE TABLE batches (id INTEGER PRIMARY KEY, quantity INTEGER)")
        )
        c.execute(text("INSERT INTO users VALUES (1, 'old@example.com')"))
        c.execute(text("INSERT INTO products VALUES (1, '우유')"))
        c.execute(text("INSERT INTO batches VALUES (1, 7)"))
    upgrade(engine)
    upgrade(engine)
    with engine.connect() as c:
        assert c.execute(
            text("SELECT quantity, remaining_level FROM batches")
        ).one() == (7, "closed")
        assert c.execute(text("SELECT email, display_name FROM users")).one() == (
            "old@example.com",
            "가족",
        )
    engine.dispose()


def test_container_forecast_uses_completed_packages_only():
    now = datetime.now(timezone.utc)
    events = [
        SimpleNamespace(
            action="consume",
            note="opened_at=" + (now - timedelta(days=n)).isoformat(),
            created_at=now,
        )
        for n in [2, 3, 4]
    ]
    assert container_forecast(events[:2])["daily_rate"] is None
    events.append(SimpleNamespace(action="cup", note="", created_at=now))
    events.append(
        SimpleNamespace(
            action="discard",
            note="opened_at=" + (now - timedelta(days=100)).isoformat(),
            created_at=now,
        )
    )
    assert container_forecast(events)["average_container_days"] == 3
