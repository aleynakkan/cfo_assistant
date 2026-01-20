from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.deps import get_db, get_current_company
from app.models.planned_item import PlannedCashflowItem
from app.models.transaction import Transaction
from app.models.planned_match import PlannedMatch
from app.schemas.match import MatchCreate
from app.services.planned_recompute import recompute_planned_status

router = APIRouter(prefix="", tags=["matches"])

@router.get("/matches")
def get_all_matches(
    db: Session = Depends(get_db),
    company = Depends(get_current_company),
):
    """Tüm eşleşmeleri listele - detaylı bilgiler ile"""
    company_id = company.id

    matches = db.query(PlannedMatch).filter(
        PlannedMatch.company_id == company_id
    ).all()

    result = []
    for m in matches:
        # Planned item detaylarını al
        planned = db.query(PlannedCashflowItem).filter(
            PlannedCashflowItem.id == m.planned_item_id
        ).first()
        
        # Transaction detaylarını al
        tx = db.query(Transaction).filter(
            Transaction.id == m.transaction_id
        ).first()
        
        result.append({
            "id": m.id,
            "match_id": m.id,
            "planned_item_id": m.planned_item_id,
            "planned_reference": planned.reference_no if planned else "",
            "planned_counterparty": planned.counterparty if planned else "",
            "planned_amount": float(planned.amount) if planned else 0,
            "planned_due_date": planned.due_date.isoformat() if planned and planned.due_date else "",
            "planned_status": planned.status if planned else "",
            "transaction_id": m.transaction_id,
            "transaction_description": tx.description if tx else "",
            "transaction_date": tx.date.isoformat() if tx and tx.date else "",
            "transaction_amount": float(tx.amount) if tx else 0,
            "matched_amount": float(m.matched_amount),
            "match_type": m.match_type,
            "created_at": m.created_at.isoformat() if hasattr(m, 'created_at') and m.created_at else None,
        })

    return result

@router.post("/matches")
def create_match(
    payload: MatchCreate,
    db: Session = Depends(get_db),
    company = Depends(get_current_company),
):
    company_id = company.id

    item = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.company_id == company_id,
        PlannedCashflowItem.id == payload.planned_item_id,
    ).first()
    if not item:
        raise HTTPException(404, "Planned item bulunamadı")

    if item.status not in ("OPEN", "PARTIAL"):
        raise HTTPException(400, f"Bu planned kalem eşleşmeye kapalı: {item.status}")

    tx = db.query(Transaction).filter(
        Transaction.company_id == company_id,
        Transaction.id == payload.transaction_id,
    ).first()
    if not tx:
        raise HTTPException(404, "Transaction bulunamadı")

    if tx.direction != item.direction:
        raise HTTPException(400, "Direction uyumsuz (in/out)")

    remaining = float(item.remaining_amount)
    if payload.matched_amount - remaining > 0.01:
        raise HTTPException(400, f"Matched amount remaining'den büyük olamaz. Remaining={remaining:.2f}")

    exists = db.query(PlannedMatch).filter(
        PlannedMatch.company_id == company_id,
        PlannedMatch.planned_item_id == item.id,
        PlannedMatch.transaction_id == tx.id,
    ).first()
    if exists:
        raise HTTPException(409, "Bu transaction zaten bu planned kalem ile eşleştirilmiş")

    m = PlannedMatch(
        company_id=company_id,
        planned_item_id=item.id,
        transaction_id=tx.id,
        matched_amount=payload.matched_amount,
        match_type=payload.match_type or "MANUAL",
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    updated = recompute_planned_status(db, company_id, item.id)

    return {
        "match_id": m.id,
        "planned_item_id": item.id,
        "transaction_id": tx.id,
        "planned_status": updated.status,
        "settled_amount": float(updated.settled_amount),
        "remaining_amount": float(updated.remaining_amount),
    }


@router.delete("/matches/{match_id}")
def delete_match(
    match_id: int,
    db: Session = Depends(get_db),
    company = Depends(get_current_company),
):
    company_id = company.id

    m = db.query(PlannedMatch).filter(
        PlannedMatch.company_id == company_id,
        PlannedMatch.id == match_id,
    ).first()
    if not m:
        raise HTTPException(404, "Match bulunamadı")

    planned_item_id = m.planned_item_id

    db.delete(m)
    db.commit()

    updated = recompute_planned_status(db, company_id, planned_item_id)

    return {
        "deleted": True,
        "planned_item_id": planned_item_id,
        "planned_status": updated.status if updated else None,
        "settled_amount": float(updated.settled_amount) if updated else None,
        "remaining_amount": float(updated.remaining_amount) if updated else None,
    }


@router.get("/planned/{planned_id}/match-suggestions")
def planned_match_suggestions(
    planned_id: str,
    db: Session = Depends(get_db),
    company = Depends(get_current_company),
):
    company_id = company.id

    item = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.company_id == company_id,
        PlannedCashflowItem.id == planned_id,
        PlannedCashflowItem.status.in_(["OPEN","PARTIAL"]),
    ).first()
    if not item:
        raise HTTPException(404, "Planned item bulunamadı veya eşleşmeye kapalı")

    remaining = float(item.remaining_amount)
    if remaining <= 0:
        return {"planned_id": planned_id, "remaining_amount": remaining, "suggestions": []}

    window_start = item.due_date - timedelta(days=10)
    window_end = item.due_date + timedelta(days=10)

    matched_tx_ids = db.query(PlannedMatch.transaction_id).filter(
        PlannedMatch.company_id == company_id
    ).subquery()

    # Build planned item keywords for description matching
    planned_keywords = []
    if item.counterparty:
        planned_keywords.append(item.counterparty.lower())
    if item.reference_no:
        planned_keywords.append(item.reference_no.lower())

    # Query 1: Amount-based matches in date window
    candidates = db.query(Transaction).filter(
        Transaction.company_id == company_id,
        Transaction.direction == item.direction,
        Transaction.date >= window_start,
        Transaction.date <= window_end,
        ~Transaction.id.in_(matched_tx_ids),
        Transaction.amount <= remaining * 1.02,
    ).order_by(func.abs(Transaction.amount - remaining).asc()).limit(15).all()

    # Query 2: Description-based matches (counterparty/reference_no in description)
    desc_matches = []
    if planned_keywords:
        desc_matches = db.query(Transaction).filter(
            Transaction.company_id == company_id,
            Transaction.direction == item.direction,
            ~Transaction.id.in_(matched_tx_ids),
        ).limit(20).all()
        desc_matches = [
            tx for tx in desc_matches
            if any(kw in (tx.description or "").lower() for kw in planned_keywords)
        ]

    # Query 3: Fallback - any transaction matching direction (if no amount/desc matches)
    fallback_candidates = []
    if len(candidates) == 0 and len(desc_matches) == 0:
        fallback_candidates = db.query(Transaction).filter(
            Transaction.company_id == company_id,
            Transaction.direction == item.direction,
            ~Transaction.id.in_(matched_tx_ids),
        ).order_by(func.abs(Transaction.amount - remaining).asc()).limit(10).all()

    # Merge all candidates, prioritizing description matches
    all_candidates = candidates + desc_matches + fallback_candidates

    # Remove duplicates by transaction_id
    seen = set()
    unique_candidates = []
    for tx in all_candidates:
        if tx.id not in seen:
            unique_candidates.append(tx)
            seen.add(tx.id)
    candidates = unique_candidates

    out = []
    for tx in candidates:
        amt = float(tx.amount)
        amt_diff = abs(amt - remaining)
        day_diff = abs((tx.date - item.due_date).days)

        score = 0
        # Amount scoring (max 30)
        if amt_diff <= 0.01:
            score += 30
        elif amt < remaining:
            score += 18

        # Date scoring (max 12)
        if day_diff <= 2:
            score += 12
        elif day_diff <= 7:
            score += 8
        elif day_diff <= 14:
            score += 3

        # Description scoring (max 58)
        desc = (tx.description or "").lower()
        cp = (item.counterparty or "").lower()
        ref = (item.reference_no or "").lower()
        
        if cp and cp in desc:
            score += 28
        if ref and ref in desc:
            score += 30

        # Cap score at 100
        score = min(score, 100)

        out.append({
            "transaction_id": tx.id,
            "date": tx.date.isoformat(),
            "amount": amt,
            "description": tx.description,
            "score": score,
            "suggested_match_amount": min(amt, remaining),
        })

    out.sort(key=lambda x: x["score"], reverse=True)
    return {"planned_id": planned_id, "remaining_amount": remaining, "suggestions": out}
