from sqlalchemy import Column, String, Date, DateTime, Numeric, Integer, ForeignKey, UniqueConstraint, UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    date = Column(Date, nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    direction = Column(String, nullable=False)  # "in" veya "out"
    category = Column(String, nullable=True)
    source = Column(String, nullable=False, default="MANUAL")  # MANUAL, EMAIL, EXCEL_UPLOAD
    source_id = Column(UUID(as_uuid=True), nullable=True)  # Reference to email_attachment.id for EMAIL source
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    imported_at = Column(DateTime(timezone=True), nullable=True)  # When imported via email/excel
    external_id = Column(String, nullable=True, index=True)
    
    # Composite unique constraint: external_id + direction + company_id
    __table_args__ = (
        UniqueConstraint('external_id', 'direction', 'company_id', name='uq_external_direction_company'),
    )

from pydantic import BaseModel, field_validator
from datetime import date, datetime
from decimal import Decimal

class TransactionSchema(BaseModel):
    id: str
    date: date
    description: str
    amount: Decimal
    direction: str
    category: str | None = None
    source: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True
    
    @field_validator('created_at', mode='before')
    @classmethod
    def validate_created_at(cls, v):
        if v is None:
            return datetime.now()
        return v

class TransactionCreate(BaseModel):
    date: date
    description: str
    amount: Decimal
    direction: str  # "in" veya "out"
    category: str | None = None

class TransactionCategoryUpdate(BaseModel):
    category: str | None = None

class ReconciliationInfo(BaseModel):
    status: str  # "PASS" or "FAIL"
    first_balance: float
    last_balance: float
    sum_signed_amount: float
    expected_last_balance: float
    difference: float
    tolerance: float = 0.05
    rows_seen: int
    rows_skipped: int

class AkbankUploadResponse(BaseModel):
    inserted: int
    duplicates: int
    errors: list
    reconciliation: ReconciliationInfo
