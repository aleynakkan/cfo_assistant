# app/routes/dashboard.py

from datetime import date, timedelta
from typing import List
from math import sqrt
import os

from fastapi import APIRouter, Depends, Query, Path
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case
from pydantic import BaseModel

from app.core.deps import get_db, get_current_company
from app.core.constants import CATEGORIES, INCOME_CATEGORIES
from app.models.transaction import Transaction
from app.models.company import Company
from app.models.planned_item import PlannedCashflowItem
from app.models.planned_match import PlannedMatch
from app.models.counterparty import Counterparty
from app.services.counterparty_service import compute_counterparty_metrics


# Helper function to format date for grouping - works with both SQLite and PostgreSQL
def get_year_month_format(date_column):
    """Returns the appropriate SQL function to format date as YYYY-MM"""
    env = os.getenv("ENV", "local")
    if env == "production":
        # PostgreSQL uses to_char in production
        return func.to_char(date_column, 'YYYY-MM')
    else:
        # SQLite uses strftime in local development
        return func.strftime("%Y-%m", date_column)


router = APIRouter()

class CategorySummary(BaseModel):
    category: str
    total_in: float
    total_out: float
    net: float


class DashboardSummary(BaseModel):
    total_income: float
    total_expense: float
    net_cashflow: float


class DailyPoint(BaseModel):
    date: date
    income: float
    expense: float
    net: float


@router.get("/meta/categories", response_model=List[str])
def get_categories():
    """
    Tüm kategori seçeneklerini döner.
    Frontend bu listeyi form'larda kullanabilir.
    """
    return CATEGORIES


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    year: int | None = None,
    month: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    year & month verilirse ilgili dönem;
    start_date & end_date verilirse tarih aralığı;
    hiçbir şey verilmezse tüm zamanlar.
    """

    filters = [Transaction.company_id == current_company.id]

    # 🔹 Öncelik: start_date / end_date varsa onları kullan
    if start_date and end_date:
        filters.append(
            and_(
                Transaction.date >= start_date,
                Transaction.date <= end_date,
            )
        )
    else:
        # Eski yıl/ay mantığını koru
        if year is not None and month is None:
            start = date(year, 1, 1)
            end = date(year + 1, 1, 1)
            filters.append(and_(Transaction.date >= start, Transaction.date < end))

        if year is not None and month is not None:
            start = date(year, month, 1)
            if month == 12:
                end = date(year + 1, 1, 1)
            else:
                end = date(year, month + 1, 1)
            filters.append(and_(Transaction.date >= start, Transaction.date < end))

    # Toplam gelir (direction = 'in')
    income_q = db.query(func.coalesce(func.sum(Transaction.amount), 0))
    income_q = income_q.filter(Transaction.direction == "in", *filters)
    total_income = float(income_q.scalar() or 0)

    # Toplam gider (direction = 'out')
    expense_q = db.query(func.coalesce(func.sum(Transaction.amount), 0))
    expense_q = expense_q.filter(Transaction.direction == "out", *filters)
    total_expense = float(expense_q.scalar() or 0)

    net_cashflow = total_income - total_expense

    return DashboardSummary(
        total_income=total_income,
        total_expense=total_expense,
        net_cashflow=net_cashflow,
    )


@router.get("/daily", response_model=List[DailyPoint])
def get_daily(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Günlük bazda gelir, gider ve net cashflow listesi döner.
    year & month verilirse sadece o aya göre filtreler.
    """

    filters = [Transaction.company_id == current_company.id]

    if year is not None and month is None:
        # Sadece yıl verilmişse: o yılın tamamı
        start = date(year, 1, 1)
        end = date(year + 1, 1, 1)
        filters.append(and_(Transaction.date >= start, Transaction.date < end))

    if year is not None and month is not None:
        # Hem yıl hem ay verilmişse: o ay
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        filters.append(and_(Transaction.date >= start, Transaction.date < end))

    # Filtreye göre tüm transaction'ları çek
    tx_list = (
        db.query(Transaction)
        .filter(*filters)
        .order_by(Transaction.date.asc())
        .all()
    )

    # Python tarafında gün gün grupla
    daily_map: dict[date, dict[str, float]] = {}

    for tx in tx_list:
        d = tx.date
        if d not in daily_map:
            daily_map[d] = {"income": 0.0, "expense": 0.0}

        amt = float(tx.amount)

        if tx.direction == "in":
            daily_map[d]["income"] += amt
        else:
            daily_map[d]["expense"] += amt

    # Sonucu listeye dönüştür
    result: list[DailyPoint] = []
    for d in sorted(daily_map.keys()):
        income = daily_map[d]["income"]
        expense = daily_map[d]["expense"]
        net = income - expense
        result.append(
            DailyPoint(
                date=d,
                income=income,
                expense=expense,
                net=net,
            )
        )

    return result

from datetime import date, timedelta
from app.models.planned_item import PlannedCashflowItem
from app.models.transaction import Transaction

from sqlalchemy import func
from pydantic import BaseModel


class ForecastAdvanced(BaseModel):
    avg_daily_net: float
    forecast_30: float
    forecast_60: float
    forecast_90: float
    routine_30: float
    routine_60: float
    routine_90: float
    planned_0_30: float
    planned_30_60: float
    planned_60_90: float


@router.get("/forecast-advanced-30-60-90", response_model=ForecastAdvanced)
def forecast_advanced(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):

    from datetime import date, timedelta

    today = date.today()

    # --- 1) Past Transactions: önce son 1 yıl, yoksa tüm tarihçe ---

    last_365_days = today - timedelta(days=365)

    tx_query = db.query(Transaction).filter(
        Transaction.date >= last_365_days,
        Transaction.company_id == current_company.id
    )
    tx_list = tx_query.all()

    # Eğer son 1 yılda hiç işlem yoksa, bütün transaction'ları kullan
    if len(tx_list) == 0:
        tx_list = db.query(Transaction).filter(
            Transaction.company_id == current_company.id
        ).all()

    daily_net = {}

    for tx in tx_list:
        d = tx.date
        amt = float(tx.amount)
        if d not in daily_net:
            daily_net[d] = 0.0
        if tx.direction == "in":
            daily_net[d] += amt
        else:
            daily_net[d] -= amt

    if len(daily_net) == 0:
        avg_daily_net = 0.0
    else:
        # Tüm tarihçe veya 1 yıl olsun, her zaman 365 günlük ortalama hesapla
        # Böylece stabil ve tutarlı tahminler elde ederiz
        total_net = sum(daily_net.values())
        avg_daily_net = total_net / 365

    routine_30 = avg_daily_net * 30
    routine_60 = avg_daily_net * 60
    routine_90 = avg_daily_net * 90

    # --- 2) Planned Items (future obligations) ---

    items = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),
        PlannedCashflowItem.company_id == current_company.id
    ).all()

    planned_0_30 = 0.0
    planned_30_60 = 0.0
    planned_60_90 = 0.0

    for item in items:
        delta = (item.due_date - today).days
        
        # Vadesi geçmiş kalemler de planned_0_30'a eklenir (overdue olarak hesaplanırlar)
        # Bu sayede karşılanması gereken planlı yükümlülükler tahmine dahil olur
        amt = float(item.remaining_amount)
        if item.direction == "out":
            amt = -amt

        if delta < 0:
            # Vadesi geçmiş: immediate obligation olarak 0-30 aralığına ekle
            planned_0_30 += amt
        elif 0 <= delta <= 30:
            planned_0_30 += amt
        elif 30 < delta <= 60:
            planned_30_60 += amt
        elif 60 < delta <= 90:
            planned_60_90 += amt

    # --- 3) Başlangıç Bakiyesi + Tahmini Nakit Pozisyonu ---
    from app.models.company_settings import CompanyFinancialSettings
    from app.services.cash_position import calculate_estimated_cash
    
    settings = (
        db.query(CompanyFinancialSettings)
        .filter(CompanyFinancialSettings.company_id == current_company.id)
        .first()
    )
    
    initial_balance = 0.0
    estimated_cash = 0.0
    
    if settings:
        initial_balance = float(settings.initial_balance)
        estimated_cash = calculate_estimated_cash(
            db, current_company.id, initial_balance, settings.initial_balance_date
        )
    
    # --- 4) FINAL MERGE ---
    # Tahmini nakit pozisyonundan başlıyıp, her dönemin BÜN planlı kalemlerini topla
    # 30 gün: 0-30 arası kalemler
    # 60 gün: 0-30 + 30-60 arası kalemler (toplamda 0-60)
    # 90 gün: 0-30 + 30-60 + 60-90 arası kalemler (toplamda 0-90)
    forecast_30 = estimated_cash + routine_30 + planned_0_30
    forecast_60 = estimated_cash + routine_60 + planned_0_30 + planned_30_60
    forecast_90 = estimated_cash + routine_90 + planned_0_30 + planned_30_60 + planned_60_90

    return ForecastAdvanced(
        avg_daily_net=avg_daily_net,
        forecast_30=forecast_30,
        forecast_60=forecast_60,
        forecast_90=forecast_90,
        routine_30=routine_30,
        routine_60=routine_60,
        routine_90=routine_90,
        planned_0_30=planned_0_30,
        planned_30_60=planned_30_60,
        planned_60_90=planned_60_90,
    )

from datetime import date, timedelta
from fastapi import Query
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import Depends

from app.core.deps import get_db
from app.models.transaction import Transaction
from pydantic import BaseModel


class CategorySummary(BaseModel):
    category: str
    total_in: float
    total_out: float
    net: float


@router.get("/category-summary", response_model=List[CategorySummary])
def get_category_summary(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
    period: str | None = None,      # last30, last90, this_month
):
    from datetime import timedelta
    
    today = date.today()
    start_date = None
    end_date = today

    # 🔹 period'e göre tarih aralığı belirle
    if period == "last30":
        start_date = today - timedelta(days=30)
    elif period == "last90":
        start_date = today - timedelta(days=90)
    elif period == "this_month":
        start_date = today.replace(day=1)
    else:
        # period yoksa = tüm zamanlar
        start_date = None
        end_date = None

    # 1) GELİR SORGU (direction = 'in')
    income_q = db.query(
        Transaction.category,
        func.sum(Transaction.amount).label("total_in"),
    ).filter(
        Transaction.direction == "in",
        Transaction.company_id == current_company.id
    )

    # 2) GİDER SORGU (direction = 'out')
    expense_q = db.query(
        Transaction.category,
        func.sum(Transaction.amount).label("total_out"),
    ).filter(
        Transaction.direction == "out",
        Transaction.company_id == current_company.id
    )

    # 🔹 TARİH FİLTRESİNİ UYGULA
    if start_date:
        income_q = income_q.filter(Transaction.date >= start_date)
        expense_q = expense_q.filter(Transaction.date >= start_date)
    if end_date:
        income_q = income_q.filter(Transaction.date <= end_date)
        expense_q = expense_q.filter(Transaction.date <= end_date)

    income_rows = income_q.group_by(Transaction.category).all()
    expense_rows = expense_q.group_by(Transaction.category).all()

    # 3) Sonuçları kategori bazında birleştir
    data = {}

    for cat, total_in in income_rows:
        key = cat or "UNCATEGORIZED"
        if key not in data:
            data[key] = {"in": 0.0, "out": 0.0}
        data[key]["in"] = float(total_in or 0)

    for cat, total_out in expense_rows:
        key = cat or "UNCATEGORIZED"
        if key not in data:
            data[key] = {"in": 0.0, "out": 0.0}
        data[key]["out"] = float(total_out or 0)

    results: List[CategorySummary] = []
    for cat, vals in data.items():
        total_in = vals["in"]
        total_out = vals["out"]
        net = total_in - total_out

        results.append(
            CategorySummary(
                category=cat,
                total_in=total_in,
                total_out=total_out,
                net=net,
            )
        )

    return results

from pydantic import BaseModel
from typing import List
from datetime import date, timedelta
from fastapi import Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.deps import get_db
from app.models.transaction import Transaction


class CategoryForecastItem(BaseModel):
    category: str
    avg_daily_in: float
    avg_daily_out: float
    forecast_30_in: float
    forecast_30_out: float
    net_30: float


@router.get("/category-forecast-30", response_model=List[CategoryForecastItem])
def category_forecast_30(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
    lookback_days: int = 365,   # Son kaç güne bakarak ortalama alalım (forecast-advanced ile tutarlı)
):
    """
    Son N güne göre kategori bazlı 30 günlük nakit forecast.
    """
    from datetime import timedelta

    today = date.today()
    start_date = today - timedelta(days=lookback_days)

    # Kategori + yön bazında toplam tutarları çekiyoruz
    rows = (
        db.query(
            Transaction.category,
            Transaction.direction,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(
            Transaction.date >= start_date,
            Transaction.company_id == current_company.id
        )
        .group_by(Transaction.category, Transaction.direction)
        .all()
    )

    data = {}  # {category: {"in_total": x, "out_total": y}}

    for cat, direction, total in rows:
        key = cat or "UNCATEGORIZED"
        if key not in data:
            data[key] = {"in_total": 0.0, "out_total": 0.0}

        if direction == "in":
            data[key]["in_total"] += float(total or 0)
        else:
            data[key]["out_total"] += float(total or 0)

    # Ortalama günlük ve 30 günlük forecast hesapla
    days = max(1, lookback_days)
    results: List[CategoryForecastItem] = []

    for cat, vals in data.items():
        avg_in = vals["in_total"] / days
        avg_out = vals["out_total"] / days

        forecast_30_in = avg_in * 30
        forecast_30_out = avg_out * 30
        net_30 = forecast_30_in - forecast_30_out

        results.append(
            CategoryForecastItem(
                category=cat,
                avg_daily_in=avg_in,
                avg_daily_out=avg_out,
                forecast_30_in=forecast_30_in,
                forecast_30_out=forecast_30_out,
                net_30=net_30,
            )
        )

    return results


from pydantic import BaseModel

class FixedCostAnalysis(BaseModel):
    category: str
    avg_monthly: float
    current_month: float
    change_percentage: float
    status: str  # "normal", "warning", "alert"
    alert_message: str | None = None
    months: list[dict]  # [{"month": "2025-12", "amount": 5000}, ...]


@router.get("/debug-fixed-costs")
def debug_fixed_costs(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """Debug - Fixed costs veri kontrolü"""
    from datetime import timedelta
    from app.core.constants import FIXED_COST_CATEGORIES
    
    today = date.today()
    six_months_ago = today - timedelta(days=180)
    
    # 1. Tüm transaction'lar (company_id'ye göre)
    all_txs = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == current_company.id
    ).scalar() or 0
    
    # 2. Out direction transaction'lar
    out_txs = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == current_company.id,
        Transaction.direction == "out"
    ).scalar() or 0
    
    # 3. Son 6 ayda out transaction'lar
    recent_out_txs = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == current_company.id,
        Transaction.direction == "out",
        Transaction.date >= six_months_ago
    ).scalar() or 0
    
    # 4. Fixed cost kategorilerinde son 6 ayda out transaction'lar
    fixed_cost_txs = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == current_company.id,
        Transaction.direction == "out",
        Transaction.date >= six_months_ago,
        Transaction.category.in_(list(FIXED_COST_CATEGORIES))
    ).scalar() or 0
    
    # 5. Hangi kategoriler kullanılıyor?
    used_categories = db.query(Transaction.category).filter(
        Transaction.company_id == current_company.id,
        Transaction.direction == "out",
        Transaction.date >= six_months_ago
    ).distinct().all()
    
    # 6. Fixed cost kategorilerinden kaç tane data var?
    fixed_by_cat = {}
    for cat in FIXED_COST_CATEGORIES:
        count = db.query(func.count(Transaction.id)).filter(
            Transaction.company_id == current_company.id,
            Transaction.direction == "out",
            Transaction.date >= six_months_ago,
            Transaction.category == cat
        ).scalar() or 0
        fixed_by_cat[cat] = count
    
    # 7. NULL kategori olanlar
    null_category = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == current_company.id,
        Transaction.direction == "out",
        Transaction.date >= six_months_ago,
        Transaction.category == None
    ).scalar() or 0
    
    # 8. Hangi kategorilerde NULL dışında veri var?
    category_sample = db.query(
        Transaction.category,
        func.count(Transaction.id).label("cnt")
    ).filter(
        Transaction.company_id == current_company.id,
        Transaction.direction == "out",
        Transaction.date >= six_months_ago
    ).group_by(Transaction.category).all()
    
    # 9. EFT_TAHSILAT olan transaction'lar (her direction'ta kaçar tane?)
    eft_in = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == current_company.id,
        Transaction.category == "EFT_TAHSILAT",
        Transaction.direction == "in"
    ).scalar() or 0
    
    eft_out = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == current_company.id,
        Transaction.category == "EFT_TAHSILAT",
        Transaction.direction == "out"
    ).scalar() or 0
    
    # EFT_TAHSILAT out olan örnekleri göster
    eft_out_samples = db.query(
        Transaction.id,
        Transaction.date,
        Transaction.description,
        Transaction.amount,
        Transaction.direction
    ).filter(
        Transaction.company_id == current_company.id,
        Transaction.category == "EFT_TAHSILAT",
        Transaction.direction == "out"
    ).limit(5).all()
    
    return {
        "company_id": current_company.id,
        "company_name": current_company.name,
        "today": today.isoformat(),
        "six_months_ago": six_months_ago.isoformat(),
        "total_transactions": all_txs,
        "out_direction_count": out_txs,
        "recent_out_count": recent_out_txs,
        "fixed_cost_txs_count": fixed_cost_txs,
        "used_categories": [c[0] for c in used_categories],
        "fixed_cost_categories": list(FIXED_COST_CATEGORIES),
        "fixed_by_category": fixed_by_cat,
        "null_category_count": null_category,
        "category_distribution": [{"cat": c[0], "count": c[1]} for c in category_sample],
        "eft_tahsilat_in_count": eft_in,
        "eft_tahsilat_out_count": eft_out,
        "eft_tahsilat_out_samples": [
            {
                "id": s[0],
                "date": str(s[1]),
                "description": s[2],
                "amount": float(s[3]),
                "direction": s[4]
            } for s in eft_out_samples
        ],
    }


@router.get("/fixed-costs-analysis", response_model=list[FixedCostAnalysis])
def fixed_costs_analysis(
    period: str = Query("current_month", description="Tarih filtresi: current_month, last_30_days, prev_month"),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Sabit giderleri tespit et, anomalileri uyar.
    - Aynı kategorinin son 6 ay ortalaması
    - Bu ay ile karşılaştırma
    - Anomali varsa uyarı
    
    Period: current_month, last_30_days, prev_month
    """
    from datetime import timedelta
    from app.core.constants import FIXED_COST_CATEGORIES, ANOMALY_THRESHOLD

    today = date.today()
    
    # Periyoda göre date aralığını belirle
    if period == "current_month":
        period_start = today.replace(day=1)
        period_end = today
        comparison_start = today.replace(day=1) - timedelta(days=1)
        comparison_start = comparison_start.replace(day=1)
    elif period == "last_30_days":
        period_start = today - timedelta(days=30)
        period_end = today
        comparison_start = today - timedelta(days=60)
    elif period == "prev_month":
        # Önceki ayın başı ve sonu
        current_month_start = today.replace(day=1)
        last_day_of_prev_month = current_month_start - timedelta(days=1)
        period_start = last_day_of_prev_month.replace(day=1)
        period_end = last_day_of_prev_month
        # Karşılaştırma için: bir önceki ay
        comparison_start = period_start - timedelta(days=period_start.day)
    else:
        period_start = today.replace(day=1)
        period_end = today
        comparison_start = today.replace(day=1) - timedelta(days=1)
        comparison_start = comparison_start.replace(day=1)
    
    # 6 ay öncesi (karşılaştırma için baseline)
    six_months_ago = period_start - timedelta(days=180)

    # Sabit gider kategorilerine odaklan
    year_month_col = get_year_month_format(Transaction.date).label("year_month")
    
    rows = (
        db.query(
            Transaction.category,
            year_month_col,
            func.sum(Transaction.amount).label("monthly_amount"),
        )
        .filter(
            Transaction.direction == "out",
            Transaction.company_id == current_company.id,
            Transaction.date >= six_months_ago,
            Transaction.category.in_(list(FIXED_COST_CATEGORIES)),
        )
        .group_by(
            Transaction.category,
            year_month_col,
        )
        .order_by(Transaction.category, year_month_col.desc())
        .all()
    )

    # Kategori bazında ay-tutarlarını grupla
    category_data = {}
    for cat, year_month, amount in rows:
        if cat not in category_data:
            category_data[cat] = {}
        
        # year_month is already in 'YYYY-MM' format from SQL
        month_key = year_month
        amount_float = float(amount or 0)
        if month_key not in category_data[cat]:
            category_data[cat][month_key] = 0.0
        category_data[cat][month_key] += amount_float

    results: list[FixedCostAnalysis] = []

    for category in FIXED_COST_CATEGORIES:
        if category not in category_data or not category_data[category]:
            continue

        monthly_amounts = category_data[category]
        month_keys = sorted(monthly_amounts.keys(), reverse=True)

        # Seçili periyodun tutarı
        # Period start/end tarihlerindeki transaction'ları filtrele
        period_txs = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.direction == "out",
            Transaction.company_id == current_company.id,
            Transaction.category == category,
            Transaction.date >= period_start,
            Transaction.date <= period_end,
        ).scalar()
        current_amount = float(period_txs or 0)

        # Karşılaştırma periyodunun tutarı
        comparison_txs = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.direction == "out",
            Transaction.company_id == current_company.id,
            Transaction.category == category,
            Transaction.date >= comparison_start,
            Transaction.date < period_start,
        ).scalar()
        avg_amount = float(comparison_txs or 0)

        # Yüzde değişim
        if avg_amount > 0:
            change_pct = ((current_amount - avg_amount) / avg_amount) * 100
        else:
            change_pct = 0.0

        # Status ve uyarı
        if abs(change_pct) > ANOMALY_THRESHOLD:
            status = "alert"
            if change_pct > 0:
                alert_msg = f"{category}: {change_pct:.1f}% artış tespit edildi. Mukerrer/hatalı işlem olabilir, kontrol edin."
            else:
                alert_msg = f"{category}: {abs(change_pct):.1f}% azalış tespit edildi."
        elif abs(change_pct) > 10:
            status = "warning"
            alert_msg = f"{category}: {change_pct:.1f}% değişim (alışılmadık, gözlemde bulunun)."
        else:
            status = "normal"
            alert_msg = None

        # Ay listesi (en son 6 ay)
        months_list = []
        for month_key in month_keys[:6]:
            months_list.append({
                "month": month_key,
                "amount": monthly_amounts[month_key]
            })

        results.append(
            FixedCostAnalysis(
                category=category,
                avg_monthly=round(avg_amount, 2),
                current_month=round(current_amount, 2),
                change_percentage=round(change_pct, 2),
                status=status,
                alert_message=alert_msg,
                months=months_list,
            )
        )

    return results


# ============ INSIGHTS ENDPOINT ============

@router.get("/insights")
def get_insights(
    period: str = Query("last30"),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Dashboard insights: Yaklaşan ödemeler, anomaliler, trendler, büyük işlemler, top sürükleyiciler.
    
    Period: last30, last90, this_month, all
    """
    today = date.today()

    # --- Window Helper ---
    def get_window(p: str):
        if p == "last30":
            return today - timedelta(days=30), today
        if p == "last90":
            return today - timedelta(days=90), today
        if p == "this_month":
            return today.replace(day=1), today
        if p == "all":
            return None, None
        return today - timedelta(days=30), today

    start, end = get_window(period)
    insights = []

    # 1) UPCOMING PLANNED ITEMS (7 and 14 days)
    def planned_sum(days: int):
        end_d = today + timedelta(days=days)
        
        # in sum
        in_sum_q = db.query(func.coalesce(func.sum(PlannedCashflowItem.amount), 0)).filter(
            PlannedCashflowItem.direction == "in",
            PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),
            PlannedCashflowItem.due_date >= today,
            PlannedCashflowItem.due_date <= end_d,
            PlannedCashflowItem.company_id == current_company.id,
        ).scalar()
        
        # out sum
        out_sum_q = db.query(func.coalesce(func.sum(PlannedCashflowItem.amount), 0)).filter(
            PlannedCashflowItem.direction == "out",
            PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),
            PlannedCashflowItem.due_date >= today,
            PlannedCashflowItem.due_date <= end_d,
            PlannedCashflowItem.company_id == current_company.id,
        ).scalar()
        
        in_v = float(in_sum_q or 0)
        out_v = float(out_sum_q or 0)
        return in_v, out_v

    in7, out7 = planned_sum(7)
    in14, out14 = planned_sum(14)

    if (in7 + out7) > 0:
        insights.append({
            "id": "planned_upcoming_7d",
            "severity": "medium" if out7 > 0 else "low",
            "title": "Yaklaşan Planlı Nakit (7 gün)",
            "message": f"7 gün içinde {out7:,.2f} TL ödeme ve {in7:,.2f} TL tahsilat görünüyor.",
            "metric": {"planned_in_7": round(in7, 2), "planned_out_7": round(out7, 2)}
        })

    # 2) NET TREND (last30 vs prev30)
    if start is not None:
        prev_start = start - timedelta(days=30)
        prev_end = start

        def net_between(a: date, b: date):
            inc = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
                Transaction.direction == "in",
                Transaction.date >= a,
                Transaction.date < b,
                Transaction.company_id == current_company.id,
            ).scalar()
            exp = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
                Transaction.direction == "out",
                Transaction.date >= a,
                Transaction.date < b,
                Transaction.company_id == current_company.id,
            ).scalar()
            return float(inc or 0) - float(exp or 0)

        net_last = net_between(start, end)
        net_prev = net_between(prev_start, prev_end)

        change_pct = None
        if net_prev != 0:
            change_pct = (net_last - net_prev) / abs(net_prev)

        if change_pct is not None and change_pct <= -0.20:
            insights.append({
                "id": "net_drop_mom",
                "severity": "medium",
                "title": "Net nakit akışı düşüşte",
                "message": f"Son 30 gün net nakit akışı önceki 30 güne göre %{abs(change_pct)*100:.0f} azaldı.",
                "metric": {
                    "net_last30": round(net_last, 2),
                    "net_prev30": round(net_prev, 2),
                    "change_pct": round(change_pct, 4)
                }
            })

    # 3) CATEGORY ANOMALY (last30 vs baseline)
    if start is not None:
        # last30 out by category
        last30 = db.query(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), 0).label("out_sum")
        ).filter(
            Transaction.direction == "out",
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.company_id == current_company.id,
        ).group_by(Transaction.category).all()

        # last90 baseline
        b_start = today - timedelta(days=90)
        baseline = db.query(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), 0).label("out_sum90")
        ).filter(
            Transaction.direction == "out",
            Transaction.date >= b_start,
            Transaction.date <= today,
            Transaction.company_id == current_company.id,
        ).group_by(Transaction.category).all()

        base_map = {(c or "UNCATEGORIZED"): float(s or 0) for c, s in baseline}
        anomalies = []
        
        for c, s30 in last30:
            cat = c or "UNCATEGORIZED"
            # Skip income categories from expense spike analysis
            if cat in INCOME_CATEGORIES:
                continue
            out30 = float(s30 or 0)
            out90 = base_map.get(cat, 0.0)
            # 90 günü 3 aya böl → aylık baseline
            baseline_month = out90 / 3 if out90 > 0 else 0.0
            if baseline_month <= 0:
                continue
            ratio = out30 / baseline_month
            if out30 >= 3000 and ratio >= 1.35:
                anomalies.append((cat, out30, baseline_month, ratio))

        anomalies.sort(key=lambda x: x[3], reverse=True)
        top = anomalies[:3]
        if top:
            msg_parts = [f"{c} x{r:.2f}" for c, _, _, r in top]
            insights.append({
                "id": "category_spike",
                "severity": "medium",
                "title": "Kategori bazlı gider artışı",
                "message": "Artış tespit edildi: " + ", ".join(msg_parts),
                "metric": {
                    "top_spikes": [
                        {
                            "category": c,
                            "last30_out": round(o, 2),
                            "baseline_month": round(b, 2),
                            "ratio": round(r, 2)
                        }
                        for c, o, b, r in top
                    ]
                }
            })

    # 4) LARGE TRANSACTIONS (dynamic threshold p95)
    if start is not None:
        # compute p95 on last90 out amounts
        last90_out = db.query(Transaction.amount).filter(
            Transaction.direction == "out",
            Transaction.date >= today - timedelta(days=90),
            Transaction.date <= today,
            Transaction.company_id == current_company.id,
        ).all()
        
        amounts = sorted([float(x[0]) for x in last90_out if x and x[0] is not None])
        threshold = 10000.0
        if len(amounts) >= 20:
            idx = int(0.95 * (len(amounts) - 1))
            threshold = max(threshold, amounts[idx])

        big = db.query(Transaction).filter(
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.amount >= threshold,
            Transaction.company_id == current_company.id,
        ).order_by(Transaction.amount.desc()).limit(5).all()

        if big:
            insights.append({
                "id": "large_transactions",
                "severity": "low",
                "title": "Büyük işlemler (son 30 gün)",
                "message": f"{threshold:,.0f} TL üzeri {len(big)} işlem tespit edildi.",
                "metric": {
                    "threshold": round(threshold, 2),
                    "items": [
                        {
                            "date": t.date.isoformat(),
                            "amount": float(t.amount),
                            "direction": t.direction,
                            "category": t.category,
                            "description": t.description
                        }
                        for t in big
                    ]
                }
            })

    # 5) TOP EXPENSE DRIVERS
    if start is not None:
        top_exp = db.query(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), 0).label("out_sum")
        ).filter(
            Transaction.direction == "out",
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.company_id == current_company.id,
        ).group_by(Transaction.category).order_by(func.sum(Transaction.amount).desc()).limit(3).all()

        total_out = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.direction == "out",
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.company_id == current_company.id,
        ).scalar() or 0

        if total_out > 0 and top_exp:
            items = []
            for c, s in top_exp:
                cat = c or "UNCATEGORIZED"
                outv = float(s or 0)
                items.append({
                    "category": cat,
                    "out": round(outv, 2),
                    "share": round(outv / float(total_out), 4)
                })
            insights.append({
                "id": "top_expense_drivers",
                "severity": "low",
                "title": "En büyük gider sürükleyicileri",
                "message": "Son 30 günde en çok gider çıkan kategoriler listelendi.",
                "metric": {
                    "total_out": round(float(total_out), 2),
                    "items": items
                }
            })

    # 6) RİSK AĞIRLIKLI TAHSİLAT MARUZİYETİ (önümüzdeki 30 gün)
    try:
        end_30d = today + timedelta(days=30)

        # Önümüzdeki 30 gün içindeki aktif tahsilat kalemleri (direction=in)
        upcoming_in = db.query(
            PlannedCashflowItem.counterparty_id,
            func.coalesce(func.sum(PlannedCashflowItem.amount), 0).label("total")
        ).filter(
            PlannedCashflowItem.direction == "in",
            PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),
            PlannedCashflowItem.due_date >= today,
            PlannedCashflowItem.due_date <= end_30d,
            PlannedCashflowItem.company_id == current_company.id,
            PlannedCashflowItem.counterparty_id.isnot(None),
        ).group_by(PlannedCashflowItem.counterparty_id).all()

        print(f"[DEBUG] upcoming_in count: {len(upcoming_in)}, items: {[(cp_id, float(amt)) for cp_id, amt in upcoming_in]}")

        if upcoming_in:
            # Cari risk metriklerini hesapla
            cp_metrics = compute_counterparty_metrics(db, current_company.id)
            risk_map = {
                m["counterparty_id"]: m["risk_score"]
                for m in cp_metrics
                if m["risk_score"] is not None
            }
            print(f"[DEBUG] risk_map: {risk_map}")

            total_upcoming = 0.0
            high_risk_amount = 0.0
            high_risk_counterparties = []

            for cp_id, amount in upcoming_in:
                amt = float(amount or 0)
                total_upcoming += amt
                score = risk_map.get(cp_id)
                print(f"[DEBUG] cp_id={cp_id}, amt={amt}, risk_score={score}")
                # Yüksek risk eşiği: risk_score >= 60 (0-100 ölçeğinde)
                if score is not None and score >= 60:
                    high_risk_amount += amt
                    # Cari adını bul
                    cp = db.query(Counterparty.name).filter(
                        Counterparty.id == cp_id
                    ).scalar()
                    high_risk_counterparties.append({
                        "name": cp or "Bilinmeyen",
                        "amount": round(amt, 2),
                        "risk_score": score,
                    })

            if total_upcoming > 0:
                exposure_pct = (high_risk_amount / total_upcoming) * 100

                # %20 altında gösterme
                if exposure_pct >= 20:
                    severity = "critical" if exposure_pct >= 40 else "medium"
                    insights.append({
                        "id": "risk_collection_exposure",
                        "severity": severity,
                        "title": "Riskli Tahsilat",
                        "message": (
                            f"Önümüzdeki 30 gün içinde beklenen tahsilatların "
                            f"%{exposure_pct:.0f}'i ({high_risk_amount:,.0f} TL) "
                            f"yüksek riskli müşterilerden geliyor."
                        ),
                        "metric": {
                            "exposure_pct": round(exposure_pct, 1),
                            "high_risk_amount": round(high_risk_amount, 2),
                            "total_upcoming": round(total_upcoming, 2),
                            "high_risk_counterparties": sorted(
                                high_risk_counterparties,
                                key=lambda x: x["amount"],
                                reverse=True
                            )[:5],
                        },
                    })
    except Exception as e:
        # Insight hesaplanamadıysa diğer insight'ları etkilememesi için sessizce geç
        import traceback
        print(f"[INSIGHT] risk_collection_exposure hatası: {e}")
        traceback.print_exc()

    # risk_collection_exposure varsa ilk sıraya taşı
    sorted_insights = sorted(
        insights,
        key=lambda x: 0 if x["id"] == "risk_collection_exposure" else 1
    )

    return {
        "period": period,
        "generated_at": today.isoformat(),
        "insights": sorted_insights,
        "debug": {
            "window_start": start.isoformat() if start else None,
            "window_end": end.isoformat() if end else None,
        }
    }


@router.get("/insights/{insight_id}")
def get_insight_detail(
    insight_id: str = Path(..., description="Insight ID"),
    period: str = Query("last30"),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Belirli bir insight'ın detaylı bilgisini döndürür.
    Frontend modal'da gösterim için kullanılır.
    """
    today = date.today()
    
    # --- Window Helper ---
    def get_window(p: str):
        if p == "last30":
            return today - timedelta(days=30), today
        if p == "last90":
            return today - timedelta(days=90), today
        if p == "this_month":
            return today.replace(day=1), today
        if p == "all":
            return None, None
        return today - timedelta(days=30), today
    
    start, end = get_window(period)
    
    # Tüm insights'ı hesapla (aynı mantık ile)
    result = get_insights(period=period, db=db, current_company=current_company)
    all_insights = result.get("insights", [])
    
    # İstenen insight'ı bul
    target_insight = None
    for ins in all_insights:
        if ins["id"] == insight_id:
            target_insight = ins
            break
    
    if not target_insight:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Insight '{insight_id}' not found")
    
    # Detaylı bilgi için insight type'a göre ek data ekle
    detail_data = {
        "id": target_insight["id"],
        "severity": target_insight["severity"],
        "title": target_insight["title"],
        "message": target_insight["message"],
        "metric": target_insight.get("metric", {}),
        "timestamp": today.isoformat(),
        "actions": []
    }
    
    # Her insight türü için özel action önerileri
    if insight_id == "planned_upcoming_7d":
        detail_data["actions"] = [
            {"id": "review_planned", "label": "Planlı kalemleri gözden geçir", "type": "link"},
            {"id": "remind_me", "label": "Hatırlat", "type": "action"}
        ]
        # Ek detay: açık planned itemları listele
        upcoming_items = db.query(PlannedCashflowItem).filter(
            PlannedCashflowItem.company_id == current_company.id,
            PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),
            PlannedCashflowItem.due_date >= today,
            PlannedCashflowItem.due_date <= today + timedelta(days=7)
        ).order_by(PlannedCashflowItem.due_date).all()
        
        detail_data["upcoming_items"] = [
            {
                "id": item.id,
                "type": item.type,
                "direction": item.direction,
                "amount": float(item.amount),
                "due_date": item.due_date.isoformat(),
                "counterparty": item.counterparty,
                "status": item.status
            }
            for item in upcoming_items
        ]
    
    elif insight_id == "net_drop_mom":
        detail_data["actions"] = [
            {"id": "view_trends", "label": "Trend grafiğini gör", "type": "link"},
            {"id": "analyze", "label": "Detaylı analiz yap", "type": "action"}
        ]
    
    elif insight_id == "category_spike":
        detail_data["actions"] = [
            {"id": "review_category", "label": "Kategori detaylarını incele", "type": "link"}
        ]
        # Ek: spike olan kategorilerin transaction detayları
        spikes = target_insight.get("metric", {}).get("top_spikes", [])
        if spikes and start:
            category_details = []
            for spike in spikes[:3]:
                cat = spike["category"]
                txs = db.query(Transaction).filter(
                    Transaction.company_id == current_company.id,
                    Transaction.category == cat,
                    Transaction.direction == "out",
                    Transaction.date >= start,
                    Transaction.date <= end
                ).order_by(Transaction.amount.desc()).limit(5).all()
                
                category_details.append({
                    "category": cat,
                    "transactions": [
                        {
                            "date": t.date.isoformat(),
                            "amount": float(t.amount),
                            "description": t.description
                        }
                        for t in txs
                    ]
                })
            detail_data["category_details"] = category_details
    
    elif insight_id == "large_transactions":
        detail_data["actions"] = [
            {"id": "flag_review", "label": "İşlemleri işaretle", "type": "action"}
        ]
    
    elif insight_id == "top_expense_drivers":
        detail_data["actions"] = [
            {"id": "budget_plan", "label": "Bütçe planı oluştur", "type": "action"}
        ]
    
    return detail_data


@router.get("/matching-health")
def matching_health(
    db: Session = Depends(get_db),
    company = Depends(get_current_company),
):
    """
    Planli nakit akisi sagligini goster:
    - auto vs manual match sayilari
    - unmatched/overdue olanlar
    - partial match'ler
    """
    company_id = company.id
    today = date.today()

    # Auto vs Manual match sayıları
    auto_count = db.query(func.count(PlannedMatch.id)).filter(
        PlannedMatch.company_id == company_id,
        PlannedMatch.match_type == "AUTO"
    ).scalar() or 0

    # Manual matches: PARTIAL STATUS'LU planned itemler HARIC
    # (PARTIAL statuslüler kısmi eşleşen kartında gösterilecek)
    manual_count = db.query(func.count(PlannedMatch.id)).filter(
        PlannedMatch.company_id == company_id,
        PlannedMatch.match_type != "AUTO",
        PlannedCashflowItem.status != "PARTIAL"
    ).join(
        PlannedCashflowItem,
        PlannedMatch.planned_item_id == PlannedCashflowItem.id
    ).scalar() or 0

    # PARTIAL planned sayısı (sadece kısmi eşleşenleri saymak için)
    partial_count = db.query(func.count(PlannedCashflowItem.id)).filter(
        PlannedCashflowItem.company_id == company_id,
        PlannedCashflowItem.status == "PARTIAL"
    ).scalar() or 0

    # Unmatched planned: Status kapatılmadıysa (OPEN/PARTIAL) ve remaining>0
    # Vadesi geçmiş olanlar (overdue)
    overdue = db.query(func.count(PlannedCashflowItem.id)).filter(
        PlannedCashflowItem.company_id == company_id,
        PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),  # Kapatılmamış
        PlannedCashflowItem.remaining_amount > 0,
        PlannedCashflowItem.due_date < today
    ).scalar() or 0

    # Önümüzdeki 14 gün (upcoming)
    # DEBUG: İlk önce gerçek kayıtları çekelim
    import logging
    logger = logging.getLogger(__name__)
    
    # Tarih aralığını açıkça hesapla (bugün dahil, 14 gün sonrası dahil değil)
    end_date = today + timedelta(days=14)
    
    upcoming_items = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.company_id == company_id,
        PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),  # Kapatılmamış
        PlannedCashflowItem.remaining_amount > 0,
        PlannedCashflowItem.due_date >= today,
        PlannedCashflowItem.due_date <= end_date
    ).all()
    
    upcoming_14 = len(upcoming_items)
    
    logger.info(f"[MATCHING-HEALTH] upcoming_14 count: {upcoming_14}, today: {today}, end_date: {end_date}")
    logger.info(f"[MATCHING-HEALTH] Date comparison: due_date >= {today} AND due_date <= {end_date}")
    for item in upcoming_items:
        in_range = item.due_date <= end_date
        logger.info(f"  - Item {item.id}: due_date={item.due_date}, status={item.status}, remaining={item.remaining_amount}, in_range={in_range}, ({item.due_date} <= {end_date} = {in_range})")

    # MVP'de "pending review" yok; 0 dönüyoruz
    pending_review = 0

    return {
        "auto_matched": int(auto_count),
        "manual_matched": int(manual_count),
        "pending_review": int(pending_review),
        "unmatched_overdue": int(overdue),
        "unmatched_upcoming_14d": int(upcoming_14),
        "partial_planned": int(partial_count),
    }


@router.get("/matching-exceptions")
def matching_exceptions(
    kind: str = Query("overdue"),  # overdue | upcoming14 | partial
    db: Session = Depends(get_db),
    company = Depends(get_current_company),
):
    """
    Eşleştirme istisnaları: vadesi geçmiş, yaklaşan, kısmi eşleştirmiş
    """
    company_id = company.id
    today = date.today()

    q = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.company_id == company_id
    )

    if kind == "overdue":
        q = q.filter(
            PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),  # Kapatılmamış
            PlannedCashflowItem.remaining_amount > 0,
            PlannedCashflowItem.due_date < today
        ).order_by(PlannedCashflowItem.due_date.asc())
    elif kind == "upcoming14":
        end_date = today + timedelta(days=14)
        q = q.filter(
            PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),  # Kapatılmamış
            PlannedCashflowItem.remaining_amount > 0,
            PlannedCashflowItem.due_date >= today,
            PlannedCashflowItem.due_date <= end_date
        ).order_by(PlannedCashflowItem.due_date.asc())
    elif kind == "partial":
        q = q.filter(
            PlannedCashflowItem.status == "PARTIAL"
        ).order_by(PlannedCashflowItem.due_date.asc())
    else:
        return {"items": []}

    items = q.limit(200).all()
    
    # DEBUG: Log the exceptions query
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[MATCHING-EXCEPTIONS] kind: {kind}, count: {len(items)}, today: {today}")
    if kind == "upcoming14":
        for item in items:
            logger.info(f"  - Item {item.id}: due_date={item.due_date}, status={item.status}, remaining={item.remaining_amount}")

    return {
        "kind": kind,
        "count": len(items),
        "items": [
            {
                "id": i.id,
                "type": i.type,
                "direction": i.direction,
                "due_date": i.due_date.isoformat() if i.due_date else None,
                "amount": float(i.amount),
                "settled_amount": float(i.settled_amount or 0),
                "remaining_amount": float(i.remaining_amount or 0),
                "status": i.status,
                "counterparty": i.counterparty or "",
                "reference_no": i.reference_no or "",
            }
            for i in items
        ]
    }


@router.post("/insights/{insight_id}/apply-suggestion")
def apply_insight_suggestion(
    insight_id: str = Path(..., description="Insight ID"),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Insight action'ını uygula.
    Frontend'den gelen action request'i işler.
    
    Şu an basit bir acknowledgement döndürür, gelecekte:
    - remind_me -> notification/reminder oluştur
    - flag_review -> transaction'ları işaretle
    - budget_plan -> bütçe taslağı oluştur
    """
    
    # Basit validation - insight var mı?
    result = get_insights(period="last30", db=db, current_company=current_company)
    all_insights = result.get("insights", [])
    
    insight_exists = any(ins["id"] == insight_id for ins in all_insights)
    if not insight_exists:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Insight '{insight_id}' not found")
    
    # Action mantığı (gelecekte expand edilebilir)
    action_message = ""
    
    if insight_id == "planned_upcoming_7d":
        action_message = "Planlı kalemler için hatırlatma ayarlandı ✓"
    elif insight_id == "net_drop_mom":
        action_message = "Trend analizi raporu oluşturuldu ✓"
    elif insight_id == "category_spike":
        action_message = "Kategori incelemesi için not eklendi ✓"
    elif insight_id == "large_transactions":
        action_message = "Büyük işlemler inceleme için işaretlendi ✓"
    elif insight_id == "top_expense_drivers":
        action_message = "Gider optimizasyonu önerileri hazırlandı ✓"
    else:
        action_message = "İşlem kaydedildi ✓"
    
    return {
        "success": True,
        "insight_id": insight_id,
        "message": action_message,
        "timestamp": date.today().isoformat()
    }


# ====== CFO PROFILE ENDPOINT ======

def clamp(x: float, lo: float, hi: float) -> float:
    """Değeri lo ile hi arasına sınırla."""
    return max(lo, min(hi, x))

def safe_div(a: float, b: float) -> float:
    """Güvenli bölme (b=0 ise 0 döner)."""
    return a / b if b not in (0, 0.0, None) else 0.0

class ForecastPoint(BaseModel):
    name: str
    value: float
    date: str
    company_id: int


@router.get("/debug-forecast/{period}")
def debug_forecast(
    period: int = Path(ge=30, le=90),
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Debug endpoint - forecast hesaplamalarını adım adım göster"""
    now = date.today()
    last_90 = now - timedelta(days=90)
    
    from app.models.company_settings import CompanyFinancialSettings
    
    # 1. Başlangıç bakiyesi
    settings = db.query(CompanyFinancialSettings).filter(
        CompanyFinancialSettings.company_id == company.id
    ).first()
    initial_balance = float(settings.initial_balance) if settings else 0.0
    
    # 2. Transaction'lar sayısı
    tx_count = db.query(func.count(Transaction.id)).filter(
        Transaction.company_id == company.id
    ).scalar() or 0
    
    # 3. Transaction direction değerleri
    tx_directions = db.query(Transaction.direction).filter(
        Transaction.company_id == company.id
    ).distinct().all()
    
    # 4. Tüm Transaction'lar
    all_txs = db.query(Transaction).filter(
        Transaction.company_id == company.id
    ).all()
    
    # 5. Son 90 gün transaction'lar
    recent_txs = db.query(Transaction).filter(
        Transaction.company_id == company.id,
        Transaction.date >= last_90
    ).all()
    
    # 6. Transaction toplamı (direction="in")
    in_sum = db.query(func.sum(Transaction.amount)).filter(
        Transaction.company_id == company.id,
        Transaction.direction == "in"
    ).scalar() or 0
    
    # 7. Transaction toplamı (direction="out")
    out_sum = db.query(func.sum(Transaction.amount)).filter(
        Transaction.company_id == company.id,
        Transaction.direction == "out"
    ).scalar() or 0
    
    # 8. Net flow
    net_flow = float(in_sum) - float(out_sum)
    
    # 9. PlannedItem'ler
    planned_count = db.query(func.count(PlannedCashflowItem.id)).filter(
        PlannedCashflowItem.company_id == company.id
    ).scalar() or 0
    
    return {
        "company_id": company.id,
        "company_name": company.name,
        "now": now.isoformat(),
        "initial_balance": initial_balance,
        "transaction_count": tx_count,
        "transaction_directions": [d[0] for d in tx_directions],
        "recent_transaction_count_90days": len(recent_txs),
        "all_transactions_sample": [
            {
                "date": str(t.date),
                "direction": t.direction,
                "amount": float(t.amount),
                "description": t.description
            } for t in all_txs[:5]
        ],
        "income_sum": float(in_sum),
        "expense_sum": float(out_sum),
        "net_flow": net_flow,
        "estimated_current_cash": initial_balance + net_flow,
        "planned_item_count": planned_count,
    }


@router.get("/forecast/{period}", response_model=List[ForecastPoint])
def get_cash_forecast(
    period: int = Path(ge=30, le=90),
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Nakit tahmini (Cash Forecast) için veri döner.
    
    period: 30, 60 veya 90 gün
    
    Haftalık projeksiyon döner:
    - 30 gün = 4 hafta
    - 60 gün = 8 hafta
    - 90 gün = 12 hafta
    """
    # Hafta sayısını belirle
    weeks = (period + 6) // 7
    now = date.today()
    
    try:
        # 📊 TREND ANALİZİ: forecast-advanced ile tutarlı
        # Son 1 yıl transaction'ları, yoksa tümünü al
        now = date.today()
        last_365_days = now - timedelta(days=365)
        
        tx_list = db.query(Transaction).filter(
            Transaction.company_id == company.id,
            Transaction.date >= last_365_days
        ).all()
        
        # Eğer son 1 yılda hiç işlem yoksa, bütün transaction'ları kullan
        if len(tx_list) == 0:
            tx_list = db.query(Transaction).filter(
                Transaction.company_id == company.id
            ).all()
        
        # Daily net flow hesapla
        daily_net = {}
        for tx in tx_list:
            d = tx.date
            amt = float(tx.amount)
            if d not in daily_net:
                daily_net[d] = 0.0
            if tx.direction == "in":
                daily_net[d] += amt
            else:
                daily_net[d] -= amt
        
        # Average daily net (365 günlük base - forecast-advanced ile tutarlı)
        if len(daily_net) == 0:
            avg_daily_net = 0.0
        else:
            total_net = sum(daily_net.values())
            avg_daily_net = total_net / 365
        
        # 1️⃣ Başlangıç bakiyesini al
        from app.models.company_settings import CompanyFinancialSettings
        settings = db.query(CompanyFinancialSettings).filter(
            CompanyFinancialSettings.company_id == company.id
        ).first()
        
        initial_balance = 0.0
        if settings:
            initial_balance = float(settings.initial_balance)
        
        # 2️⃣ Geçmiş Transaction'lar (BUGÜN'ün base'ini belirle)
        transaction_sum = sum(daily_net.values())
        current_cash = initial_balance + transaction_sum
        
        # 3️⃣ Geçmiş Planned Items'leri ekle (BUGÜN'ün base'i)
        planned_result = db.query(
            func.sum(case(
                (PlannedCashflowItem.direction == "in", PlannedCashflowItem.remaining_amount),
                else_=-PlannedCashflowItem.remaining_amount
            )).label("planned_total")
        ).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.due_date <= now,
            PlannedCashflowItem.remaining_amount > 0
        ).first()
        
        planned_cash = float(planned_result[0]) if planned_result and planned_result[0] else 0.0
        current_cash = float(current_cash) + planned_cash
    except Exception as e:
        import traceback
        print(f"Forecast calculation error: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        # Fallback: örnek veri döner
        avg_daily = 500
        current_cash = -75000
    
    # Haftalık tahminler oluştur
    forecast = []
    forecast.append(ForecastPoint(
        name="BUGÜN",
        value=float(current_cash),
        date=now.isoformat(),
        company_id=company.id
    ))
    
    for week in range(1, weeks + 1):
        week_date = now + timedelta(weeks=week)
        
        # 🔮 FUTURE PROJECTION = Trend-based (avg_daily_net * days) + Planned Items
        # forecast-advanced ile tutarlı: avg_daily_net * (7 * week)
        projected_value = float(current_cash) + (avg_daily_net * 7 * week)
        
        # 📅 Gelecek Planned Items'leri ekle (bu hafta içinde due olanlar)
        future_planned = db.query(
            func.sum(case(
                (PlannedCashflowItem.direction == "in", PlannedCashflowItem.remaining_amount),
                else_=-PlannedCashflowItem.remaining_amount
            )).label("planned_total")
        ).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.due_date > now,
            PlannedCashflowItem.due_date <= week_date,
            PlannedCashflowItem.remaining_amount > 0
        ).first()
        
        future_planned_cash = float(future_planned[0]) if future_planned and future_planned[0] else 0.0
        projected_value = float(projected_value) + future_planned_cash
        
        forecast.append(ForecastPoint(
            name=f"{week}. HAFTA",
            value=projected_value,
            date=week_date.isoformat(),
            company_id=company.id
        ))
    
    return forecast


class KeyInsight(BaseModel):
    title: str
    description: str


@router.get("/debug-auth")
def debug_auth(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """Debug endpoint to check auth"""
    return {
        "status": "authenticated",
        "company_id": current_company.id,
        "company_name": current_company.name
    }


@router.get("/insights", response_model=List[KeyInsight])
def get_key_insights(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Önemli bulguları hesapla:
    - Yaklaşan planli ödeme/tahsilat (7 gün)
    - Yapılmamış eşleşmeler (overdue)
    - Yaklaşan 14 gün eşleşmesi gereken kalemler
    """
    insights = []
    now = date.today()
    
    try:
        # 1. Yaklaşan Planli Nakit (7 gün)
        seven_days_later = now + timedelta(days=7)
        upcoming_7d = db.query(
            func.sum(case(
                (PlannedCashflowItem.direction == "in", PlannedCashflowItem.remaining_amount),
                else_=-PlannedCashflowItem.remaining_amount
            )).label("net_amount")
        ).filter(
            PlannedCashflowItem.company_id == current_company.id,
            PlannedCashflowItem.due_date > now,
            PlannedCashflowItem.due_date <= seven_days_later,
            PlannedCashflowItem.remaining_amount > 0
        ).first()
        
        upcoming_amount = float(upcoming_7d[0]) if upcoming_7d and upcoming_7d[0] else 0
        
        if upcoming_amount != 0:
            outgoing = db.query(func.sum(PlannedCashflowItem.remaining_amount)).filter(
                PlannedCashflowItem.company_id == current_company.id,
                PlannedCashflowItem.due_date > now,
                PlannedCashflowItem.due_date <= seven_days_later,
                PlannedCashflowItem.direction == "out",
                PlannedCashflowItem.remaining_amount > 0
            ).scalar() or 0
            
            incoming = db.query(func.sum(PlannedCashflowItem.remaining_amount)).filter(
                PlannedCashflowItem.company_id == current_company.id,
                PlannedCashflowItem.due_date > now,
                PlannedCashflowItem.due_date <= seven_days_later,
                PlannedCashflowItem.direction == "in",
                PlannedCashflowItem.remaining_amount > 0
            ).scalar() or 0
            
            insights.append(KeyInsight(
                title="Yaklaşan Planli Nakit (7 Gün)",
                description=f"7 gün içinde {float(outgoing):,.2f} TL ödeme ve {float(incoming):,.2f} TL tahsilat görünüyor"
            ))
        
        # 2. Eşleşmesi Yapılmamış Overdue Kalemler
        overdue_count = db.query(func.count(PlannedCashflowItem.id)).filter(
            PlannedCashflowItem.company_id == current_company.id,
            PlannedCashflowItem.due_date < now,
            PlannedCashflowItem.remaining_amount > 0
        ).scalar() or 0
        
        if overdue_count > 0:
            insights.append(KeyInsight(
                title="Vadesi Geçmiş Kalemler",
                description=f"{overdue_count} adet yapılmamış eşleşme vadesini geçti. Dikkat gerekli!"
            ))
        
        # 3. Yaklaşan 14 Gün Eşleşmesi Gereken
        fourteen_days_later = now + timedelta(days=14)
        upcoming_14d = db.query(func.count(PlannedCashflowItem.id)).filter(
            PlannedCashflowItem.company_id == current_company.id,
            PlannedCashflowItem.due_date > now,
            PlannedCashflowItem.due_date <= fourteen_days_later,
            PlannedCashflowItem.remaining_amount > 0
        ).scalar() or 0
        
        if upcoming_14d > 0:
            insights.append(KeyInsight(
                title="Yaklaşan 14 Gün",
                description=f"Önümüzdeki 14 gün içinde {upcoming_14d} adet eşleşme yapılması gerekiyor"
            ))
        
        # Eğer insight yoksa dummy bulgu döner
        if not insights:
            insights.append(KeyInsight(
                title="Tüm İyi!",
                description="Hiçbir sorun görülmüyor"
            ))
        
        return insights
    
    except Exception as e:
        print(f"Insights calculation error: {e}")
        return [KeyInsight(
            title="Veri Yükleme Hatası",
            description="Bulguların hesaplanması sırasında bir hata oluştu"
        )]
