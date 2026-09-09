from fastapi.testclient import TestClient
from main import app


def test_read_root(client):
    """루트 경로(/)를 호출하면 환영 메시지가 나온다."""
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


def test_signup(client):
    """회원가입하면 access_token이 반환된다."""
    response = client.post("/auth/signup", json={
        "email": "test@example.com",
        "password": "password123",
        "household_name": "테스트집",
    })
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login(client):
    """가입한 사용자가 로그인하면 토큰이 반환된다."""
    # 먼저 가입
    client.post("/auth/signup", json={
        "email": "login@example.com",
        "password": "password123",
        "household_name": "로그인집",
    })
    # 로그인 (OAuth2 폼 형식: username에 이메일)
    response = client.post("/auth/login", data={
        "username": "login@example.com",
        "password": "password123",
    })
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password(client):
    """틀린 비밀번호로 로그인하면 401이 반환된다."""
    client.post("/auth/signup", json={
        "email": "wrong@example.com",
        "password": "password123",
        "household_name": "집",
    })
    response = client.post("/auth/login", data={
        "username": "wrong@example.com",
        "password": "WRONGpassword",
    })
    assert response.status_code == 401


def test_items_require_auth(client):
    """토큰 없이 물건 목록을 요청하면 401이 반환된다."""
    response = client.get("/items")
    assert response.status_code == 401