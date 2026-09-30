"""알림과 추천. 소비 예측 계산은 ML 서버(ml/)에 맡긴다."""

import os
from datetime import datetime, timezone, date
import httpx
from .models import Activity, Product, Batch
from .inventory import batch_dict

# 화면 한 번에 한 번만 호출한다(상품마다 호출하면 N+1). 테스트는 이 객체를 바꿔 끼운다
ml = httpx.Client(
    base_url=os.getenv("ML_URL", "http://localhost:8001"),
    timeout=3,
    headers={"X-Internal-Token": os.getenv("ML_TOKEN", "")},
)
UNAVAILABLE = {
    "method": "unavailable",
    "daily_rate": None,
    "days_observed": 0,
    "reason": "예측 서버에 연결하지 못해 최소 재고 기준만 적용했어요",
    "validation_mae": None,
}


def fetch_forecasts(events_by_product, today):
    """상품 id → 예측. ML 서버가 없거나 느리면 빈 dict(호출한 쪽이 UNAVAILABLE로 채움)."""
    try:
        r = ml.post(
            "/forecast",
            json={
                "today": today.isoformat(),
                "products": {
                    str(pid): [
                        {
                            "created_at": e.created_at.isoformat(),
                            "action": e.action,
                            "quantity": e.quantity,
                        }
                        for e in events
                    ]
                    for pid, events in events_by_product.items()
                },
            },
        )
        r.raise_for_status()
        return {int(k): v for k, v in r.json().items()}
    except (httpx.HTTPError, ValueError):
        return {}


def recommendations(db, user, product_id):
    events = (
        db.query(Activity)
        .filter_by(household_id=user.household_id, product_id=product_id)
        .all()
    )
    scores = {}
    for e in events:
        if e.action in ("receive", "move") and e.to_location_id:
            scores[e.to_location_id] = scores.get(e.to_location_id, 0) + 1
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)[:3]


def household_insights(db, h):
    """유통기한 임박 재고와 상품별 구매 안내. 화면과 푸시 알림이 함께 쓴다."""
    today = datetime.now(timezone.utc).date()
    batches = db.query(Batch).filter_by(household_id=h.id).all()
    events = db.query(Activity).filter_by(household_id=h.id).all()
    expiry = []
    forecasts = []
    for b in batches:
        if b.expiry and b.quantity > 0:
            remaining = (date.fromisoformat(b.expiry) - today).days
            if remaining <= h.expiry_days:
                expiry.append(batch_dict(db, b) | {"days_left": remaining})
    products = db.query(Product).filter_by(household_id=h.id).all()
    predicted = fetch_forecasts(
        {p.id: [e for e in events if e.product_id == p.id] for p in products}, today
    )
    for p in products:
        related = [b for b in batches if b.product_id == p.id]
        total = sum(b.quantity for b in related)
        usable = sum(
            b.quantity for b in related if not b.expiry or b.expiry >= today.isoformat()
        )
        forecast = predicted.get(p.id, UNAVAILABLE)
        rate = forecast["daily_rate"]
        left = round(usable / rate, 1) if rate and rate > 0 else None
        forecasts.append(
            {
                "product_id": p.id,
                "name": p.name,
                "unit": p.unit,
                "total": total,
                "usable": usable,
                "minimum": p.minimum,
                "lead_days": p.lead_days,
                "days_until_empty": left,
                "buy": usable <= p.minimum
                or (left is not None and left <= p.lead_days),
                **forecast,
            }
        )
    return {
        "expiry": sorted(expiry, key=lambda b: b["days_left"]),
        "forecasts": forecasts,
        "expiry_days": h.expiry_days,
        "as_of": today,
    }
