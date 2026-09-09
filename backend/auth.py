import os, secrets
from datetime import datetime, timezone, timedelta
import bcrypt
from jose import jwt, JWTError
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .db import get_db
from .models import User

SECRET = os.getenv('SECRET_KEY')
if not SECRET:
    if os.getenv('APP_ENV') == 'production':
        raise RuntimeError('운영 환경에 SECRET_KEY를 설정하세요')
    SECRET = secrets.token_urlsafe(48)  # 개발 서버 재시작 시 재로그인
if len(SECRET) < 32: raise RuntimeError('SECRET_KEY는 32자 이상이어야 합니다')
bearer = OAuth2PasswordBearer(tokenUrl='/api/auth/login')

def hash_password(value):
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()

def verify_password(value, hashed):
    try: return bcrypt.checkpw(value.encode(), hashed.encode())
    except ValueError: return False

def issue_token(user):
    return {'access_token': jwt.encode({'sub': str(user.id), 'exp': datetime.now(timezone.utc)+timedelta(hours=24)}, SECRET, algorithm='HS256'), 'token_type':'bearer'}

def current_user(token: str = Depends(bearer), db: Session = Depends(get_db)):
    try:
        claims = jwt.decode(token, SECRET, algorithms=['HS256'], options={'require_exp':True})
        user = db.get(User, int(claims['sub']))
        if not user: raise ValueError()
        return user
    except (JWTError, ValueError, KeyError, TypeError):
        raise HTTPException(401, '로그인이 필요합니다', headers={'WWW-Authenticate':'Bearer'})
