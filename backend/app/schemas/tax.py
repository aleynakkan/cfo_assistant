# app/schemas/tax.py

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime


# ── Tax Types ──

class TaxResponse(BaseModel):
    id: int
    name: str
    code: str

    class Config:
        from_attributes = True


# ── User Tax Configuration ──

class UserTaxConfig(BaseModel):
    """Tek bir vergi yapılandırması."""
    tax_id: int
    active: bool = True
    frequency: str = Field(..., pattern="^(monthly|quarterly|yearly)$")
    due_day: int = Field(..., ge=1, le=31)
    due_month: Optional[int] = Field(None, ge=1, le=12)


class UserTaxConfigBulk(BaseModel):
    """Toplu vergi yapılandırması kayıt/güncelleme."""
    taxes: List[UserTaxConfig]


class UserTaxResponse(BaseModel):
    id: int
    tax_id: int
    tax_name: Optional[str] = None
    tax_code: Optional[str] = None
    active: bool
    frequency: str
    due_day: int
    due_month: Optional[int] = None

    class Config:
        from_attributes = True


# ── Upcoming Tax ──

class UpcomingTax(BaseModel):
    tax_id: int
    tax_name: str
    tax_code: str
    due_date: date
    days_left: int
    is_paid: bool = False
    period: str


# ── Tax Payment ──

class TaxPaymentCreate(BaseModel):
    tax_id: int
    period: str


class TaxPaymentResponse(BaseModel):
    id: int
    tax_id: int
    period: str
    paid_date: date
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Notification ──

class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
