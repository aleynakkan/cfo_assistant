# app/routes/ai_chat.py

from datetime import date, timedelta
from typing import List
from math import sqrt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.core.deps import get_db, get_current_company
from app.models.company import Company
from app.models.transaction import Transaction
from app.models.planned_item import PlannedCashflowItem
from app.models.planned_match import PlannedMatch

router = APIRouter()


class AIQueryRequest(BaseModel):
    question: str


class AIQueryResponse(BaseModel):
    answer: str


def clamp(x: float, lo: float, hi: float) -> float:
    """Değeri lo ile hi arasına sınırla."""
    return max(lo, min(hi, x))

def safe_div(a: float, b: float) -> float:
    """Güvenli bölme (b=0 ise 0 döner)."""
    return a / b if b not in (0, 0.0, None) else 0.0


def build_financial_context(
    db: Session,
    company: Company,
) -> str:
    """
    AI'ye verilecek zengin finansal bağlamı oluşturur:
    1. CFO Profile (risk scores, liquidity, cost structure)
    2. Insights (uyarılar + fırsatlar)
    3. Matching Health (reconciliation durumu)
    4. Forecast (30/60/90 gün tahminleri)
    """
    from app.models.company_settings import CompanyFinancialSettings
    from app.services.cash_position import calculate_estimated_cash

    today = date.today()
    ctx_lines = []

    # ===== 1. CFO PROFILE =====
    ctx_lines.append("=" * 70)
    ctx_lines.append("### 📊 CFO PROFİLİ (Finansal Risk Özeti)")
    ctx_lines.append("=" * 70)

    try:
        # CFO Profile'ı inline hesapla (endpoint kodu tekrarlanır ama context'te tam veri olur)
        start_90 = today - timedelta(days=90)
        tx_list_90 = db.query(Transaction).filter(
            Transaction.company_id == company.id,
            Transaction.date >= start_90
        ).all()

        if len(tx_list_90) == 0:
            tx_list_90 = db.query(Transaction).filter(
                Transaction.company_id == company.id
            ).all()
            use_last90 = False
        else:
            use_last90 = True

        # Günlük net hesapla
        daily_net = {}
        daily_in = {}
        daily_out = {}
        total_in = 0.0
        total_out = 0.0

        for tx in tx_list_90:
            d = tx.date
            amt = float(tx.amount)
            if d not in daily_net:
                daily_net[d] = 0.0
                daily_in[d] = 0.0
                daily_out[d] = 0.0
            if tx.direction == "in":
                daily_net[d] += amt
                daily_in[d] += amt
                total_in += amt
            else:
                daily_net[d] -= amt
                daily_out[d] += amt
                total_out += amt

        day_count = len(daily_net) if len(daily_net) > 0 else 0
        avg_daily_net = safe_div(sum(daily_net.values()), day_count)
        avg_daily_in = safe_div(total_in, day_count)
        avg_daily_out = safe_div(total_out, day_count)

        # Volatility
        if day_count <= 1:
            net_std = 0.0
        else:
            mean = avg_daily_net
            var = sum((v - mean) ** 2 for v in daily_net.values()) / (day_count - 1)
            net_std = sqrt(var)

        # Estimated cash
        settings = db.query(CompanyFinancialSettings).filter(
            CompanyFinancialSettings.company_id == company.id
        ).first()
        estimated_cash = None
        if settings:
            try:
                estimated_cash = float(settings.estimated_cash)
            except:
                pass
        if estimated_cash is None:
            estimated_cash = total_in - total_out

        runway_days = safe_div(estimated_cash, avg_daily_out)

        # Risk scores
        liquidity_risk = 100 - clamp((runway_days / 120.0) * 100.0, 0, 100)
        vol_ratio = safe_div(net_std, avg_daily_out)
        volatility_risk = clamp(vol_ratio * 100.0, 0, 100)

        # Category analysis for concentration
        income_q = db.query(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), 0).label("sum_amount")
        ).filter(
            Transaction.company_id == company.id,
            Transaction.direction == "in",
        )
        if use_last90:
            income_q = income_q.filter(Transaction.date >= start_90)
        income_rows = income_q.group_by(Transaction.category).all()

        expense_q = db.query(
            Transaction.category,
            func.coalesce(func.sum(Transaction.amount), 0).label("sum_amount")
        ).filter(
            Transaction.company_id == company.id,
            Transaction.direction == "out",
        )
        if use_last90:
            expense_q = expense_q.filter(Transaction.date >= start_90)
        expense_rows = expense_q.group_by(Transaction.category).all()

        income_by_cat = {cat or "UNCATEGORIZED": float(s or 0) for cat, s in income_rows}
        expense_by_cat = {cat or "UNCATEGORIZED": float(s or 0) for cat, s in expense_rows}

        total_income_cat = sum(income_by_cat.values())
        total_expense_cat = sum(expense_by_cat.values())

        top_income_share = safe_div(max(income_by_cat.values()) if income_by_cat else 0, total_income_cat)
        top_expense_share = safe_div(max(expense_by_cat.values()) if expense_by_cat else 0, total_expense_cat)

        conc = max(top_income_share, top_expense_share)
        concentration_risk = clamp(safe_div((conc - 0.2), (0.8 - 0.2)) * 100.0, 0, 100)

        # Fixed cost
        FIXED_COST_CATEGORIES = {"MAAS", "KIRA", "VERGI", "SIGORTA"}
        fixed_cost = sum(expense_by_cat.get(c, 0.0) for c in FIXED_COST_CATEGORIES)
        fixed_cost_ratio = safe_div(fixed_cost, total_expense_cat)

        # CFO Profile output
        ctx_lines.append(f"**Veri Dönemi:** {('Son 90 gün' if use_last90 else 'Tüm zamanlar')} ({day_count} gün)")
        ctx_lines.append("")
        ctx_lines.append("#### 💰 Likidite & Nakit")
        ctx_lines.append(f"- Tahmini nakit: **{estimated_cash:,.0f} ₺**")
        ctx_lines.append(f"- Runway: **{runway_days:.1f} gün** (nakit tükenmeden kaç gün daha çalışabilir)")
        ctx_lines.append(f"- Ort. günlük net: **{avg_daily_net:,.0f} ₺** (↑ {avg_daily_in:,.0f} | ↓ {avg_daily_out:,.0f})")
        ctx_lines.append(f"- Net volatilite: {net_std:,.0f} ₺ (günlük dalgalanma)")
        ctx_lines.append("")
        ctx_lines.append("#### ⚠️ Risk Skorları (0-100, yüksek = riskli)")
        ctx_lines.append(f"- **Likidite Riski: {liquidity_risk:.1f}** {'🔴 CRİTİK' if liquidity_risk > 75 else '🟠 UYARI' if liquidity_risk > 50 else '🟢 İYİ'}")
        ctx_lines.append(f"- **Volatilite Riski: {volatility_risk:.1f}** {'🔴 CRİTİK' if volatility_risk > 75 else '🟠 UYARI' if volatility_risk > 50 else '🟢 İYİ'}")
        ctx_lines.append(f"- **Konsantrasyon Riski: {concentration_risk:.1f}** {'🔴 CRİTİK' if concentration_risk > 75 else '🟠 UYARI' if concentration_risk > 50 else '🟢 İYİ'}")
        ctx_lines.append("")
        ctx_lines.append("#### 📈 Maliyet Yapısı")
        ctx_lines.append(f"- **Sabit gider oranı: {fixed_cost_ratio*100:.1f}%** ({fixed_cost:,.0f} ₺)")
        ctx_lines.append(f"- Top gelir kategorisi payı: {top_income_share*100:.1f}%")
        ctx_lines.append(f"- Top gider kategorisi payı: {top_expense_share*100:.1f}%")
        ctx_lines.append("")

    except Exception as e:
        ctx_lines.append(f"⚠️ CFO Profile hesaplanamadı: {str(e)}")
        ctx_lines.append("")

    # ===== 2. CATEGORY TREND ANALYSIS (3 Months) =====
    ctx_lines.append("=" * 70)
    ctx_lines.append("### 📊 KATEGORİ TREND ANALİZİ (Son 3 Ay)")
    ctx_lines.append("=" * 70)
    
    try:
        # Get last 3 complete months
        from datetime import datetime
        current_month_start = date(today.year, today.month, 1)
        
        # Calculate 3 months back
        months_data = []
        for i in range(3, 0, -1):  # 3, 2, 1 (oldest to newest)
            month_date = current_month_start - timedelta(days=i*30)
            month_start = date(month_date.year, month_date.month, 1)
            # Get next month start
            if month_date.month == 12:
                month_end = date(month_date.year + 1, 1, 1) - timedelta(days=1)
            else:
                month_end = date(month_date.year, month_date.month + 1, 1) - timedelta(days=1)
            
            months_data.append({
                'name': month_date.strftime('%B')[:3],  # Jan, Feb, etc.
                'start': month_start,
                'end': month_end
            })
        
        # Query transactions by category and month
        category_trends = {}
        for month_info in months_data:
            month_txs = db.query(
                Transaction.category,
                func.coalesce(func.sum(Transaction.amount), 0).label("total")
            ).filter(
                Transaction.company_id == company.id,
                Transaction.direction == "out",
                Transaction.date >= month_info['start'],
                Transaction.date <= month_info['end']
            ).group_by(Transaction.category).all()
            
            for cat, total in month_txs:
                cat_name = cat or "UNCATEGORIZED"
                if cat_name not in category_trends:
                    category_trends[cat_name] = []
                category_trends[cat_name].append(float(total))
        
        # Sort by total volume (sum of 3 months)
        category_totals = [(cat, sum(amounts)) for cat, amounts in category_trends.items()]
        category_totals.sort(key=lambda x: x[1], reverse=True)
        
        # Show top 5-7 categories
        top_categories = category_totals[:7]
        
        if top_categories:
            for cat, _ in top_categories:
                amounts = category_trends[cat]
                # Pad with zeros if missing months
                while len(amounts) < 3:
                    amounts.insert(0, 0.0)
                
                ctx_lines.append(f"**{cat}:**")
                for i, month_info in enumerate(months_data):
                    amount = amounts[i]
                    # Calculate MoM growth
                    if i > 0 and amounts[i-1] > 0:
                        growth = ((amount - amounts[i-1]) / amounts[i-1]) * 100
                        growth_str = f" ({growth:+.1f}%)"
                        if abs(growth) > 20:
                            growth_str += " 🔴 ANOMALİ" if growth > 0 else " ⚠️ DÜŞÜŞ"
                    else:
                        growth_str = ""
                    
                    ctx_lines.append(f"  - {month_info['name']}: {amount:,.0f} ₺{growth_str}")
                
                # Overall trend
                if len(amounts) >= 2 and amounts[0] > 0:
                    total_growth = ((amounts[-1] - amounts[0]) / amounts[0]) * 100
                    trend_icon = "↗️ Artış" if total_growth > 5 else "↘️ Azalış" if total_growth < -5 else "→ Stabil"
                    ctx_lines.append(f"  → Trend: {trend_icon}")
                ctx_lines.append("")
        else:
            ctx_lines.append("- Kategori bazlı veri bulunamadı")
        
        ctx_lines.append("")
    
    except Exception as e:
        ctx_lines.append(f"⚠️ Kategori trend analizi alınamadı: {str(e)}")
        ctx_lines.append("")

    # ===== 3. TOP 10 COUNTERPARTY ANALYSIS =====
    ctx_lines.append("=" * 70)
    ctx_lines.append("### 🏢 EN BÜYÜK 10 KARŞI TARAF (Son 90 Gün)")
    ctx_lines.append("=" * 70)
    
    try:
        start_90 = today - timedelta(days=90)
        
        # Expense side - group by counterparty from planned items
        expense_counterparties = db.query(
            PlannedCashflowItem.counterparty,
            func.count(PlannedMatch.id).label("tx_count"),
            func.coalesce(func.sum(PlannedMatch.matched_amount), 0).label("total")
        ).join(
            PlannedMatch, PlannedMatch.planned_item_id == PlannedCashflowItem.id
        ).join(
            Transaction, Transaction.id == PlannedMatch.transaction_id
        ).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.direction == "out",
            Transaction.date >= start_90,
            PlannedCashflowItem.counterparty.isnot(None)
        ).group_by(PlannedCashflowItem.counterparty).all()
        
        # Calculate total expense
        total_expense_90 = db.query(
            func.coalesce(func.sum(Transaction.amount), 0)
        ).filter(
            Transaction.company_id == company.id,
            Transaction.direction == "out",
            Transaction.date >= start_90
        ).scalar() or 0
        
        # Sort and get top 10
        expense_list = [(cp, int(tc), float(tot)) for cp, tc, tot in expense_counterparties if cp]
        expense_list.sort(key=lambda x: x[2], reverse=True)
        top_10_expense = expense_list[:10]
        
        if top_10_expense:
            ctx_lines.append("**Gider Tarafı:**")
            for i, (counterparty, tx_count, total) in enumerate(top_10_expense, 1):
                pct = safe_div(total, total_expense_90) * 100
                ctx_lines.append(f"{i}. {counterparty}: {total:,.0f} ₺ ({tx_count} işlem, toplam giderin %{pct:.1f})")
            
            # Concentration risk
            top3_total = sum(x[2] for x in top_10_expense[:3])
            top3_pct = safe_div(top3_total, total_expense_90) * 100
            risk_indicator = "🔴 YÜKSEK RİSK" if top3_pct > 50 else "🟠 ORTA" if top3_pct > 30 else "🟢 Dengeli"
            ctx_lines.append(f"\n**Konsantrasyon Riski:** Top 3 tedarikçi toplam giderin %{top3_pct:.1f}'sini oluşturuyor → {risk_indicator}")
        else:
            ctx_lines.append("**Gider Tarafı:** Counterparty bilgisi bulunamadı")
        
        ctx_lines.append("")
        
        # Income side
        income_counterparties = db.query(
            PlannedCashflowItem.counterparty,
            func.count(PlannedMatch.id).label("tx_count"),
            func.coalesce(func.sum(PlannedMatch.matched_amount), 0).label("total")
        ).join(
            PlannedMatch, PlannedMatch.planned_item_id == PlannedCashflowItem.id
        ).join(
            Transaction, Transaction.id == PlannedMatch.transaction_id
        ).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.direction == "in",
            Transaction.date >= start_90,
            PlannedCashflowItem.counterparty.isnot(None)
        ).group_by(PlannedCashflowItem.counterparty).all()
        
        total_income_90 = db.query(
            func.coalesce(func.sum(Transaction.amount), 0)
        ).filter(
            Transaction.company_id == company.id,
            Transaction.direction == "in",
            Transaction.date >= start_90
        ).scalar() or 0
        
        income_list = [(cp, int(tc), float(tot)) for cp, tc, tot in income_counterparties if cp]
        income_list.sort(key=lambda x: x[2], reverse=True)
        top_10_income = income_list[:10]
        
        if top_10_income:
            ctx_lines.append("**Gelir Tarafı:**")
            for i, (counterparty, tx_count, total) in enumerate(top_10_income, 1):
                pct = safe_div(total, total_income_90) * 100
                risk_flag = " 🔴 RİSK" if pct > 25 else ""
                ctx_lines.append(f"{i}. {counterparty}: {total:,.0f} ₺ ({tx_count} işlem, toplam gelirin %{pct:.1f}{risk_flag})")
        else:
            ctx_lines.append("**Gelir Tarafı:** Counterparty bilgisi bulunamadı")
        
        ctx_lines.append("")
    
    except Exception as e:
        ctx_lines.append(f"⚠️ Counterparty analizi alınamadı: {str(e)}")
        ctx_lines.append("")

    # ===== 4. PAYMENT DISCIPLINE METRICS =====
    ctx_lines.append("=" * 70)
    ctx_lines.append("### ⏱️ ÖDEME DİSİPLİNİ ANALİZİ (Son 90 Gün)")
    ctx_lines.append("=" * 70)
    
    try:
        start_90 = today - timedelta(days=90)
        
        # Get matched transactions with due dates
        matched_items = db.query(
            PlannedMatch,
            Transaction.date,
            PlannedCashflowItem.due_date,
            PlannedCashflowItem.category
        ).join(
            Transaction, Transaction.id == PlannedMatch.transaction_id
        ).join(
            PlannedCashflowItem, PlannedCashflowItem.id == PlannedMatch.planned_item_id
        ).filter(
            PlannedMatch.company_id == company.id,
            Transaction.date >= start_90,
            PlannedCashflowItem.due_date.isnot(None)
        ).all()
        
        if matched_items:
            total_matches = len(matched_items)
            on_time = 0
            late = 0
            total_delay_days = 0
            category_delays = {}
            
            for match, tx_date, due_date, category in matched_items:
                days_diff = (tx_date - due_date).days
                
                if days_diff <= 0:
                    on_time += 1
                else:
                    late += 1
                    total_delay_days += days_diff
                    
                    # Track by category
                    cat_name = category or "UNCATEGORIZED"
                    if cat_name not in category_delays:
                        category_delays[cat_name] = []
                    category_delays[cat_name].append(days_diff)
            
            avg_delay = safe_div(total_delay_days, late) if late > 0 else 0
            on_time_pct = safe_div(on_time, total_matches) * 100
            late_pct = safe_div(late, total_matches) * 100
            
            ctx_lines.append("**Genel Durum:**")
            ctx_lines.append(f"- Ortalama gecikme: {avg_delay:.1f} gün")
            ctx_lines.append(f"- Zamanında ödeme oranı: {on_time_pct:.0f}% (eşleşen {total_matches} işlemden {on_time}'si)")
            ctx_lines.append(f"- Geç ödeme oranı: {late_pct:.0f}% ({late} işlem)")
            ctx_lines.append("")
            
            # Categories with worst discipline
            if category_delays:
                category_avg_delays = [
                    (cat, sum(delays)/len(delays), len(delays))
                    for cat, delays in category_delays.items()
                    if delays
                ]
                category_avg_delays.sort(key=lambda x: x[1], reverse=True)
                
                ctx_lines.append("**En Çok Geciken Kategoriler:**")
                for i, (cat, avg_d, count) in enumerate(category_avg_delays[:5], 1):
                    if avg_d > 0:  # Only show categories with actual delays
                        ctx_lines.append(f"{i}. {cat}: Ortalama {avg_d:.1f} gün gecikme ({count} işlem)")
                
                ctx_lines.append("")
            
            # Early payment opportunities (estimate)
            if total_expense_90 > 0:
                potential_savings = total_expense_90 * 0.02  # 2% discount assumption
                ctx_lines.append("**Erken Ödeme Fırsatları:**")
                ctx_lines.append(f"- Potansiyel tasarruf: ~{potential_savings/3:,.0f} ₺/ay (%2 iskonto varsayımı)")
                ctx_lines.append("- Not: Tedarikçilere erken ödeme karşılığı iskonto talep edilebilir")
        else:
            ctx_lines.append("- Eşleşmiş vade bilgisi bulunamadı")
        
        ctx_lines.append("")
    
    except Exception as e:
        ctx_lines.append(f"⚠️ Ödeme disiplini analizi alınamadı: {str(e)}")
        ctx_lines.append("")

    # ===== 5. MATCHING HEALTH (Reconciliation Durumu) =====
    ctx_lines.append("=" * 70)
    ctx_lines.append("### 📋 EŞLEŞTIRME DURUMU (Reconciliation Health)")
    ctx_lines.append("=" * 70)

    try:
        auto_count = db.query(func.count(PlannedMatch.id)).filter(
            PlannedMatch.company_id == company.id,
            PlannedMatch.match_type == "AUTO"
        ).scalar() or 0

        manual_count = db.query(func.count(PlannedMatch.id)).filter(
            PlannedMatch.company_id == company.id,
            PlannedMatch.match_type != "AUTO"
        ).scalar() or 0

        partial_count = db.query(func.count(PlannedCashflowItem.id)).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.status == "PARTIAL"
        ).scalar() or 0

        overdue = db.query(func.count(PlannedCashflowItem.id)).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),
            PlannedCashflowItem.remaining_amount > 0,
            PlannedCashflowItem.due_date < today
        ).scalar() or 0

        upcoming_14 = db.query(func.count(PlannedCashflowItem.id)).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.status.in_(["OPEN", "PARTIAL"]),
            PlannedCashflowItem.remaining_amount > 0,
            PlannedCashflowItem.due_date >= today,
            PlannedCashflowItem.due_date <= (today + timedelta(days=14))
        ).scalar() or 0

        ctx_lines.append(f"- Otomatik eşleşen: {auto_count}")
        ctx_lines.append(f"- Manuel eşleşen: {manual_count}")
        ctx_lines.append(f"- Kısmi eşleşen: {partial_count}")
        ctx_lines.append(f"- **Vadesi geçmiş (işleme bekliyor): {overdue}** ⚠️")
        ctx_lines.append(f"- Yaklaşan (14 gün içinde): {upcoming_14}")
        ctx_lines.append("")

    except Exception as e:
        ctx_lines.append(f"⚠️ Matching health alınamadı: {str(e)}")
        ctx_lines.append("")

    # ===== 3. INSIGHTS (Otomatik Tespitler) =====
    ctx_lines.append("=" * 70)
    ctx_lines.append("### 💡 OTOMATIK TESPİTLER (Insights)")
    ctx_lines.append("=" * 70)

    try:
        insights_q = db.query(func.func.json_extract(Transaction.metadata, '$.insight_type')).distinct()
        # Basit yaklaşım: son 7 gün uyarı/fırsat tespitleri
        alert_days = 7
        start_alert = today - timedelta(days=alert_days)

        recent_txs = db.query(Transaction).filter(
            Transaction.company_id == company.id,
            Transaction.date >= start_alert
        ).all()

        ctx_lines.append(f"(Son {alert_days} gün analizi)")
        if len(recent_txs) > 0:
            ctx_lines.append(f"- İşlem sayısı: {len(recent_txs)}")
            ctx_lines.append(f"- Taranmış...")
        else:
            ctx_lines.append("- Son gün veri yok")
        ctx_lines.append("")

    except Exception as e:
        ctx_lines.append(f"⚠️ Insights alınamadı: {str(e)}")
        ctx_lines.append("")

    # ===== 4. FORECAST (30/60/90 Günlük Tahminler) =====
    ctx_lines.append("=" * 70)
    ctx_lines.append("### 🔮 NAKIT TAHMİNİ (30/60/90 Gün)")
    ctx_lines.append("=" * 70)

    try:
        # Basit forecast: son 90 günün ortalama günlük in/out'ı
        start_forecast = today - timedelta(days=90)
        forecast_txs = db.query(Transaction).filter(
            Transaction.company_id == company.id,
            Transaction.date >= start_forecast
        ).all()

        forecast_in = 0.0
        forecast_out = 0.0
        for tx in forecast_txs:
            if tx.direction == "in":
                forecast_in += float(tx.amount)
            else:
                forecast_out += float(tx.amount)

        days_in_forecast = (today - start_forecast).days
        avg_in = safe_div(forecast_in, days_in_forecast) if days_in_forecast > 0 else 0
        avg_out = safe_div(forecast_out, days_in_forecast) if days_in_forecast > 0 else 0
        avg_net = avg_in - avg_out

        ctx_lines.append(f"**Varsayım:** Son 90 günün ortalaması ileriye uygulanacak")
        ctx_lines.append(f"- Ort. günlük tahsilat: {avg_in:,.0f} ₺")
        ctx_lines.append(f"- Ort. günlük ödeme: {avg_out:,.0f} ₺")
        ctx_lines.append(f"- Ort. günlük net: {avg_net:,.0f} ₺")
        ctx_lines.append("")
        ctx_lines.append(f"**Tahmini nakit pozisyonu:**")
        ctx_lines.append(f"- 30. gün: {estimated_cash + avg_net * 30:,.0f} ₺")
        ctx_lines.append(f"- 60. gün: {estimated_cash + avg_net * 60:,.0f} ₺")
        ctx_lines.append(f"- 90. gün: {estimated_cash + avg_net * 90:,.0f} ₺")
        ctx_lines.append("")

    except Exception as e:
        ctx_lines.append(f"⚠️ Forecast alınamadı: {str(e)}")
        ctx_lines.append("")

    # ===== ÖZET =====
    ctx_lines.append("=" * 70)
    ctx_lines.append("### 🎯 ÖNERİLER İÇİN DİKKAT NOKTALARI")
    ctx_lines.append("=" * 70)
    ctx_lines.append("")
    ctx_lines.append("Yukarıdaki veriler ışığında şirketin finansal durumunu analiz et:")
    ctx_lines.append("1. Likidite riski nedir? Runway yeterli mi?")
    ctx_lines.append("2. Volatilite çok mu? Nakit planlaması zor mu?")
    ctx_lines.append("3. Sabit gider oranı sağlıklı mı? İndirme fırsatı var mı?")
    ctx_lines.append("4. En riskli kategoriler hangileri?")
    ctx_lines.append("5. Reconciliation gecikmeler var mı?")
    ctx_lines.append("")

    return "\n".join(ctx_lines)



def call_ai_model(question: str, context: str) -> str:
    """
    OpenAI GPT-4 ile sohbet. CFO perspektifinden finansal analiz ve tavsiye döner.
    """
    import os
    from openai import OpenAI
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "Hata: OpenAI API key bulunamadı. .env dosyasında OPENAI_API_KEY tanımla."
    
    client = OpenAI(api_key=api_key)
    
    prompt = f"""Sen deneyimli bir kurumsal CFO (Chief Financial Officer) asistansın. 
Türkçe, profesyonel ama anlaşılır bir dilde cevap ver.

GÖREV: Şirketin finansal durumunu analiz et ve başkanı/yönetim kurulunu bilgilendir.

ŞİRKET VERİLERİ:
{context}

KULLANICI SORUSU: {question}

CEVAP KURALLARINIZ:
1. **Risk Odaklı Analiz:** Risk skorlarını (Likidite, Volatilite, Konsantrasyon) detaylı tartış
2. **Actionable Öneriler:** Veri tabanlı, uygulanabilir öneriler sun
3. **Executive Summary:** Başlık, 2-3 ana bulgu, ardından detay
4. **Sayı Vurgulu:** Finansal rakamları kalın yaparak vurgula (**1.2M ₺**)
5. **Markdown Formatı:** # başlıklar, - bullet listeler, tablolar kullan
6. **Kritik Uyarılar:** Runway, overdue items, risk skorları CRİTİK ise 🔴 işaret ekle
7. **Holistik Bakış:** Çok kısa cevaplar değil, C-level yönetim muhasebesi yapısında cevapla
8. **Practical Focus:** Teorik değil, bu ay/hafta yapılacaklar üzerinde odaklan

🔴 MARKDOWN TABLO KURALLARINIZ (ÇOK ÖNEMLİ):
BU KURALLARI AYNEN TAKIP ET, YOKSA CEVAP GEÇERSİZ SAYILACAK!

1. Her tablo satırı AYRI SATIRDA olmalı (kesinlikle tek satırda yazma!)
2. Satır formatı: | Kolon1 | Kolon2 | Kolon3 |
3. Satırlar arasında HIÇBIR BOŞLUK KOYMA
4. Separator satırı (| --- | --- | --- |) MUTLAKA başlık sonrası gelecek
5. Tüm satırlar newline ile ayrılmış olacak, asla concatenate edilmeyecek

DOĞRU FORMAT:
| Metrik | Değer | Durum |
| --- | --- | --- |
| Likidite | 75.0 | 🟠 UYARI |
| Volatilite | 42.1 | 🟢 İYİ |

YANLIŞ FORMAT (BU YAPMA):
| Metrik | Değer | Durum | | --- | --- | --- | | Likidite | 75.0 | 🟠 UYARI |

ÇIKTI FORMATINI TAKIP ET:
## [Ana Başlık]
### [Alt Başlık 1: Durum Analizi]
- Bulgu 1
- Bulgu 2

### [Alt Başlık 2: Risk Değerlendirmesi]
| Metrik | Değer | Durum |
| --- | --- | --- |
| Likidite Riski | 71.4 | 🟠 UYARI |
| Volatilite Riski | 42.1 | 🟢 İYİ |
| Konsantrasyon Riski | 55.0 | 🟠 UYARI |

### [Alt Başlık 3: Önerilen Aksiyonlar]
1. Acil (bu hafta)
2. Kısa dönem (bu ay)
3. Uzun dönem (bu çeyrek)

Cevabını **Markdown formatında** döndür. İçinde raw transaction listeleri değil, summary + insight + advice olsun.
TABLOLARDAKI SEPARATOR SATIRI ASLA ATMA!
HER TABLO SATIRI YENİ LİNEDE OLACAK, ASLA TEK SATIRDA YAZILMAYACAK!"""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2000,
        )
        answer = response.choices[0].message.content
        
        # Markdown table'ları düzelt: tüm pipe satırlarını newline ile ayır
        # Problem: "| a | b | | --- |" tüm tek satırda -> newline ekle
        # Pattern: "| ... | | ..." -> "| ... |\n| ..."
        # Regex: Pipe ile biten satır + space + pipe ile başlayan -> aralarına newline koy
        answer = answer.replace("| |", "|\n|")  # First pass: "| |" -> "|\n|"
        
        # Second pass: remaining cases where dashes are concatenated
        # "| ------- |" should be on new line if preceded by data
        import re
        answer = re.sub(r'(\|\s*[^\|]*\|\s*)(\|\s*---)', r'\1\n\2', answer)
        
        return answer
    except Exception as e:
        return f"OpenAI isteği başarısız: {str(e)}"


@router.post("/query", response_model=AIQueryResponse)
def ai_query(
    payload: AIQueryRequest,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    if not payload.question or payload.question.strip() == "":
        raise HTTPException(status_code=400, detail="Soru boş olamaz")

    context = build_financial_context(db, current_company)
    answer = call_ai_model(payload.question, context)

    return AIQueryResponse(answer=answer)
