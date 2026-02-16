# app/schemas/counterparty.py

from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, List
import re


# ── Counterparty ──

def validate_vkn(vkn: Optional[str]) -> Optional[str]:
    """Validate Turkish Tax ID (VKN): exactly 10 digits, optional checksum."""
    if vkn is None or vkn == "":
        return None
    vkn = vkn.strip()
    if not re.match(r"^\d{10}$", vkn):
        raise ValueError("VKN must be exactly 10 digits")
    # Optional: Turkish VKN checksum algorithm
    digits = [int(d) for d in vkn]
    total = 0
    for i in range(9):
        tmp = (digits[i] + (9 - i)) % 10
        total += (tmp * (2 ** (9 - i))) % 9
        if tmp == 0 and (9 - i) != 1:
            total += 9
    check = (10 - (total % 10)) % 10
    if check != digits[9]:
        raise ValueError("VKN checksum is invalid")
    return vkn


class CounterpartyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(default="OTHER")  # CUSTOMER / SUPPLIER / OTHER
    vkn: Optional[str] = Field(None, max_length=10, description="Turkish Tax ID (10 digits)")
    notes: Optional[str] = None

    @field_validator("vkn")
    @classmethod
    def check_vkn(cls, v):
        return validate_vkn(v)


class CounterpartyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    type: Optional[str] = None
    vkn: Optional[str] = Field(None, max_length=10, description="Turkish Tax ID (10 digits)")
    notes: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("vkn")
    @classmethod
    def check_vkn(cls, v):
        return validate_vkn(v)


class CounterpartyResponse(BaseModel):
    id: int
    company_id: int
    name: str
    type: str
    vkn: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CounterpartyWithAliases(CounterpartyResponse):
    aliases: List["AliasResponse"] = []


# ── Alias ──

class AliasCreate(BaseModel):
    alias: str = Field(..., min_length=1, max_length=500)


class AliasResponse(BaseModel):
    id: int
    counterparty_id: int
    alias: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Analytics ──

class CounterpartyMetrics(BaseModel):
    counterparty_id: int
    counterparty_name: str
    counterparty_type: str
    counterparty_vkn: Optional[str] = None
    total_planned: float = 0.0
    total_paid: float = 0.0
    outstanding: float = 0.0
    match_count: int = 0
    avg_payment_delay_days: Optional[float] = None
    on_time_rate: Optional[float] = None   # 0.0 - 1.0
    late_rate: Optional[float] = None      # 0.0 - 1.0
    risk_score: Optional[float] = None     # 0.0 - 100.0


# ── Backfill ──

class BackfillResult(BaseModel):
    created: int = 0
    skipped: int = 0
    linked: int = 0
    errors: List[str] = []


# Rebuild forward ref
CounterpartyWithAliases.model_rebuild()
