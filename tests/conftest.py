import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-only-key-with-at-least-32-characters"
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.db import Base, get_db
from backend.main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def constraints(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False)

    def db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def household(client):
    result = client.post(
        "/api/auth/signup",
        json={
            "email": "one@example.com",
            "password": "securepass123",
            "household_name": "테스트집",
        },
    )
    assert result.status_code == 200, result.text
    headers = {"Authorization": "Bearer " + result.json()["access_token"]}
    room = client.post(
        "/api/locations",
        headers=headers,
        json={"name": "주방", "width": 8, "height": 8},
    ).json()
    shelf = client.post(
        "/api/locations",
        headers=headers,
        json={"name": "냉장고", "parent_id": room["id"], "kind": "furniture"},
    ).json()
    return headers, room, shelf
