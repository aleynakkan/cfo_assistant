from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.planned_item import PlannedCashflowItem
from app.models.planned_match import PlannedMatch


def recompute_planned_status(db: Session, company_id: int, planned_item_id: int):
    item = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.id == planned_item_id,
        PlannedCashflowItem.company_id == company_id
    ).first()
    if not item:
        return None

    settled = db.query(func.coalesce(func.sum(PlannedMatch.matched_amount), 0)).filter(
        PlannedMatch.company_id == company_id,
        PlannedMatch.planned_item_id == planned_item_id
    ).scalar() or 0

    settled = float(settled)
    expected = float(item.amount)
    remaining = max(expected - settled, 0.0)

    item.settled_amount = settled
    item.remaining_amount = remaining

    if remaining <= 0.005:
        item.status = "SETTLED"
        remaining = 0.0
    elif settled > 0:
        item.status = "PARTIAL"
    else:
        item.status = "OPEN"

    item.remaining_amount = remaining
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
