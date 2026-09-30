"""앱 시작 때 DB 스키마를 최신 마이그레이션으로 맞춘다.

마이그레이션 도입 전에 create_all로 만든 DB는 이미 있는 테이블을 보고
해당 버전으로 표시(stamp)만 한 뒤 이어서 적용한다. 기존 데이터는 건드리지 않는다.
"""

from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect


def config(connection=None):
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    cfg.attributes["connection"] = connection
    return cfg


def legacy_revision(tables):
    """마이그레이션 표시가 없는 옛 DB가 어느 버전과 같은지. 빈 DB면 None."""
    if "alembic_version" in tables or "households" not in tables:
        return None
    return "0002" if "push_subscriptions" in tables else "0001"


def migrate(engine):
    with engine.begin() as connection:
        cfg = config(connection)
        stamp = legacy_revision(set(inspect(connection).get_table_names()))
        if stamp:
            command.stamp(cfg, stamp)
        command.upgrade(cfg, "head")
