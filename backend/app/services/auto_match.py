# backend/app/services/auto_match.py
"""
Automatic matching service for transactions and planned cashflow items.
Rules:
- Exact amount match (no tolerance)
- Direction must match
- Date window: ±7 days
- Reference-first: if planned.reference_no exists and appears in tx.description, prefer that
- Ambiguity: if multiple candidates with same date distance, do NOT auto-match
"""

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import logging

from app.models.planned_item import PlannedCashflowItem
from app.models.planned_match import PlannedMatch
from app.models.transaction import Transaction
from app.services.planned_recompute import recompute_planned_status

logger = logging.getLogger(__name__)


def auto_match_transaction(db: Session, tx: Transaction, company_id: int) -> list:
    """
    Attempts to auto-match a newly created Transaction with PlannedCashflowItems.
    
    Returns:
        List of created PlannedMatch objects (may be empty).
    
    Rules enforced:
    1. Exact amount equality (tx.amount == planned.remaining_amount)
    2. Direction match (tx.direction == planned.direction)
    3. Date window: |tx.date - planned.due_date| <= 7 days
    4. Status: planned item must be in ["OPEN", "PARTIAL", "SETTLED"]
    5. Reference-first: if planned.reference_no non-empty and substring in tx.description, prefer those
    6. Ambiguity: if multiple candidates with same date distance, skip auto-match (log warning)
    7. Idempotency: check existing match before creating
    """
    created_matches = []
    
    # Step 1: Query candidate planned items
    # Base filters: company, direction, status, exact remaining_amount
    candidates = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.company_id == company_id,
        PlannedCashflowItem.direction == tx.direction,
        PlannedCashflowItem.status.in_(["OPEN", "PARTIAL", "SETTLED"]),
        PlannedCashflowItem.remaining_amount == tx.amount
    ).all()
    
    if not candidates:
        logger.debug(f"Auto-match: No candidates for tx {tx.id} (amount={tx.amount}, direction={tx.direction})")
        return created_matches
    
    logger.debug(f"Auto-match: Found {len(candidates)} initial candidates for tx {tx.id}")
    
    # Step 2: Filter by date window (±7 days)
    DATE_WINDOW_DAYS = 7
    candidates_in_window = [
        p for p in candidates 
        if abs((tx.date - p.due_date).days) <= DATE_WINDOW_DAYS
    ]
    
    if not candidates_in_window:
        logger.debug(f"Auto-match: No candidates within ±{DATE_WINDOW_DAYS} days for tx {tx.id}")
        return created_matches
    
    logger.debug(f"Auto-match: {len(candidates_in_window)} candidates within date window for tx {tx.id}")
    
    # Step 3: Prefer reference_no matches
    # If any candidate has non-empty reference_no and that string appears in tx.description, use those
    ref_matches = [
        p for p in candidates_in_window
        if p.reference_no and p.reference_no.strip() and p.reference_no in (tx.description or "")
    ]
    
    if ref_matches:
        candidates_in_window = ref_matches
        logger.debug(f"Auto-match: {len(ref_matches)} candidates matched by reference_no for tx {tx.id}")
    
    # Step 4: Handle multiple candidates
    if len(candidates_in_window) > 1:
        # Sort by nearest due_date
        candidates_in_window.sort(key=lambda p: abs((tx.date - p.due_date).days))
        
        # Check for ambiguity: if top 2 have same distance, do NOT auto-match
        distance_0 = abs((tx.date - candidates_in_window[0].due_date).days)
        distance_1 = abs((tx.date - candidates_in_window[1].due_date).days)
        
        if distance_0 == distance_1:
            logger.warning(
                f"Auto-match AMBIGUOUS for tx {tx.id}: multiple candidates with equal date distance. "
                f"Candidates: {[p.id for p in candidates_in_window[:3]]}"
            )
            return created_matches
    
    # Step 5: We have a unique candidate
    planned = candidates_in_window[0]
    
    logger.info(
        f"Auto-match candidate selected: tx {tx.id} -> planned {planned.id} "
        f"(amount={tx.amount}, date_diff={abs((tx.date - planned.due_date).days)} days)"
    )
    
    # Step 6: Idempotency check — ensure no existing match
    existing = db.query(PlannedMatch).filter(
        PlannedMatch.planned_item_id == planned.id,
        PlannedMatch.transaction_id == tx.id,
        PlannedMatch.company_id == company_id
    ).first()
    
    if existing:
        logger.debug(f"Auto-match: Match already exists (match_id={existing.id}) for tx {tx.id} and planned {planned.id}")
        return created_matches
    
    # Step 7: Create PlannedMatch
    match = PlannedMatch(
        planned_item_id=planned.id,
        transaction_id=tx.id,
        matched_amount=tx.amount,
        match_type="AUTO",
        company_id=company_id,
    )
    
    db.add(match)
    
    try:
        db.commit()
        db.refresh(match)
        logger.info(f"Auto-match SUCCESS: created match_id={match.id} for tx {tx.id} -> planned {planned.id}")
        created_matches.append(match)
        
        # Step 8: Recompute planned item status/remaining
        recompute_planned_status(db, company_id, planned.id)
        
    except IntegrityError as ie:
        db.rollback()
        logger.warning(
            f"Auto-match: IntegrityError (likely duplicate) for tx {tx.id} planned {planned.id}: {ie}"
        )
    except Exception as e:
        db.rollback()
        logger.exception(f"Auto-match: Failed to commit match for tx {tx.id} planned {planned.id}: {e}")
    
    return created_matches
