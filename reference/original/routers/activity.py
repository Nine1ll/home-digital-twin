from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("", response_model=list[schemas.ActivityLogResponse])
def get_activity(
    item_id: int | None = None,
    action: str | None = None,
    limit: int = 50,
    offset: int = 0,                 # PO 요청: 페이지네이션
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.ActivityLog).filter(
        models.ActivityLog.household_id == current_user.household_id
    )
    if item_id is not None:
        query = query.filter(models.ActivityLog.item_id == item_id)
    if action is not None:
        query = query.filter(models.ActivityLog.action == action)

    logs = query.order_by(
        models.ActivityLog.created_at.desc()
    ).offset(offset).limit(limit).all()

    # PO 요청 필드(item_name, actor_email) 채우기
    results = []
    for log in logs:
        r = schemas.ActivityLogResponse.model_validate(log)
        # 물건 이름
        if log.item_id is not None:
            item = db.query(models.Item).filter(
                models.Item.id == log.item_id
            ).first()
            r.item_name = item.name if item else None
        # 행위자 이메일
        user = db.query(models.User).filter(
            models.User.id == log.user_id
        ).first()
        r.actor_email = user.email if user else None
        results.append(r)
    return results