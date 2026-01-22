# backend/app/services/cash_position.py

from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.transaction import Transaction


def calculate_estimated_cash(
    db: Session,
    company_id: int,
    initial_balance: float,
    initial_balance_date: date,
) -> float:
    """
    Başlangıç bakiyesine göre tahmini nakit pozisyonunu hesapla.
    
    Formula:
    Tahmini Nakit = Başlangıç Bakiyesi + Gelirler - Giderler
    (Başlangıç tarihinden bugüne kadar)
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Başlangıç tarihinden bugüne kadar Gelirler
    income = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.company_id == company_id,
        Transaction.direction == "in",
        Transaction.date >= initial_balance_date,
    ).scalar()

    # Başlangıç tarihinden bugüne kadar Giderler
    expense = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.company_id == company_id,
        Transaction.direction == "out",
        Transaction.date >= initial_balance_date,
    ).scalar()

    # Decimal değerleri float'a çevir
    income_float = float(income or 0)
    expense_float = float(expense or 0)
    
    logger.info(f"Cash calculation: initial={initial_balance}, income={income_float}, expense={expense_float}, result={initial_balance + income_float - expense_float}")
    
    return float(initial_balance + income_float - expense_float)
