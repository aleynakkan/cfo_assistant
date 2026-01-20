from sqlalchemy import Column, String, Date, DateTime, Numeric, Integer, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class PlannedCashflowItem(Base):
    __tablename__ = "planned_cashflow_items"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)  # INVOICE / CHEQUE / NOTE / OTHER
    direction = Column(String, nullable=False)  # in / out
    amount = Column(Numeric(18, 2), nullable=False)
    due_date = Column(Date, nullable=False)

    counterparty = Column(String, nullable=True)
    reference_no = Column(String, nullable=True)

    status = Column(String, nullable=False, default="OPEN")  # OPEN / PARTIAL / SETTLED / CANCELLED

    # Matching / settlement fields
    settled_amount = Column(Numeric(18, 2), nullable=False, default=0)
    remaining_amount = Column(Numeric(18, 2), nullable=False, default=0)

    source = Column(String, nullable=True)     # manual, gib, erp...
    external_id = Column(String, nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
