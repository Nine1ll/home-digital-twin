from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import and_

# DB관련 import
from database import engine, Base, get_db
import models
import schemas
from routers import auth, locations, activity
from auth import get_current_user

from activity import log_activity
from routers.locations import build_path, get_location_path

from datetime import date   

# 앱 시작 시 모델대로 테이블 생성 (있으면 건너뜀)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Home Inventory API")

# CORS 설정: 프론트엔드가 이 API를 호출할 수 있게 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # 지금은 모든 출처 허용 (개발 단계)
    allow_credentials=True,
    allow_methods=["*"],           # GET, POST, DELETE 등 모두
    allow_headers=["*"],           # Authorization 헤더 등 모두
)

app.include_router(auth.router)
app.include_router(locations.router)
app.include_router(activity.router)

@app.get("/")
def read_root():
    return {"message": "집 물류 관리 서비스에 오신 걸 환영합니다"}

# CREATE: 새 아이템 등록 
@app.post("/items", response_model=schemas.ItemResponse)
def create_item(
    item: schemas.ItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # location_id가 내 가구의 실제 위치인지 검증 (데이터 무결성)
    location = db.query(models.Location).filter(
        models.Location.id == item.location_id,
        models.Location.household_id == current_user.household_id,
    ).first()
    if location is None:
        raise HTTPException(
            status_code=404,
            detail="지정한 위치를 찾을 수 없습니다",
        )
    
    # 3: 같은 가구+품목명+위치+유통기한이면 기존 배치 수량 증가
    existing = db.query(models.Item).filter(
        and_(
            models.Item.household_id == current_user.household_id,
            models.Item.name == item.name,
            models.Item.location_id == item.location_id,
            models.Item.expiry_date == item.expiry_date,
        )
    ).first()

    if existing:
        existing.quantity += item.quantity
        # §6 로그: 기존 배치에 수량 추가
        log_activity(db, current_user.household_id, current_user.id,
                     existing.id, "create", item.quantity)
        db.commit()
        db.refresh(existing)
        return existing

    new_item = models.Item(
        household_id=current_user.household_id,
        name=item.name,
        quantity=item.quantity,
        location_id=item.location_id,
        barcode=item.barcode,
        expiry_date=item.expiry_date
    )
    db.add(new_item)
    db.flush()   # new_item.id를 확보 (로그에 넣기 위해) - 저장 전에는 id가 없으니까 확보 필요
    # §6 로그: 신규 물건 등록
    log_activity(db, current_user.household_id, current_user.id,
                 new_item.id, "create", item.quantity)
    db.commit()
    db.refresh(new_item)
    return new_item


# READ All: 전체 아이템 조회
@app.get("/items", response_model=list[schemas.ItemResponse])
def get_items(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Item).filter(
        models.Item.household_id == current_user.household_id
    ).all()

# SEARCH: 이름으로 물건 검색 (§5 - 위치 경로 포함)
@app.get("/items/search", response_model=list[schemas.ItemSearchResult])
def search_items(
    q: str, # /items/search?q=우유처럼 URL에 붙여서 호출
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 이름에 검색어가 포함된 물건 (내 가구 것만)
    items = db.query(models.Item).filter(
        models.Item.household_id == current_user.household_id,
        models.Item.name.contains(q), # SQL의 LIKE '%우유%'로 변환
    ).all()

    results = []
    for item in items:
        r = schemas.ItemSearchResult.model_validate(item)
        # 위치 경로 채우기
        r.location_path = get_location_path(item, db)
        results.append(r)
    return results

# 유통기한 대시보드 (§7 - 임박/만료 물건 모아보기)
@app.get("/items/expiring", response_model=list[schemas.ExpiryItem])
def get_expiring_items(
    within_days: int = 3,   # 며칠 이내를 '임박'으로 볼지 (기본 3일)
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today()

    # 유통기한이 있는 물건만 (내 가구, 수량 1 이상)
    items = db.query(models.Item).filter(
        models.Item.household_id == current_user.household_id,
        models.Item.expiry_date.isnot(None),
        models.Item.quantity > 0,
    ).all()

    results = []
    for item in items:
        days_left = (item.expiry_date - today).days
        if days_left <= within_days:
            location = db.query(models.Location).filter(
                models.Location.id == item.location_id
            ).first()
            r = schemas.ExpiryItem(
                id=item.id,
                name=item.name,
                quantity=item.quantity,
                expiry_date=item.expiry_date,
                location_id=item.location_id,
                days_left=days_left,
                location_path=get_location_path(item, db),
            )
            results.append(r)

    # 급한 순서로 정렬 (많이 지난 것부터)
    results.sort(key=lambda x: x.days_left)
    return results

# READ One: 특정 아이템 조회
@app.get("/items/{item_id}", response_model=schemas.ItemResponse)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    item = db.query(models.Item).filter(
        models.Item.id == item_id,
        models.Item.household_id == current_user.household_id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    return item


# DELETE: 아이템 삭제
@app.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.Item).filter(
        models.Item.id == item_id,
        models.Item.household_id == current_user.household_id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    db.delete(item)
    db.commit()
    return {"message": f"아이템 {item_id} 삭제 완료"}


# CONSUME: 물건 꺼내기 (§6 - 수량 감소 + 로그)
@app.post("/items/{item_id}/consume", response_model=schemas.ItemResponse)
def consume_item(
    item_id: int,
    data: schemas.ItemConsume,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.Item).filter(
        models.Item.id == item_id,
        models.Item.household_id == current_user.household_id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다")

    # 재고보다 많이 꺼내려 하면 거부
    if data.quantity > item.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"재고({item.quantity}개)보다 많이 꺼낼 수 없습니다",
        )

    item.quantity -= data.quantity
    # §6 로그: 소비 (음수 delta로 기록)
    log_activity(db, current_user.household_id, current_user.id,
                 item.id, "consume", -data.quantity)
    db.commit()
    db.refresh(item)
    return item

