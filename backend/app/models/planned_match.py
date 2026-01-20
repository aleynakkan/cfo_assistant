from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class PlannedMatch(Base):
    __tablename__ = "planned_matches"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)

    planned_item_id = Column(String, ForeignKey("planned_cashflow_items.id"), nullable=False, index=True)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=False, index=True)

    matched_amount = Column(Numeric(18, 2), nullable=False)
    match_type = Column(String, default="MANUAL", nullable=False)  # MANUAL / AUTO
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "planned_item_id", "transaction_id", name="uq_planned_match_unique"),
    )
