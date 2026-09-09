import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from backend.db import Base
from backend.models import Household, Location, Product, Batch
from backend.inventory import change_quantity


def test_stale_writer_cannot_overwrite_new_quantity(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "concurrent.db"))
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        h = Household(name="집", invite_code="example")
        db.add(h)
        db.flush()
        loc = Location(household_id=h.id, name="주방")
        p = Product(household_id=h.id, name="우유", normalized_name="우유")
        db.add_all([loc, p])
        db.flush()
        batch = Batch(
            household_id=h.id,
            product_id=p.id,
            location_id=loc.id,
            quantity=5,
            expiry="",
        )
        db.add(batch)
        db.commit()
        identity = batch.id
    with Session(engine) as first, Session(engine) as second:
        a = first.get(Batch, identity)
        b = second.get(Batch, identity)
        change_quantity(first, a, -2)
        first.commit()
        with pytest.raises(HTTPException) as error:
            change_quantity(second, b, -1)
        assert error.value.status_code == 409
        second.rollback()
        assert second.get(Batch, identity).quantity == 3
    engine.dispose()
