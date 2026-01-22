# backend/app/routes/company_settings.py

from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.deps import get_db, get_current_company
from app.models.company import Company
from app.models.company_settings import CompanyFinancialSettings
from app.models.transaction import Transaction
from app.services.cash_position import calculate_estimated_cash

router = APIRouter()


class InitialBalanceCreate(BaseModel):
    initial_balance: float
    initial_balance_date: date


class InitialBalanceOut(InitialBalanceCreate):
    pass


class CashPositionOut(BaseModel):
    initial_balance: float
    initial_balance_date: date
    estimated_cash: float
    estimated_cash_30_days_ago: float  # 30 gün önceki tahmini nakit
    change_30_days: float  # Değişim tutarı
    change_30_days_percent: float  # Değişim yüzdesi


@router.get("/initial-balance", response_model=InitialBalanceOut)
def get_initial_balance(
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Şirketin başlangıç bakiyesi bilgisini getir.
    """
    settings = (
        db.query(CompanyFinancialSettings)
        .filter(CompanyFinancialSettings.company_id == company.id)
        .first()
    )
    if not settings:
        raise HTTPException(
            status_code=404, detail="Başlangıç bakiyesi tanımlı değil"
        )
    return InitialBalanceOut(
        initial_balance=float(settings.initial_balance),
        initial_balance_date=settings.initial_balance_date,
    )


@router.post("/initial-balance", response_model=InitialBalanceOut)
def set_initial_balance(
    payload: InitialBalanceCreate,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Şirketin başlangıç bakiyesini kaydet/güncelle.
    """
    settings = (
        db.query(CompanyFinancialSettings)
        .filter(CompanyFinancialSettings.company_id == company.id)
        .first()
    )

    if settings:
        settings.initial_balance = payload.initial_balance
        settings.initial_balance_date = payload.initial_balance_date
    else:
        settings = CompanyFinancialSettings(
            company_id=company.id,
            initial_balance=payload.initial_balance,
            initial_balance_date=payload.initial_balance_date,
        )
        db.add(settings)

    db.commit()
    db.refresh(settings)

    return InitialBalanceOut(
        initial_balance=float(settings.initial_balance),
        initial_balance_date=settings.initial_balance_date,
    )


@router.get("/cash-position", response_model=CashPositionOut)
def get_cash_position(
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Tahmini nakit pozisyonunu getir (bugün + 30 gün öncesi karşılaştırma).
    = Başlangıç bakiyesi + (Gelirler - Giderler)
    """
    from datetime import timedelta
    import logging
    logger = logging.getLogger(__name__)
    
    settings = (
        db.query(CompanyFinancialSettings)
        .filter(CompanyFinancialSettings.company_id == company.id)
        .first()
    )

    if not settings:
        raise HTTPException(
            status_code=404, detail="Başlangıç bakiyesi tanımlı değil"
        )

    # Debug: transaction sayısını kontrol et
    tx_count = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == company.id,
        Transaction.date >= settings.initial_balance_date,
    ).scalar()
    logger.info(f"Company {company.id}: {tx_count} transactions since {settings.initial_balance_date}")

    # Bugünün tahmini nakit pozisyonu
    estimated = calculate_estimated_cash(
        db,
        company.id,
        float(settings.initial_balance),
        settings.initial_balance_date,
    )
    logger.info(f"Company {company.id}: initial={settings.initial_balance}, estimated={estimated}")

    # 30 gün önceki tahmini nakit pozisyonu
    today = date.today()
    date_30_days_ago = today - timedelta(days=30)
    
    # 30 gün önceki günü bugün gibi hesapla
    # (Başlangıçtan 30 gün öncesine kadar işlemler)
    estimated_30_days_ago = calculate_estimated_cash(
        db,
        company.id,
        float(settings.initial_balance),
        settings.initial_balance_date,
    )
    
    # Ama 30 gün öncesiyle karşılaştırmak için, o tarihten bugüne kadar
    # yapılan işlemleri çıkarmalıyız
    income_last_30_days = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.company_id == company.id,
        Transaction.direction == "in",
        Transaction.date > date_30_days_ago,
        Transaction.date <= today,
    ).scalar()
    
    expense_last_30_days = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.company_id == company.id,
        Transaction.direction == "out",
        Transaction.date > date_30_days_ago,
        Transaction.date <= today,
    ).scalar()
    
    net_30_days = float(income_last_30_days or 0) - float(expense_last_30_days or 0)
    estimated_30_days_ago = estimated - net_30_days
    
    # Değişim hesapla
    change = estimated - estimated_30_days_ago
    change_percent = (change / estimated_30_days_ago * 100) if estimated_30_days_ago != 0 else 0

    return CashPositionOut(
        initial_balance=float(settings.initial_balance),
        initial_balance_date=settings.initial_balance_date,
        estimated_cash=estimated,
        estimated_cash_30_days_ago=estimated_30_days_ago,
        change_30_days=change,
        change_30_days_percent=change_percent,
    )
