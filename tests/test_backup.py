import sqlite3
from datetime import datetime, timedelta
import pytest
from backend.backup import backup


def test_backup_copies_data_and_keeps_latest(tmp_path):
    db = tmp_path / "twin.db"
    with sqlite3.connect(db) as c:
        c.execute("create table t (x)")
        c.execute("insert into t values (42)")
    start = datetime(2026, 9, 1, 3, 0)
    for day in range(10):
        last = backup(
            f"sqlite:///{db}", tmp_path / "b", keep=3, now=start + timedelta(days=day)
        )
    files = sorted(p.name for p in (tmp_path / "b").iterdir())
    assert files == [
        "twin-20260908-030000.db",
        "twin-20260909-030000.db",
        "twin-20260910-030000.db",
    ]
    assert sqlite3.connect(last).execute("select x from t").fetchone() == (42,)


def test_backup_refuses_non_sqlite(tmp_path):
    with pytest.raises(SystemExit):
        backup("postgresql+psycopg://u:p@h/db", tmp_path)


def test_restore_keeps_file_and_saves_current(tmp_path):
    from backend.backup import restore

    db = tmp_path / "twin.db"
    with sqlite3.connect(db) as c:
        c.execute("create table t (x)")
        c.execute("insert into t values (1)")
    folder = tmp_path / "b"
    snapshot = backup(f"sqlite:///{db}", folder)
    with sqlite3.connect(db) as c:
        c.execute("insert into t values (2)")
    inode = db.stat().st_ino
    saved = restore(f"sqlite:///{db}", folder, snapshot.name)
    assert sqlite3.connect(db).execute("select count(*) from t").fetchone() == (1,)
    assert db.stat().st_ino == inode, "파일을 바꿔치기하지 않고 내용만 되돌림"
    assert sqlite3.connect(saved).execute("select count(*) from t").fetchone() == (2,)
    with pytest.raises(SystemExit):
        restore(f"sqlite:///{db}", folder, "../../etc/passwd")
