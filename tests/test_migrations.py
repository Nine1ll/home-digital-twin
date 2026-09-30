"""마이그레이션이 모델과 같고, 옛 DB(create_all로 만든)를 데이터 그대로 이어받는지."""

import sqlite3
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text
from backend.db import Base
from backend.migrate import migrate
from backend.models import PushSubscription


def engine_at(path):
    return create_engine(f"sqlite:///{path}")


def test_migrations_match_models(tmp_path):
    """모델을 바꾸고 마이그레이션을 빠뜨리면 여기서 실패한다.
    고치는 법: alembic revision --autogenerate -m "무엇을 바꿨는지" """
    engine = engine_at(tmp_path / "new.db")
    migrate(engine)
    with engine.connect() as c:
        diff = compare_metadata(MigrationContext.configure(c), Base.metadata)
    assert diff == []
    migrate(engine)  # 두 번 실행해도 안전


def test_legacy_db_before_push_keeps_data(tmp_path):
    engine = engine_at(tmp_path / "old.db")
    tables = [t for t in Base.metadata.sorted_tables if t.name != "push_subscriptions"]
    Base.metadata.create_all(engine, tables=tables)  # main 브랜치 시절 DB
    with engine.begin() as c:
        c.execute(
            text(
                "insert into households (name, invite_code, expiry_days) values ('옛집', 'X', 3)"
            )
        )
    migrate(engine)
    assert "push_subscriptions" in inspect(engine).get_table_names()
    with engine.connect() as c:
        assert c.execute(text("select name from households")).scalar() == "옛집"
        assert (
            c.execute(text("select version_num from alembic_version")).scalar()
            == "0002"
        )


def test_legacy_db_with_push_is_stamped(tmp_path):
    path = tmp_path / "recent.db"
    Base.metadata.create_all(engine_at(path))  # home-builder 시절 DB
    migrate(engine_at(path))
    assert sqlite3.connect(path).execute(
        "select version_num from alembic_version"
    ).fetchone() == ("0002",)
    assert PushSubscription.__tablename__ in inspect(engine_at(path)).get_table_names()
