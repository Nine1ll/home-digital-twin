from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from backend.intelligence import consumption_forecast


def event(days, action, quantity=1):
    return SimpleNamespace(
        created_at=datetime.now(timezone.utc) - timedelta(days=days),
        action=action,
        quantity=quantity,
    )


def test_insufficient_and_discard_not_consumption():
    assert consumption_forecast([])["daily_rate"] is None
    assert (
        consumption_forecast([event(30, "receive"), event(20, "discard", 1000)])[
            "method"
        ]
        == "insufficient"
    )


def test_baseline_and_exclude_today():
    events = [event(14, "receive")] + [event(d, "consume") for d in range(1, 15)]
    f = consumption_forecast(
        events + [event(0, "consume", 100000), event(3, "discard", 100000)]
    )
    assert f["daily_rate"] == 1 and f["method"] == "moving_average"


def test_time_order_validation_and_ridge_selection():
    events = [event(60, "receive")] + [
        event(d, "consume", 61 - d) for d in range(1, 61)
    ]
    f = consumption_forecast(events)
    assert f["method"] == "ridge"
    assert f["validation_mae"]["ridge"] < f["validation_mae"]["baseline"]
    assert f["daily_rate"] > 40
