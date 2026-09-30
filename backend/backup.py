"""SQLite DB를 날짜별 파일로 백업하고 오래된 백업을 지운다. cron으로 매일 실행한다.

    python -m backend.backup                  # BACKUP_DIR(기본 ./backups)에 저장, 7개 보관
    python -m backend.backup --keep 30
    python -m backend.backup --restore twin-20260930-090000.db   # API를 멈춘 뒤 실행

실행 중인 서버가 쓰는 도중에도 sqlite3 backup API가 일관된 사본을 만든다.
PostgreSQL은 pg_dump를 쓴다(docs/DEPLOYMENT.md).
"""

import argparse
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from sqlalchemy.engine import make_url


def sqlite_path(database_url):
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite" or not url.database:
        raise SystemExit("SQLite 파일 DB만 지원합니다. PostgreSQL은 pg_dump를 쓰세요")
    return url.database


def copy(src_path, dst_path):
    src, dst = sqlite3.connect(src_path), sqlite3.connect(dst_path)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()


def backup(database_url, folder, keep=7, now=None):
    database = sqlite_path(database_url)
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"twin-{(now or datetime.now()):%Y%m%d-%H%M%S}.db"
    copy(database, target)
    # 이름에 시각이 있어 정렬 순서가 곧 시간 순서다
    for old in sorted(folder.glob("twin-*.db"))[:-keep]:
        old.unlink()
    return target


def restore(database_url, folder, name):
    """백업 파일 내용을 운영 DB에 덮어쓴다. 파일을 복사하지 않고 DB 안으로 옮기므로
    파일 소유자·권한이 유지된다. 덮어쓰기 전 현재 DB를 pre-restore로 남긴다."""
    database = sqlite_path(database_url)
    source = Path(folder) / Path(name).name  # 백업 폴더 밖 경로는 받지 않는다
    if not source.is_file():
        raise SystemExit(f"백업 파일이 없습니다: {source}")
    saved = Path(folder) / f"pre-restore-{datetime.now():%Y%m%d-%H%M%S}.db"
    if Path(database).exists():
        copy(database, saved)
    copy(source, database)
    return saved


def main():
    parser = argparse.ArgumentParser(description="우리집 DB 백업")
    parser.add_argument("--keep", type=int, default=7, help="보관할 백업 수")
    parser.add_argument("--restore", metavar="파일이름", help="이 백업으로 되돌리기")
    args = parser.parse_args()
    url = os.getenv("DATABASE_URL", "sqlite:///./twin.db")
    folder = os.getenv("BACKUP_DIR", "./backups")
    if args.restore:
        saved = restore(url, folder, args.restore)
        print(f"복원 완료. 복원 전 DB는 {saved}에 남겼습니다")
    else:
        print(f"백업 완료: {backup(url, folder, max(1, args.keep))}")


if __name__ == "__main__":
    main()
