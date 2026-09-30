"""앱의 모델(Base.metadata)과 DB를 비교·적용한다. 앱 시작(migrate.py)과 alembic CLI가 함께 쓴다."""

from alembic import context
from backend.db import Base, engine
from backend import models  # noqa: F401  테이블을 metadata에 등록

if context.is_offline_mode():
    raise SystemExit("오프라인(SQL 출력) 모드는 쓰지 않습니다")


def run(connection):
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        # SQLite는 ALTER가 약해서 테이블을 새로 만들어 옮기는 batch 모드로 바꾼다
        render_as_batch=connection.dialect.name == "sqlite",
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


connection = context.config.attributes.get("connection")
if connection is not None:
    run(connection)
else:
    with engine.connect() as connection:
        run(connection)
        connection.commit()
