# app/services/counterparty_service.py
"""
Counterparty Intelligence service layer.
- CRUD helpers
- Name normalization
- Alias-based & fuzzy matching against bank descriptions
- Analytics computation
"""

import re
import unicodedata
import logging
from typing import Optional, List, Dict

from sqlalchemy.orm import Session
from sqlalchemy import func, case

from app.models.counterparty import Counterparty, CounterpartyAlias
from app.models.planned_item import PlannedCashflowItem
from app.models.planned_match import PlannedMatch
from app.models.transaction import Transaction

logger = logging.getLogger(__name__)

# ── rapidfuzz (already in requirements.txt) ──
RAPIDFUZZ_AVAILABLE = False
try:
    from rapidfuzz import fuzz as rf_fuzz
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    logger.warning("rapidfuzz not installed. Fuzzy counterparty matching disabled.")

FUZZY_THRESHOLD = 90  # strict default


# ═══════════════════════════════════════════
#  Normalization
# ═══════════════════════════════════════════

def normalize_name(name: str) -> str:
    """Normalize a counterparty / alias string for dedup & matching."""
    if not name:
        return ""
    name = unicodedata.normalize("NFKD", name)
    name = name.lower().strip()
    name = re.sub(r"[^\w\s]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


# ═══════════════════════════════════════════
#  CRUD helpers
# ═══════════════════════════════════════════

def create_counterparty(
    db: Session,
    company_id: int,
    name: str,
    cp_type: str = "OTHER",
    notes: Optional[str] = None,
    vkn: Optional[str] = None,
) -> Counterparty:
    normalized = normalize_name(name)
    cp = Counterparty(
        company_id=company_id,
        name=name.strip(),
        normalized_name=normalized,
        type=cp_type.upper(),
        notes=notes,
        vkn=vkn.strip() if vkn else None,
    )
    db.add(cp)
    db.commit()
    db.refresh(cp)
    logger.info(f"Created counterparty id={cp.id} name={cp.name} vkn={cp.vkn} company={company_id}")
    return cp


def get_counterparty(db: Session, company_id: int, counterparty_id: int) -> Optional[Counterparty]:
    return db.query(Counterparty).filter(
        Counterparty.id == counterparty_id,
        Counterparty.company_id == company_id,
    ).first()


def list_counterparties(db: Session, company_id: int, active_only: bool = True) -> List[Counterparty]:
    q = db.query(Counterparty).filter(Counterparty.company_id == company_id)
    if active_only:
        q = q.filter(Counterparty.is_active == True)  # noqa: E712
    return q.order_by(Counterparty.name).all()


def update_counterparty(db: Session, cp: Counterparty, **kwargs) -> Counterparty:
    if "name" in kwargs and kwargs["name"] is not None:
        cp.name = kwargs["name"].strip()
        cp.normalized_name = normalize_name(cp.name)
    if "type" in kwargs and kwargs["type"] is not None:
        cp.type = kwargs["type"].upper()
    if "vkn" in kwargs:
        cp.vkn = kwargs["vkn"].strip() if kwargs["vkn"] else None
    if "notes" in kwargs and kwargs["notes"] is not None:
        cp.notes = kwargs["notes"]
    if "is_active" in kwargs and kwargs["is_active"] is not None:
        cp.is_active = kwargs["is_active"]
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return cp


def delete_counterparty(db: Session, cp: Counterparty) -> None:
    """Soft delete."""
    cp.is_active = False
    db.add(cp)
    db.commit()


# ═══════════════════════════════════════════
#  Alias helpers
# ═══════════════════════════════════════════

def add_alias(db: Session, company_id: int, counterparty_id: int, alias_text: str) -> CounterpartyAlias:
    normalized = normalize_name(alias_text)
    a = CounterpartyAlias(
        counterparty_id=counterparty_id,
        company_id=company_id,
        alias=alias_text.strip(),
        normalized_alias=normalized,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def list_aliases(db: Session, company_id: int, counterparty_id: int) -> List[CounterpartyAlias]:
    return db.query(CounterpartyAlias).filter(
        CounterpartyAlias.counterparty_id == counterparty_id,
        CounterpartyAlias.company_id == company_id,
    ).order_by(CounterpartyAlias.alias).all()


def delete_alias(db: Session, alias_id: int, company_id: int) -> bool:
    a = db.query(CounterpartyAlias).filter(
        CounterpartyAlias.id == alias_id,
        CounterpartyAlias.company_id == company_id,
    ).first()
    if a:
        db.delete(a)
        db.commit()
        return True
    return False


# ═══════════════════════════════════════════
#  Counterparty Resolution (from bank desc)
# ═══════════════════════════════════════════

def resolve_counterparty_from_description(
    db: Session,
    company_id: int,
    description: str,
    threshold: int = FUZZY_THRESHOLD,
    vkn: Optional[str] = None,
) -> Optional[int]:
    """
    Attempt to resolve a counterparty_id from a transaction description.
    
    Strategy:
    0) If VKN is provided, exact match by VKN (highest priority)
    1) Exact substring match against aliases  (fast, precise)
    2) Fuzzy match against aliases            (slower, with threshold)
    
    Returns counterparty_id or None.
    """
    # ── 0) VKN exact match (top priority) ──
    if vkn and vkn.strip():
        cp = db.query(Counterparty).filter(
            Counterparty.company_id == company_id,
            Counterparty.vkn == vkn.strip(),
            Counterparty.is_active == True,  # noqa: E712
        ).first()
        if cp:
            logger.debug(f"Counterparty resolved via VKN: '{vkn}' → cp_id={cp.id}")
            return cp.id

    if not description:
        return None

    norm_desc = normalize_name(description)
    if not norm_desc:
        return None

    # ── 1) Exact substring match ──
    aliases = db.query(CounterpartyAlias).filter(
        CounterpartyAlias.company_id == company_id,
    ).all()

    for a in aliases:
        if a.normalized_alias and a.normalized_alias in norm_desc:
            logger.debug(f"Counterparty resolved via alias substring: '{a.alias}' in '{description}' → cp_id={a.counterparty_id}")
            return a.counterparty_id

    # ── 2) Fuzzy match ──
    if RAPIDFUZZ_AVAILABLE and aliases:
        best_score = 0
        best_cp_id = None
        for a in aliases:
            score = rf_fuzz.partial_ratio(a.normalized_alias, norm_desc)
            if score > best_score:
                best_score = score
                best_cp_id = a.counterparty_id
        if best_score >= threshold:
            logger.debug(f"Counterparty resolved via fuzzy match (score={best_score}): cp_id={best_cp_id}")
            return best_cp_id

    return None


# ═══════════════════════════════════════════
#  Counterparty propagation after matching
# ═══════════════════════════════════════════

def propagate_counterparty(db: Session, company_id: int, tx: Transaction, planned: PlannedCashflowItem) -> None:
    """
    After a PlannedMatch is created, propagate counterparty_id.
    1) If planned item has counterparty_id → copy to transaction
    2) Else try to resolve from tx.description via aliases
    3) If resolved → set on both planned item and transaction
    """
    cp_id = None

    # Priority 1: planned item already linked
    if planned.counterparty_id:
        cp_id = planned.counterparty_id
        logger.debug(f"Propagate: using planned.counterparty_id={cp_id}")
    else:
        # Priority 2: resolve from description
        cp_id = resolve_counterparty_from_description(db, company_id, tx.description)
        if cp_id:
            logger.debug(f"Propagate: resolved counterparty_id={cp_id} from tx description")
            # Also link the planned item for future
            planned.counterparty_id = cp_id
            db.add(planned)

    if cp_id and not tx.counterparty_id:
        tx.counterparty_id = cp_id
        db.add(tx)
        db.commit()
        logger.info(f"Counterparty propagated: tx={tx.id} → counterparty_id={cp_id}")


# ═══════════════════════════════════════════
#  Analytics
# ═══════════════════════════════════════════

def compute_counterparty_metrics(db: Session, company_id: int) -> List[Dict]:
    """
    Compute per-counterparty analytics:
    - total_planned, total_paid, outstanding
    - avg_payment_delay_days, on_time_rate, late_rate
    - risk_score
    """
    counterparties = list_counterparties(db, company_id, active_only=True)
    results = []

    for cp in counterparties:
        # Planned items linked to this counterparty
        planned_items = db.query(PlannedCashflowItem).filter(
            PlannedCashflowItem.company_id == company_id,
            PlannedCashflowItem.counterparty_id == cp.id,
        ).all()

        if not planned_items:
            results.append({
                "counterparty_id": cp.id,
                "counterparty_name": cp.name,
                "counterparty_type": cp.type,
                "counterparty_vkn": cp.vkn,
                "total_planned": 0,
                "total_paid": 0,
                "outstanding": 0,
                "match_count": 0,
                "avg_payment_delay_days": None,
                "on_time_rate": None,
                "late_rate": None,
                "risk_score": None,
            })
            continue

        total_planned = sum(float(p.amount) for p in planned_items)
        total_paid = sum(float(p.settled_amount) for p in planned_items)
        outstanding = sum(
            float(p.remaining_amount)
            for p in planned_items
            if p.status in ("OPEN", "PARTIAL")
        )

        # Payment delay analysis: for SETTLED items, get match dates
        settled_ids = [p.id for p in planned_items if p.status == "SETTLED"]
        delays = []

        if settled_ids:
            matches = db.query(PlannedMatch, Transaction, PlannedCashflowItem).join(
                Transaction, PlannedMatch.transaction_id == Transaction.id
            ).join(
                PlannedCashflowItem, PlannedMatch.planned_item_id == PlannedCashflowItem.id
            ).filter(
                PlannedMatch.company_id == company_id,
                PlannedMatch.planned_item_id.in_(settled_ids),
            ).all()

            for match, tx, pi in matches:
                if tx.date and pi.due_date:
                    delay = (tx.date - pi.due_date).days
                    delays.append(delay)

        match_count = len(delays)
        avg_delay = None
        on_time_rate = None
        late_rate = None
        risk_score = None

        if delays:
            avg_delay = round(sum(delays) / len(delays), 1)
            on_time = sum(1 for d in delays if d <= 0)
            late = sum(1 for d in delays if d > 0)
            on_time_rate = round(on_time / len(delays), 3)
            late_rate = round(late / len(delays), 3)

            # Risk score: 0 (best) to 100 (worst)
            # Formula: 40% late_rate + 40% normalized_avg_delay + 20% outstanding_ratio
            norm_delay = min(max(avg_delay, 0), 30) / 30  # cap at 30 days
            outstanding_ratio = outstanding / total_planned if total_planned > 0 else 0
            risk_score = round(
                (late_rate * 40) + (norm_delay * 40) + (outstanding_ratio * 20),
                1,
            )

        results.append({
            "counterparty_id": cp.id,
            "counterparty_name": cp.name,
            "counterparty_type": cp.type,
            "counterparty_vkn": cp.vkn,
            "total_planned": round(total_planned, 2),
            "total_paid": round(total_paid, 2),
            "outstanding": round(outstanding, 2),
            "match_count": match_count,
            "avg_payment_delay_days": avg_delay,
            "on_time_rate": on_time_rate,
            "late_rate": late_rate,
            "risk_score": risk_score,
        })

    return results


def get_single_counterparty_metrics(db: Session, company_id: int, counterparty_id: int) -> Optional[Dict]:
    """Get metrics for a single counterparty."""
    all_metrics = compute_counterparty_metrics(db, company_id)
    for m in all_metrics:
        if m["counterparty_id"] == counterparty_id:
            return m
    return None
