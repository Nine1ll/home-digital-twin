from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import secrets

from database import get_db
import models
import schemas
from auth import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


# 회원가입: 사용자 + 가구를 함께 생성
@router.post("/signup", response_model=schemas.Token)
def signup(data: schemas.UserSignup, db: Session = Depends(get_db)):
    # 이메일 중복 확인
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다")

    # 가구 생성 (6자리 초대 코드 자동 발급)
    household = models.Household(
        name=data.household_name,
        invite_code=secrets.token_hex(3).upper(), # 6자리 코드 
    )
    db.add(household)
    db.flush() # commit 없이 household.id만 확보

    # 사용자 생성 (비밀번호는 해싱해서 저장)
    user = models.User(
        email=data.email,
        password_hash=hash_password(data.password),
        household_id=household.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 토큰 발급
    token = create_access_token({"user_id": user.id, "household_id": user.household_id})
    return {"access_token": token, "token_type": "bearer"}

# 로그인: 이메일+비밀번호 확인 후 토큰 발급
@router.post("/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    # 사용자가 없거나 비밀번화가 틀리면 (똑같이 에러 메시지로 처리 - 보안)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")

    token = create_access_token({"user_id": user.id, "household_id": user.household_id})
    return {"access_token": token, "token_type": "bearer"}

