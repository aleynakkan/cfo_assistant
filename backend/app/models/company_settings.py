from sqlalchemy import Column, Integer, Numeric, Date, ForeignKey
from app.core.database import Base


class CompanyFinancialSettings(Base):
    __tablename__ = "company_financial_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), unique=True, nullable=False)
    initial_balance = Column(Numeric(18, 2), nullable=False)
    initial_balance_date = Column(Date, nullable=False)
