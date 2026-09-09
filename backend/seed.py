"""수동 실행하는 합성 예시 데이터. 실제 사용자 계정/DB를 덮어쓰지 않는다."""

import argparse
import getpass
import secrets
from datetime import datetime, timezone, timedelta
from .db import Base, engine, SessionLocal
from .models import Household, User, Location, Product, Batch, Activity
from .auth import hash_password
from .migrations import upgrade


def main():
    parser = argparse.ArgumentParser(
        description="별도 예시 가구와 60일 합성 소비 기록 생성"
    )
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    password = getpass.getpass("예시 계정 비밀번호 (8자 이상): ")
    if len(password) < 8 or len(password.encode()) > 72:
        raise SystemExit("8자 이상, UTF-8 72바이트 이하로 입력하세요")
    Base.metadata.create_all(engine)
    upgrade(engine)
    with SessionLocal() as db:
        if db.query(User).filter_by(email=args.email.lower()).first():
            raise SystemExit("이미 있는 이메일입니다. 덮어쓰지 않았습니다.")
        h = Household(
            name="우리집 (합성 예시)", invite_code=secrets.token_hex(8).upper()
        )
        db.add(h)
        db.flush()
        user = User(
            email=args.email.lower(),
            password_hash=hash_password(password),
            household_id=h.id,
        )
        db.add(user)
        db.flush()
        rooms = {}
        for name, x, y, w, hh in [
            ("주방", 0, 0, 10, 9),
            ("거실", 10, 0, 10, 9),
            ("침실", 0, 9, 10, 11),
            ("다용도실", 10, 9, 10, 11),
        ]:
            room = Location(
                household_id=h.id, name=name, x=x, y=y, width=w, height=hh, kind="room"
            )
            db.add(room)
            db.flush()
            rooms[name] = room
        destinations = {}
        for parent, name, x, y in [
            ("주방", "냉장고", 1, 1),
            ("주방", "식품 수납장", 10, 1),
            ("거실", "TV장 서랍", 2, 2),
            ("다용도실", "생활용품 선반", 2, 2),
        ]:
            loc = Location(
                household_id=h.id,
                parent_id=rooms[parent].id,
                name=name,
                x=x,
                y=y,
                width=8,
                height=7,
                kind="furniture",
            )
            db.add(loc)
            db.flush()
            destinations[name] = (loc, parent + " > " + name)
        now = datetime.now(timezone.utc)
        for index, (name, place, stock, expiry, unit) in enumerate(
            [
                ("우유", "냉장고", 2, 2, "개"),
                ("계란", "냉장고", 12, 8, "개"),
                ("두부", "냉장고", 1, -1, "개"),
                ("커피", "식품 수납장", 20, 90, "개"),
                ("건전지", "TV장 서랍", 4, None, "개"),
                ("휴지", "생활용품 선반", 2, None, "롤"),
            ]
        ):
            p = Product(
                household_id=h.id,
                name=name,
                normalized_name=name,
                unit=unit,
                minimum=2,
                lead_days=3,
            )
            db.add(p)
            db.flush()
            loc, path = destinations[place]
            b = Batch(
                household_id=h.id,
                product_id=p.id,
                location_id=loc.id,
                quantity=stock,
                expiry=(now.date() + timedelta(days=expiry)).isoformat()
                if expiry is not None
                else "",
            )
            db.add(b)
            db.flush()
            usage = [
                (day, 1 + (index == 1))
                for day in range(1, 60)
                if day % (index + 2) == 0
            ]
            base = dict(
                household_id=h.id,
                user_id=user.id,
                product_id=p.id,
                batch_id=b.id,
                product_name=name,
                note="합성 예시 데이터",
            )
            db.add(
                Activity(
                    **base,
                    action="receive",
                    quantity=stock + sum(q for _, q in usage),
                    to_path=path,
                    to_location_id=loc.id,
                    created_at=now - timedelta(days=60),
                )
            )
            for day, qty in usage:
                db.add(
                    Activity(
                        **base,
                        action="consume",
                        quantity=qty,
                        from_path=path,
                        created_at=now - timedelta(days=day),
                    )
                )
        db.commit()
    print(
        "별도 예시 가구를 만들었습니다. 입력한 계정으로 로그인하세요. 모든 소비 기록은 합성 예시입니다."
    )


if __name__ == "__main__":
    main()
