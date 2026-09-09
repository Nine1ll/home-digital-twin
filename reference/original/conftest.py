import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from database import Base, get_db

TEST_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def client():
    # 테스트 시작 전: 테스트 DB에 테이블 생성
    Base.metadata.create_all(bind=engine)

    # get_db를 테스트 DB에 쓰도록 교체
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield TestClient(app)

    # 테스트 끝난 후: 테이블 전부 삭제 (깨끗하게)
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()