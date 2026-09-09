"""Operator-only CLI. Requires direct database access; no public audit endpoint."""

import argparse
import json
from .db import SessionLocal
from .models import Activity, User


def main():
    parser = argparse.ArgumentParser(description="운영자용 가구 활동 기록 조회")
    parser.add_argument("--household-id", type=int, required=True)
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()
    with SessionLocal() as db:
        rows = (
            db.query(Activity, User)
            .join(User, Activity.user_id == User.id)
            .filter(Activity.household_id == args.household_id)
            .order_by(Activity.id.desc())
            .limit(max(1, min(args.limit, 100)))
        )
        for event, user in rows:
            print(
                json.dumps(
                    {
                        "id": event.id,
                        "actor": user.display_name,
                        "user_id": user.id,
                        "action": event.action,
                        "product": event.product_name,
                        "quantity": event.quantity,
                        "note": event.note,
                        "from": event.from_path,
                        "to": event.to_path,
                        "created_at": event.created_at.isoformat(),
                    },
                    ensure_ascii=False,
                )
            )


if __name__ == "__main__":
    main()
