"""예측 서버. DB 없이 계산만 한다: 소비 기록을 받아 상품별 예측을 돌려준다.

API 서버만 호출하는 내부 서비스라 공유 비밀 헤더(X-Internal-Token)로 확인한다.
"""

import os
import secrets
from datetime import date, datetime
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from .forecast import consumption_forecast

TOKEN = os.getenv("ML_TOKEN", "")
if not TOKEN and os.getenv("APP_ENV") == "production":
    raise RuntimeError("운영 환경에 ML_TOKEN을 설정하세요")

app = FastAPI(title="Home Digital Twin ML")


class Event(BaseModel):
    created_at: datetime
    action: str = Field(max_length=20)
    quantity: int


class ForecastRequest(BaseModel):
    today: date
    products: dict[str, list[Event]]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast")
def forecast(data: ForecastRequest, x_internal_token: str = Header("")):
    if TOKEN and not secrets.compare_digest(x_internal_token, TOKEN):
        raise HTTPException(401, "invalid internal token")
    return {
        pid: consumption_forecast(events, data.today)
        for pid, events in data.products.items()
    }
