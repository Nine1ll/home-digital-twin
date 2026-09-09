from datetime import date
from typing import Literal
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator

class Signup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    household_name: str = Field(default='우리집', min_length=1, max_length=100)
    invite_code: str | None = None
    @field_validator('password')
    @classmethod
    def password_bytes(cls, v):
        if len(v.encode()) > 72: raise ValueError('비밀번호는 UTF-8 72바이트 이하로 입력하세요')
        return v

class LocationInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: int | None = None
    kind: Literal['room','furniture','storage'] = 'room'
    x: float = Field(default=0, ge=0, le=19, allow_inf_nan=False)
    y: float = Field(default=0, ge=0, le=19, allow_inf_nan=False)
    width: float = Field(default=4, ge=.5, le=20, allow_inf_nan=False)
    height: float = Field(default=3, ge=.5, le=20, allow_inf_nan=False)
    @field_validator('name')
    @classmethod
    def not_blank(cls, v):
        if not v.strip(): raise ValueError('이름을 입력하세요')
        return v.strip()
    @model_validator(mode='after')
    def fits_canvas(self):
        if self.x+self.width > 20 or self.y+self.height > 20:
            raise ValueError('공간은 20 × 20 범위 안에 배치하세요')
        return self

class ItemInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    product_id: int | None = None
    barcode: str | None = Field(default=None, pattern=r'^\d{8,14}$')
    location_id: int
    quantity: int = Field(ge=1, le=100000)
    expiry_date: date | None = None
    unit: str = Field(default='개', min_length=1, max_length=20)
    @field_validator('name','unit')
    @classmethod
    def not_blank(cls, v):
        if not v.strip(): raise ValueError('이름과 단위를 입력하세요')
        return v.strip()

class ActionInput(BaseModel):
    action: Literal['consume','discard','move','adjust']
    quantity: int = Field(ge=0, le=100000)
    destination_id: int | None = None
    note: str = Field(default='', max_length=300)

class ProductInput(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    minimum: int = Field(ge=0, le=100000)
    lead_days: int = Field(ge=0, le=90)
    @field_validator('name')
    @classmethod
    def not_blank(cls,v):
        if not v.strip(): raise ValueError('이름을 입력하세요')
        return v.strip()

class SettingsInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    expiry_days: int = Field(ge=0, le=90)
