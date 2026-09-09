"""가구 소유권, 낙관적 잠금, 재고 합산과 이력 저장의 공통 규칙."""

from fastapi import HTTPException
from sqlalchemy import update
from .models import Location, Batch, Product, Activity


def owned(db, model, identity, user):
    row = db.get(model, identity)
    if row is None or row.household_id != user.household_id:
        raise HTTPException(404, "대상을 찾을 수 없습니다")
    return row


def path_for(db, location_id):
    names, seen = [], set()
    while location_id is not None and location_id not in seen:
        seen.add(location_id)
        loc = db.get(Location, location_id)
        if not loc:
            break
        names.append(loc.name)
        location_id = loc.parent_id
    return " > ".join(reversed(names))


def change_quantity(db, batch, delta):
    result = db.execute(
        update(Batch)
        .where(
            Batch.id == batch.id,
            Batch.version == batch.version,
            Batch.quantity + delta >= 0,
        )
        .values(quantity=Batch.quantity + delta, version=Batch.version + 1)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise HTTPException(409, "재고가 변경되었습니다. 새로고침 후 다시 시도하세요")
    db.refresh(batch)


def add_batch(db, user, product_id, location_id, expiry, quantity):
    batch = (
        db.query(Batch)
        .filter_by(product_id=product_id, location_id=location_id, expiry=expiry)
        .first()
    )
    if batch:
        change_quantity(db, batch, quantity)
    else:
        batch = Batch(
            household_id=user.household_id,
            product_id=product_id,
            location_id=location_id,
            expiry=expiry,
            quantity=quantity,
        )
        db.add(batch)
        db.flush()
    return batch


def log(
    db,
    user,
    batch,
    action,
    quantity,
    from_path="",
    to_path="",
    to_location_id=None,
    note="",
):
    product = db.get(Product, batch.product_id)
    db.add(
        Activity(
            household_id=user.household_id,
            user_id=user.id,
            product_id=product.id,
            batch_id=batch.id,
            product_name=product.name,
            action=action,
            quantity=quantity,
            from_path=from_path,
            to_path=to_path,
            to_location_id=to_location_id,
            note=note,
        )
    )


def batch_dict(db, batch):
    p = db.get(Product, batch.product_id)
    return {
        "id": batch.id,
        "product_id": p.id,
        "name": p.name,
        "barcode": p.barcode,
        "unit": p.unit,
        "quantity": batch.quantity,
        "expiry_date": batch.expiry or None,
        "location_id": batch.location_id,
        "location_path": path_for(db, batch.location_id),
    }
