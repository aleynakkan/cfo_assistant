# app/models/counterparty.py

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.sql import func
from app.core.database import Base


class Counterparty(Base):
    __tablename__ = "counterparties"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)                # canonical display name
    normalized_name = Column(String, nullable=False)      # lowercase, stripped, for dedup
    type = Column(String, nullable=False, default="OTHER")  # CUSTOMER / SUPPLIER / OTHER
    vkn = Column(String(10), nullable=True)                  # Turkish Tax ID (Vergi Kimlik No)
    notes = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)  # soft delete
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("company_id", "normalized_name", name="uq_counterparty_company_name"),
        UniqueConstraint("company_id", "vkn", name="uq_counterparty_company_vkn"),
        Index("ix_counterparty_company", "company_id"),
    )


class CounterpartyAlias(Base):
    __tablename__ = "counterparty_aliases"

    id = Column(Integer, primary_key=True, index=True)
    counterparty_id = Column(Integer, ForeignKey("counterparties.id", ondelete="CASCADE"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    alias = Column(String, nullable=False)               # original bank description fragment
    normalized_alias = Column(String, nullable=False)     # lowercase, stripped
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("company_id", "normalized_alias", name="uq_alias_company_normalized"),
        Index("ix_alias_counterparty", "counterparty_id"),
        Index("ix_alias_company", "company_id"),
    )
