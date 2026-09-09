from datetime import date, timedelta


def receive(client, headers, location, **kw):
    data = {"name": "우유", "quantity": 4, "location_id": location["id"], **kw}
    r = client.post("/api/items", headers=headers, json=data)
    assert r.status_code == 200, r.text
    return r.json()


def test_auth_and_family_invite(client, household):
    h, _, _ = household
    assert client.get("/api/items").status_code == 401
    code = client.get("/api/me", headers=h).json()["invite_code"]
    r = client.post(
        "/api/auth/signup",
        json={
            "email": "family@example.com",
            "password": "securepass123",
            "invite_code": code,
        },
    )
    assert r.status_code == 200
    family = {"Authorization": "Bearer " + r.json()["access_token"]}
    assert len(client.get("/api/locations", headers=family).json()) == 2
    client.post("/api/invite/rotate", headers=h)
    r = client.post(
        "/api/auth/signup",
        json={
            "email": "other@example.com",
            "password": "securepass123",
            "invite_code": code,
        },
    )
    assert r.status_code == 404
    assert client.get("/api/me", headers=family).status_code == 200


def test_tenant_isolation(client, household):
    h, room, shelf = household
    item = receive(client, h, shelf)
    r = client.post(
        "/api/auth/signup",
        json={"email": "stranger@example.com", "password": "securepass123"},
    )
    other = {"Authorization": "Bearer " + r.json()["access_token"]}
    assert client.get("/api/items", headers=other).json() == []
    assert (
        client.post(
            "/api/items",
            headers=other,
            json={"name": "x", "quantity": 1, "location_id": room["id"]},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/items/{item['id']}/actions",
            headers=other,
            json={"action": "consume", "quantity": 1},
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/products/{item['product_id']}/locations", headers=other
        ).status_code
        == 404
    )
    assert (
        client.put(
            f"/api/locations/{room['id']}", headers=other, json={"name": "bad"}
        ).status_code
        == 404
    )


def test_merge_missing_expiry_and_expiry_batches(client, household):
    h, _, shelf = household
    a = receive(client, h, shelf)
    b = receive(client, h, shelf, name=" 우유 ", quantity=2)
    assert a["id"] == b["id"] and b["quantity"] == 6
    receive(
        client,
        h,
        shelf,
        quantity=1,
        expiry_date=(date.today() + timedelta(days=5)).isoformat(),
    )
    assert len(client.get("/api/items", headers=h).json()) == 2
    assert len(client.get("/api/products", headers=h).json()) == 1


def test_partial_move_conserves_stock_and_logs(client, household):
    h, room, shelf = household
    a = receive(client, h, shelf)
    r = client.post(
        f"/api/items/{a['id']}/actions",
        headers=h,
        json={"action": "move", "quantity": 2, "destination_id": room["id"]},
    )
    assert r.status_code == 200
    rows = client.get("/api/items", headers=h).json()
    assert sorted(i["quantity"] for i in rows) == [2, 2]
    logs = client.get("/api/activity", headers=h).json()
    assert (
        logs[0]["action"] == "move"
        and logs[0]["from_path"] == "주방 > 냉장고"
        and logs[0]["to_path"] == "주방"
    )
    assert client.get(f"/api/products/{a['product_id']}/locations", headers=h).json()


def test_overconsume_and_invalid_move_do_not_change_stock(client, household):
    h, _, shelf = household
    a = receive(client, h, shelf)
    for body in (
        {"action": "consume", "quantity": 5},
        {"action": "move", "quantity": 1, "destination_id": 999},
    ):
        assert client.post(
            f"/api/items/{a['id']}/actions", headers=h, json=body
        ).status_code in (404, 409)
    assert client.get("/api/items", headers=h).json()[0]["quantity"] == 4
    assert len(client.get("/api/activity", headers=h).json()) == 1


def test_discard_adjust_zero_preserve_history(client, household):
    h, _, shelf = household
    a = receive(client, h, shelf)
    url = f"/api/items/{a['id']}/actions"
    assert (
        client.post(
            url, headers=h, json={"action": "discard", "quantity": 1}
        ).status_code
        == 200
    )
    assert (
        client.post(
            url, headers=h, json={"action": "adjust", "quantity": 0}
        ).status_code
        == 422
    )
    assert (
        client.post(
            url,
            headers=h,
            json={"action": "adjust", "quantity": 0, "note": "재고 실사"},
        ).status_code
        == 200
    )
    assert client.get("/api/items", headers=h).json() == []
    assert (
        client.get("/api/items?include_empty=true", headers=h).json()[0]["quantity"]
        == 0
    )
    assert [l["action"] for l in client.get("/api/activity", headers=h).json()] == [
        "adjust",
        "discard",
        "receive",
    ]
    assert client.delete(f"/api/locations/{shelf['id']}", headers=h).status_code == 409


def test_cycles_bounds_and_history_paths(client, household):
    h, room, shelf = household
    receive(client, h, shelf)
    assert (
        client.put(
            f"/api/locations/{room['id']}",
            headers=h,
            json={"name": "주방", "parent_id": shelf["id"]},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/locations", headers=h, json={"name": "넘침", "x": 19, "width": 3}
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/api/locations/{shelf['id']}",
            headers=h,
            json={"name": "새 냉장고", "parent_id": room["id"]},
        ).status_code
        == 200
    )
    assert (
        client.get("/api/items", headers=h).json()[0]["location_path"]
        == "주방 > 새 냉장고"
    )
    assert (
        client.get("/api/activity", headers=h).json()[0]["to_path"] == "주방 > 냉장고"
    )


def test_alerts_aggregate_stock_exclude_expired(client, household):
    h, room, shelf = household
    a = receive(client, h, shelf, quantity=2)
    receive(client, h, room, quantity=2)
    receive(
        client,
        h,
        room,
        quantity=10,
        expiry_date=(date.today() - timedelta(days=1)).isoformat(),
    )
    data = client.get("/api/insights", headers=h).json()
    f = data["forecasts"][0]
    assert f["total"] == 14 and f["usable"] == 4 and not f["buy"]
    assert len(data["expiry"]) == 1
    assert f["method"] == "insufficient"
    client.put(
        f"/api/products/{a['product_id']}",
        headers=h,
        json={"name": "우유", "minimum": 5, "lead_days": 3},
    )
    assert client.get("/api/insights", headers=h).json()["forecasts"][0]["buy"]


def test_barcode_local_lookup(client, household):
    h, _, shelf = household
    a = receive(client, h, shelf, barcode="8801234567890")
    r = client.get("/api/barcode/8801234567890", headers=h)
    assert (
        r.json()["product_id"] == a["product_id"] and r.json()["source"] == "household"
    )
    assert client.get("/api/barcode/abc", headers=h).status_code == 422


def test_photo_missing_server_and_bad_upload(client, household, monkeypatch):
    import io
    from PIL import Image

    monkeypatch.delenv("OLLAMA_URL", raising=False)
    h, _, _ = household
    assert (
        client.post(
            "/api/recognize",
            headers=h,
            files={"file": ("x.jpg", b"not an image", "image/jpeg")},
        ).status_code
        == 422
    )
    b = io.BytesIO()
    Image.new("RGB", (8, 8)).save(b, format="JPEG")
    assert (
        client.post(
            "/api/recognize",
            headers=h,
            files={"file": ("x.jpg", b.getvalue(), "image/jpeg")},
        ).status_code
        == 503
    )


def test_static_app_and_validation(client, household):
    h, _, shelf = household
    assert client.get("/").status_code == 200
    assert client.get("/app.js").status_code == 200
    assert client.get("/api/activity?limit=-1", headers=h).status_code == 422
    assert (
        client.post(
            "/api/items",
            headers=h,
            json={"name": "  ", "location_id": shelf["id"], "quantity": 1},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/auth/login",
            data={"username": "one@example.com", "password": "wrongpass"},
        ).status_code
        == 401
    )


def test_photo_response_with_mock_model(client, household, monkeypatch):
    import io
    import json
    import httpx
    from PIL import Image
    from backend import recognition

    h, _, _ = household
    b = io.BytesIO()
    Image.new("RGB", (8, 8)).save(b, format="JPEG")
    monkeypatch.setenv("OLLAMA_URL", "http://model.example")

    def respond(request):
        data = json.loads(request.content)
        assert data["messages"][0]["images"] and data["stream"] is False
        assert data["format"]["type"] == "object"
        return httpx.Response(
            200,
            json={
                "message": {
                    "content": json.dumps(
                        {
                            "name": "머그컵",
                            "expiry_date": None,
                            "note": "사진에서 추정한 이름",
                        }
                    )
                }
            },
        )

    actual = httpx.AsyncClient

    def client_factory(**kwargs):
        return actual(transport=httpx.MockTransport(respond), **kwargs)

    monkeypatch.setattr(recognition.httpx, "AsyncClient", client_factory)
    r = client.post(
        "/api/recognize",
        headers=h,
        files={"file": ("cup.jpg", b.getvalue(), "image/jpeg")},
    )
    assert r.status_code == 200 and r.json()["name"] == "머그컵"
    assert r.json()["requires_confirmation"] is True
