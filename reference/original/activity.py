from sqlalchemy.orm import Session
import models

def log_activity(
        db: Session,
        household_id: int,
        user_id: int,
        item_id: int | None,
        action: str,
        quantity_delta: int,
) -> None:
    """
    활동을 ActivityLog에 기록한다 (§6 append-only).
    action: 'create'(등록), 'consume'(꺼내기), 'delete'(삭제) 등
    quantity_delta: 수량 변화 (+2, -1 등)
    이 함수는 로그를 add만 하고 commit은 호출부에 맡긴다
    (호출부의 트랜잭션과 함께 커밋되도록).
    """
    log = models.ActivityLog(
        household_id=household_id,
        user_id=user_id,
        item_id=item_id,
        action=action,
        quantity_delta=quantity_delta,
    )
    db.add(log)