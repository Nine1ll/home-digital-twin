"""웹 푸시: 가구별 아침 알림(유통기한 임박·장보기)을 등록된 기기로 보낸다.

python -m backend.push --keys   # VAPID 키 생성(.env에 붙여넣기)
python -m backend.push          # 알림 발송. cron으로 매일 아침 실행
"""

import argparse
import base64
import json
import os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush, WebPushException
from .models import Household, PushSubscription
from .intelligence import household_insights


def enabled():
    return bool(os.getenv("VAPID_PRIVATE_KEY") and os.getenv("VAPID_PUBLIC_KEY"))


def send(sub, payload):
    """보냈으면 True, 만료된 구독(404/410)이면 False. 그 밖의 실패는 예외."""
    try:
        webpush(
            {
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            },
            json.dumps(payload, ensure_ascii=False),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={
                "sub": os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")
            },
            timeout=10,
        )
        return True
    except WebPushException as e:
        if getattr(e.response, "status_code", None) in (404, 410):
            return False
        raise


def names(rows, key="name", limit=3):
    shown = [r[key] for r in rows[:limit]]
    return ", ".join(shown) + (
        f" 외 {len(rows) - limit}개" if len(rows) > limit else ""
    )


def message(db, household):
    """알릴 것이 없으면 None."""
    data = household_insights(db, household)
    buys = [f for f in data["forecasts"] if f["buy"]]
    parts = []
    if data["expiry"]:
        parts.append(f"유통기한 임박 {len(data['expiry'])}개: {names(data['expiry'])}")
    if buys:
        parts.append(f"장보기 {len(buys)}개: {names(buys)}")
    if not parts:
        return None
    return {"title": "우리집 알림", "body": "\n".join(parts), "view": "alerts"}


def deliver(db, subs, payload):
    """보낸 수를 돌려주고 만료된 구독은 지운다."""
    sent = 0
    for sub in subs:
        if send(sub, payload):
            sent += 1
        else:
            db.delete(sub)
    db.commit()
    return sent


def notify_all(db):
    sent = 0
    for h in db.query(Household).all():
        subs = db.query(PushSubscription).filter_by(household_id=h.id).all()
        payload = subs and message(db, h)
        if payload:
            sent += deliver(db, subs, payload)
    return sent


def generate_keys():
    key = ec.generate_private_key(ec.SECP256R1())
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return f"VAPID_PRIVATE_KEY={b64(private)}\nVAPID_PUBLIC_KEY={b64(public)}"


def main():
    parser = argparse.ArgumentParser(description="우리집 웹 푸시")
    parser.add_argument("--keys", action="store_true", help="VAPID 키 생성")
    if parser.parse_args().keys:
        return print(generate_keys())
    if not enabled():
        raise SystemExit("VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY를 설정하세요")
    from .db import SessionLocal, Base, engine

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        print(f"{notify_all(db)}건 보냄")


if __name__ == "__main__":
    main()
