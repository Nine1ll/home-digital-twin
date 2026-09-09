"""관측 기록 기반 예측. 데이터 부족과 ML/기준선 사용을 명시한다."""

from datetime import datetime, timezone, timedelta
import math
import numpy as np
from sklearn.linear_model import Ridge
from .models import Activity, Product, Batch


def consumption_forecast(events, today=None):
    today = today or datetime.now(timezone.utc).date()
    if not events:
        return {
            "method": "insufficient",
            "daily_rate": None,
            "days_observed": 0,
            "reason": "소비 기록이 아직 없습니다",
        }
    start = min(e.created_at.date() for e in events)
    days = min((today - start).days, 90)  # 오늘은 아직 끝나지 않았으므로 학습에서 제외
    if days < 7:
        return {
            "method": "insufficient",
            "daily_rate": None,
            "days_observed": days,
            "reason": "완료된 7일 이상의 기록이 필요합니다",
        }
    first = today - timedelta(days=days)
    y = np.zeros(days)
    for e in events:
        i = (e.created_at.date() - first).days
        if e.action == "consume" and 0 <= i < days:
            y[i] += e.quantity
    if np.count_nonzero(y) < 3:
        return {
            "method": "insufficient",
            "daily_rate": None,
            "days_observed": days,
            "reason": "서로 다른 3일 이상의 소비 기록이 필요합니다",
        }
    baseline = float(np.mean(y[-14:]))
    result = {
        "method": "moving_average",
        "daily_rate": round(baseline, 3),
        "days_observed": days,
        "reason": "최근 14일 평균 소비량",
        "validation_mae": None,
    }
    if days >= 28 and np.count_nonzero(y) >= 8:

        def features(i):
            weekday = (first + timedelta(days=int(i))).weekday()
            return [
                i / 7,
                math.sin(2 * math.pi * weekday / 7),
                math.cos(2 * math.pi * weekday / 7),
            ]

        x = np.array([features(i) for i in range(days)])
        split = days - 7
        model = Ridge(alpha=1).fit(x[:split], y[:split])
        ml_mae = float(
            np.mean(np.abs(np.maximum(0, model.predict(x[split:])) - y[split:]))
        )
        base_mae = float(
            np.mean(np.abs(np.mean(y[max(0, split - 14) : split]) - y[split:]))
        )
        result["validation_mae"] = {
            "ridge": round(ml_mae, 3),
            "baseline": round(base_mae, 3),
        }
        if ml_mae < base_mae:
            model.fit(x, y)
            rate = float(
                np.maximum(
                    0,
                    model.predict(
                        np.array([features(i) for i in range(days, days + 7)])
                    ),
                ).mean()
            )
            result.update(
                method="ridge",
                daily_rate=round(rate, 3),
                reason="최근 7일 시간순 검증에서 평균 기준선보다 오차가 낮은 Ridge 모델",
            )
    return result


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
