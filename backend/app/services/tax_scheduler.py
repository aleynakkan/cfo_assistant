# app/services/tax_scheduler.py
"""
Vergi hatırlatma servisi — yaklaşan vergi tarihlerini hesaplar ve bildirim oluşturur.
"""

from datetime import date, timedelta
from sqlalchemy.orm import Session

from app.models.tax import Tax, UserTax, TaxPayment
from app.models.notification import Notification


# ── V1 Sabit Vergi Türleri ──

SEED_TAXES = [
    {"name": "KDV", "code": "kdv"},
    {"name": "Muhtasar", "code": "muhtasar"},
    {"name": "Damga Vergisi", "code": "damga"},
    {"name": "KDV2", "code": "kdv2"},
    {"name": "Geçici Vergi", "code": "gecici_vergi"},
    {"name": "Kurumlar Vergisi", "code": "kurumlar_vergisi"},
]


def seed_taxes(db: Session):
    """Veritabanında sabit vergi türlerini oluşturur (yoksa)."""
    for tax_data in SEED_TAXES:
        existing = db.query(Tax).filter(Tax.code == tax_data["code"]).first()
        if not existing:
            db.add(Tax(**tax_data))
    db.commit()


def compute_next_due_date(frequency: str, due_day: int, due_month: int | None, ref_date: date | None = None) -> date:
    """
    Verilen frekans ve vade gününe göre bir sonraki ödeme tarihini hesaplar.
    ref_date: Hesaplamayı bu tarihe göre yap (default: bugün).
    """
    today = ref_date or date.today()

    if frequency == "monthly":
        # Bu ayın due_day'i geçmediyse bu ay, geçtiyse gelecek ay
        try:
            candidate = today.replace(day=due_day)
        except ValueError:
            # Ay sonu taşması (31 Şubat gibi) — ayın son günü
            import calendar
            last_day = calendar.monthrange(today.year, today.month)[1]
            candidate = today.replace(day=min(due_day, last_day))

        if candidate < today:
            # Gelecek ay
            if today.month == 12:
                candidate = date(today.year + 1, 1, due_day)
            else:
                import calendar
                next_month = today.month + 1
                last_day = calendar.monthrange(today.year, next_month)[1]
                candidate = date(today.year, next_month, min(due_day, last_day))
        return candidate

    elif frequency == "quarterly":
        # Çeyrek aylar: Ocak(1), Nisan(4), Temmuz(7), Ekim(10)
        quarter_months = [1, 4, 7, 10]
        for qm in quarter_months:
            try:
                candidate = date(today.year, qm, due_day)
            except ValueError:
                import calendar
                last_day = calendar.monthrange(today.year, qm)[1]
                candidate = date(today.year, qm, min(due_day, last_day))
            if candidate >= today:
                return candidate
        # Hepsi geçmiş → gelecek yılın ilk çeyreği
        return date(today.year + 1, 1, due_day)

    elif frequency == "yearly":
        month = due_month or 4  # Varsayılan: Nisan
        try:
            candidate = date(today.year, month, due_day)
        except ValueError:
            import calendar
            last_day = calendar.monthrange(today.year, month)[1]
            candidate = date(today.year, month, min(due_day, last_day))
        if candidate < today:
            try:
                candidate = date(today.year + 1, month, due_day)
            except ValueError:
                import calendar
                last_day = calendar.monthrange(today.year + 1, month)[1]
                candidate = date(today.year + 1, month, min(due_day, last_day))
        return candidate

    return today


def get_period_key(frequency: str, due_date: date) -> str:
    """Vergi dönemini string olarak döndürür (duplikasyon kontrolü için)."""
    if frequency == "monthly":
        return due_date.strftime("%Y-%m")
    elif frequency == "quarterly":
        quarter = (due_date.month - 1) // 3 + 1
        return f"{due_date.year}-Q{quarter}"
    elif frequency == "yearly":
        return str(due_date.year)
    return due_date.strftime("%Y-%m")


def get_upcoming_taxes(db: Session, user_id: int, company_id: int, days_ahead: int = 14):
    """Önümüzdeki X gün içindeki vergi vadelerini döndürür."""
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)

    user_taxes = (
        db.query(UserTax, Tax)
        .join(Tax, UserTax.tax_id == Tax.id)
        .filter(UserTax.user_id == user_id, UserTax.company_id == company_id, UserTax.active == True)
        .all()
    )

    results = []
    for ut, tax in user_taxes:
        next_due = compute_next_due_date(ut.frequency, ut.due_day, ut.due_month)
        if next_due > cutoff:
            continue

        period = get_period_key(ut.frequency, next_due)
        days_left = (next_due - today).days

        # Ödendi mi kontrol et
        payment = (
            db.query(TaxPayment)
            .filter(
                TaxPayment.user_id == user_id,
                TaxPayment.tax_id == tax.id,
                TaxPayment.period == period,
            )
            .first()
        )

        results.append({
            "tax_id": tax.id,
            "tax_name": tax.name,
            "tax_code": tax.code,
            "due_date": next_due,
            "days_left": days_left,
            "is_paid": payment is not None,
            "period": period,
        })

    # Yakına göre sırala
    results.sort(key=lambda x: x["days_left"])
    return results


def check_and_create_notifications(db: Session, user_id: int, company_id: int):
    """
    Kullanıcının vergi takvimini kontrol eder ve gerekli bildirimleri oluşturur.
    Duplikasyon kontrolü yapar — aynı vergi+dönem+gün kalan için tekrar bildirim oluşturmaz.
    """
    today = date.today()

    user_taxes = (
        db.query(UserTax, Tax)
        .join(Tax, UserTax.tax_id == Tax.id)
        .filter(UserTax.user_id == user_id, UserTax.company_id == company_id, UserTax.active == True)
        .all()
    )

    notification_triggers = [7, 3, 0]  # gün kala
    created_count = 0

    for ut, tax in user_taxes:
        next_due = compute_next_due_date(ut.frequency, ut.due_day, ut.due_month)
        period = get_period_key(ut.frequency, next_due)
        days_left = (next_due - today).days

        # Ödendi mi kontrol et
        payment = (
            db.query(TaxPayment)
            .filter(
                TaxPayment.user_id == user_id,
                TaxPayment.tax_id == tax.id,
                TaxPayment.period == period,
            )
            .first()
        )
        if payment:
            continue  # Ödenmişse bildirim gerekmez

        # Gecikmiş
        if days_left < 0:
            _title = f"{tax.name} gecikmiş olabilir"
            _message = f"{tax.name} ödemeniz gecikmiş olabilir. (Vade: {next_due.strftime('%d.%m.%Y')})"
            _key = f"tax_overdue_{tax.id}_{period}"
        elif days_left in notification_triggers:
            if days_left == 0:
                _title = f"Bugün {tax.name} ödeme günü"
                _message = f"Bugün {tax.name} ödeme günü."
            else:
                _title = f"{tax.name} ödemenize {days_left} gün kaldı"
                _message = f"{tax.name} ödemenize {days_left} gün kaldı."
            _key = f"tax_reminder_{tax.id}_{period}_{days_left}"
        else:
            continue

        # Duplikasyon kontrolü: aynı mesaj + aynı kullanıcı + bugün
        existing = (
            db.query(Notification)
            .filter(
                Notification.user_id == user_id,
                Notification.type == "tax_reminder",
                Notification.title == _title,
                Notification.related_entity_type == "tax",
                Notification.related_entity_id == tax.id,
            )
            .first()
        )
        if existing:
            continue

        notification = Notification(
            user_id=user_id,
            company_id=company_id,
            type="tax_reminder",
            title=_title,
            message=_message,
            related_entity_type="tax",
            related_entity_id=tax.id,
        )
        db.add(notification)
        created_count += 1

    if created_count > 0:
        db.commit()

    return created_count
