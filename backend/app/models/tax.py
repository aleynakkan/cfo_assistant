# app/models/tax.py

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Date, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Tax(Base):
    """Sabit vergi türleri tablosu (sistem tarafından seed edilir)."""
    __tablename__ = "taxes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    code = Column(String, nullable=False, unique=True)


class UserTax(Base):
    """Kullanıcının aktif vergi yapılandırması."""
    __tablename__ = "user_taxes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    tax_id = Column(Integer, ForeignKey("taxes.id"), nullable=False)
    active = Column(Boolean, default=True)
    frequency = Column(String, nullable=False)       # monthly, quarterly, yearly
    due_day = Column(Integer, nullable=False)          # 1-31
    due_month = Column(Integer, nullable=True)         # 1-12 (sadece yearly için)


class TaxPayment(Base):
    """Kullanıcının yaptığı vergi ödemeleri."""
    __tablename__ = "tax_payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    tax_id = Column(Integer, ForeignKey("taxes.id"), nullable=False)
    period = Column(String, nullable=False)            # "2026-03", "2026-Q1", "2026"
    paid_date = Column(Date, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
