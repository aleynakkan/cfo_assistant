# app/routes/tax.py

from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user, get_current_company
from app.models.user import User
from app.models.company import Company
from app.models.tax import Tax, UserTax, TaxPayment
from app.schemas.tax import (
    TaxResponse,
    UserTaxConfig,
    UserTaxConfigBulk,
    UserTaxResponse,
    UpcomingTax,
    TaxPaymentCreate,
    TaxPaymentResponse,
)
from app.services.tax_scheduler import (
    seed_taxes,
    get_upcoming_taxes,
    check_and_create_notifications,
)

router = APIRouter(prefix="/taxes", tags=["taxes"])


# ── Vergi Türleri ──

@router.get("/", response_model=List[TaxResponse])
def list_taxes(db: Session = Depends(get_db)):
    """Tüm vergi türlerini listeler. İlk çağrıda seed eder."""
    taxes = db.query(Tax).all()
    if not taxes:
        seed_taxes(db)
        taxes = db.query(Tax).all()
    return taxes


# ── Kullanıcı Vergi Konfigürasyonu ──

@router.get("/my", response_model=List[UserTaxResponse])
def get_my_tax_config(
    current_user: User = Depends(get_current_user),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Kullanıcının vergi konfigürasyonlarını döndürür."""
    user_taxes = (
        db.query(UserTax, Tax)
        .join(Tax, UserTax.tax_id == Tax.id)
        .filter(
            UserTax.user_id == current_user.id,
            UserTax.company_id == company.id,
        )
        .all()
    )
    result = []
    for ut, tax in user_taxes:
        result.append(UserTaxResponse(
            id=ut.id,
            tax_id=tax.id,
            tax_name=tax.name,
            tax_code=tax.code,
            active=ut.active,
            frequency=ut.frequency,
            due_day=ut.due_day,
            due_month=ut.due_month,
        ))
    return result


@router.post("/my", response_model=dict)
def save_my_tax_config(
    payload: UserTaxConfigBulk,
    current_user: User = Depends(get_current_user),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Kullanıcının vergi konfigürasyonunu toplu kaydet (upsert)."""
    for cfg in payload.taxes:
        existing = (
            db.query(UserTax)
            .filter(
                UserTax.user_id == current_user.id,
                UserTax.company_id == company.id,
                UserTax.tax_id == cfg.tax_id,
            )
            .first()
        )
        if existing:
            existing.active = cfg.active
            existing.frequency = cfg.frequency
            existing.due_day = cfg.due_day
            existing.due_month = cfg.due_month
        else:
            new_ut = UserTax(
                user_id=current_user.id,
                company_id=company.id,
                tax_id=cfg.tax_id,
                active=cfg.active,
                frequency=cfg.frequency,
                due_day=cfg.due_day,
                due_month=cfg.due_month,
            )
            db.add(new_ut)
    db.commit()
    return {"status": "ok", "count": len(payload.taxes)}


# ── Yaklaşan Vergiler ──

@router.get("/upcoming", response_model=List[UpcomingTax])
def get_upcoming(
    days: int = 14,
    current_user: User = Depends(get_current_user),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Önümüzdeki X gündeki vergi vadelerini döndürür."""
    items = get_upcoming_taxes(db, current_user.id, company.id, days)
    return items


# ── Ödeme Kaydı ──

@router.post("/payments", response_model=TaxPaymentResponse)
def mark_as_paid(
    payload: TaxPaymentCreate,
    current_user: User = Depends(get_current_user),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Vergiyi ödendi olarak işaretle."""
    # Duplikasyon kontrolü
    existing = (
        db.query(TaxPayment)
        .filter(
            TaxPayment.user_id == current_user.id,
            TaxPayment.tax_id == payload.tax_id,
            TaxPayment.period == payload.period,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu dönem için ödeme zaten kaydedildi.",
        )

    payment = TaxPayment(
        user_id=current_user.id,
        company_id=company.id,
        tax_id=payload.tax_id,
        period=payload.period,
        paid_date=payload.paid_date or date.today(),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


# ── Bildirim Tetikleme ──

@router.post("/check-notifications", response_model=dict)
def trigger_notification_check(
    current_user: User = Depends(get_current_user),
    company: Company = Depends(get_current_company),
    db: Session = Depends(get_db),
):
    """Kullanıcı için vergi bildirimlerini kontrol eder ve oluşturur."""
    count = check_and_create_notifications(db, current_user.id, company.id)
    return {"created": count}
