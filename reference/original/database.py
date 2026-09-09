import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./home_inventory.db"
)

# SQLite일 때만 필요한 옵션 (check_same_thread)을 조건부로 적용
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

# 세션: DB에 뭔가 읽고 쓸 때 쓰는 작업 단위
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base: 모든 모델 클래스가 상속할 부모. 이걸 상속하면 DB 테이블이 됨
Base = declarative_base()

# 요청마다 DB 세션을 열고, 끝나면 반드시 닫아주는 함수
# FastAPI의 Depends와 함께 쓰인다.
def get_db():
    db = SessionLocal()
    try:
        yield db # 세션을 API 함수에 넘겨줌
    finally:
        db.close() # 작업이 끝나면 반드시 닫음