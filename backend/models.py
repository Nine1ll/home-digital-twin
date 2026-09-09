"""상품은 정체성, Batch는 위치/유통기한별 재고, Activity는 불변 기록."""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, ForeignKey, UniqueConstraint, CheckConstraint, DateTime
from .db import Base

def now():
    return datetime.now(timezone.utc)

class Household(Base):
    __tablename__ = 'households'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    invite_code = Column(String(40), unique=True, nullable=False)
    expiry_days = Column(Integer, default=3, nullable=False)

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    household_id = Column(Integer, ForeignKey('households.id'), nullable=False, index=True)
    email = Column(String(254), unique=True, nullable=False)
    password_hash = Column(String, nullable=False)

class Location(Base):
    __tablename__ = 'locations'
    id = Column(Integer, primary_key=True)
    household_id = Column(Integer, ForeignKey('households.id'), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey('locations.id'), nullable=True)
    name = Column(String(100), nullable=False)
    kind = Column(String(20), nullable=False, default='room')
    x = Column(Float, nullable=False, default=0)
    y = Column(Float, nullable=False, default=0)
    width = Column(Float, nullable=False, default=4)
    height = Column(Float, nullable=False, default=3)

class Product(Base):
    __tablename__ = 'products'
    id = Column(Integer, primary_key=True)
    household_id = Column(Integer, ForeignKey('households.id'), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    normalized_name = Column(String(150), nullable=False)
    barcode = Column(String(32), nullable=True)
    unit = Column(String(20), nullable=False, default='개')
    minimum = Column(Integer, nullable=False, default=2)
    lead_days = Column(Integer, nullable=False, default=3)
    __table_args__ = (UniqueConstraint('household_id', 'normalized_name'), UniqueConstraint('household_id', 'barcode'))

class Batch(Base):
    __tablename__ = 'batches'
    id = Column(Integer, primary_key=True)
    household_id = Column(Integer, ForeignKey('households.id'), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey('locations.id'), nullable=False)
    expiry = Column(String(10), nullable=False, default='')
    quantity = Column(Integer, nullable=False)
    version = Column(Integer, nullable=False, default=0)
    __table_args__ = (UniqueConstraint('product_id', 'location_id', 'expiry'), CheckConstraint('quantity >= 0'))

class Activity(Base):
    __tablename__ = 'activities'
    id = Column(Integer, primary_key=True)
    household_id = Column(Integer, ForeignKey('households.id'), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey('batches.id'), nullable=False)
    product_name = Column(String(150), nullable=False)
    action = Column(String(20), nullable=False)
    quantity = Column(Integer, nullable=False)
    from_path = Column(String, nullable=False, default='')
    to_path = Column(String, nullable=False, default='')
    to_location_id = Column(Integer, ForeignKey('locations.id'), nullable=True)
    note = Column(String(300), nullable=False, default='')
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
