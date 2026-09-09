from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter(prefix="/locations", tags=["locations"])


def build_path(location: models.Location, db: Session) -> str:
    """부모를 타고 올라가며 전체 경로 문자열을 만든다. 예: '주방 > 김치냉장고 > 2번 칸'"""
    names = [location.name]
    current = location
    seen = {location.id}
    while current.parent_id is not None:
        if current.parent_id in seen:   # 이미 방문한 곳이면 순환! 멈춤
            break
        current = db.query(models.Location).filter(
            models.Location.id == current.parent_id
        ).first()
        if current is None:
            break
        seen.add(current.id)
        names.append(current.name)
    return " > ".join(reversed(names))   # 위에서부터 순서로


def get_location_path(item, db: Session) -> str | None:
    """물건(item)의 위치 경로 문자열을 반환한다. 위치가 없으면 None.
    검색·대시보드 등에서 반복되던 '위치 조회 + build_path' 패턴을 통합."""
    if item.location_id is None:
        return None
    location = db.query(models.Location).filter(
        models.Location.id == item.location_id
    ).first()
    return build_path(location, db) if location else None


# CREATE: 위치 생성
@router.post("", response_model=schemas.LocationResponse)
def create_location(
    data: schemas.LocationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 부모를 지정했다면, 그 부모가 내 가구의 위치인지 확인
    if data.parent_id is not None:
        parent = db.query(models.Location).filter(
            models.Location.id == data.parent_id,
            models.Location.household_id == current_user.household_id,
        ).first()
        if parent is None:
            raise HTTPException(status_code=404, detail="부모 위치를 찾을 수 없습니다")

    location = models.Location(
        household_id=current_user.household_id,
        name=data.name,
        parent_id=data.parent_id,
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    result = schemas.LocationResponse.model_validate(location)
    result.path = build_path(location, db)
    return result


# READ: 내 가구의 모든 위치 (경로 포함)
@router.get("", response_model=list[schemas.LocationResponse])
def get_locations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    locations = db.query(models.Location).filter(
        models.Location.household_id == current_user.household_id
    ).all()

    results = []
    for loc in locations:
        r = schemas.LocationResponse.model_validate(loc)
        r.path = build_path(loc, db)
        results.append(r)
    return results


# DELETE: 위치 삭제 (§2 - 물건이 있으면 막기)
@router.delete("/{location_id}")
def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    location = db.query(models.Location).filter(
        models.Location.id == location_id,
        models.Location.household_id == current_user.household_id,
    ).first()
    if location is None:
        raise HTTPException(status_code=404, detail="위치를 찾을 수 없습니다")

    # §2 [필수]: 물건이 든 위치는 삭제 거부
    item_count = db.query(models.Item).filter(
        models.Item.location_id == location_id
    ).count()
    if item_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"이 위치에 물건 {item_count}개가 있어 삭제할 수 없습니다",
        )

    # 하위 위치가 있어도 막기 (데이터 유실 방지)
    child_count = db.query(models.Location).filter(
        models.Location.parent_id == location_id
    ).count()
    if child_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"하위 위치가 {child_count}개 있어 삭제할 수 없습니다",
        )

    db.delete(location)
    db.commit()
    return {"message": f"위치 {location_id} 삭제 완료"}