# app/models/planned_item_schema.py

from pydantic import BaseModel
from datetime import date, datetime
from decimal import Decimal


class PlannedItemBase(BaseModel):
    type: str               # INVOICE / CHEQUE / NOTE / OTHER
    direction: str          # in / out
    amount: Decimal
    due_date: date
    counterparty: str | None = None
    reference_no: str | None = None


class PlannedItemCreate(PlannedItemBase):
    pass


class PlannedItemResponse(PlannedItemBase):
    id: str
    status: str
    settled_amount: Decimal
    remaining_amount: Decimal
    created_at: datetime

    class Config:
        from_attributes = True


class PlannedMatchCreate(BaseModel):
    transaction_id: str
    matched_amount: Decimal
    match_type: str | None = None


class PlannedMatchResponse(BaseModel):
    id: str
    planned_item_id: str
    transaction_id: str
    matched_amount: Decimal
    match_type: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
