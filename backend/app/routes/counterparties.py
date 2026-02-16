# app/routes/counterparties.py
"""
REST API for Counterparty Intelligence.
Prefix: /counterparties
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.deps import get_db, get_current_company
from app.models.company import Company
from app.models.counterparty import Counterparty, CounterpartyAlias
from app.schemas.counterparty import (
    CounterpartyCreate,
    CounterpartyUpdate,
    CounterpartyResponse,
    CounterpartyWithAliases,
    AliasCreate,
    AliasResponse,
    CounterpartyMetrics,
    BackfillResult,
)
from app.services.counterparty_service import (
    create_counterparty,
    get_counterparty,
    list_counterparties,
    update_counterparty,
    delete_counterparty,
    add_alias,
    list_aliases,
    delete_alias,
    compute_counterparty_metrics,
    get_single_counterparty_metrics,
    normalize_name,
)
from app.models.planned_item import PlannedCashflowItem

router = APIRouter()


# ═══════════════════════════════════════════
#  CRUD — Counterparties
# ═══════════════════════════════════════════

@router.get("", response_model=List[CounterpartyResponse])
@router.get("/", response_model=List[CounterpartyResponse])
def list_all(
    active_only: bool = True,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """List all counterparties for the current company."""
    return list_counterparties(db, company.id, active_only=active_only)


@router.post("", response_model=CounterpartyResponse)
@router.post("/", response_model=CounterpartyResponse)
def create(
    payload: CounterpartyCreate,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Create a new counterparty."""
    if payload.type and payload.type.upper() not in ("CUSTOMER", "SUPPLIER", "OTHER"):
        raise HTTPException(400, "type must be CUSTOMER, SUPPLIER, or OTHER")
    try:
        cp = create_counterparty(db, company.id, payload.name, payload.type, payload.notes, payload.vkn)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"'{payload.name}' adında bir cari zaten mevcut.")
    return cp


@router.get("/{counterparty_id}", response_model=CounterpartyWithAliases)
def get_one(
    counterparty_id: int,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Get a single counterparty with its aliases."""
    cp = get_counterparty(db, company.id, counterparty_id)
    if not cp:
        raise HTTPException(404, "Cari bulunamadı")
    aliases = list_aliases(db, company.id, cp.id)
    return {
        **cp.__dict__,
        "aliases": aliases,
    }


@router.put("/{counterparty_id}", response_model=CounterpartyResponse)
def update(
    counterparty_id: int,
    payload: CounterpartyUpdate,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Update a counterparty."""
    cp = get_counterparty(db, company.id, counterparty_id)
    if not cp:
        raise HTTPException(404, "Cari bulunamadı")
    try:
        cp = update_counterparty(
            db, cp,
            name=payload.name,
            type=payload.type,
            vkn=payload.vkn,
            notes=payload.notes,
            is_active=payload.is_active,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Bu isimde bir cari zaten mevcut.")
    return cp


@router.delete("/{counterparty_id}")
def soft_delete(
    counterparty_id: int,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Soft-delete a counterparty (set is_active=false)."""
    cp = get_counterparty(db, company.id, counterparty_id)
    if not cp:
        raise HTTPException(404, "Cari bulunamadı")
    delete_counterparty(db, cp)
    return {"detail": "Cari pasife alındı"}


# ═══════════════════════════════════════════
#  Aliases
# ═══════════════════════════════════════════

@router.get("/{counterparty_id}/aliases", response_model=List[AliasResponse])
def get_aliases(
    counterparty_id: int,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """List aliases for a counterparty."""
    cp = get_counterparty(db, company.id, counterparty_id)
    if not cp:
        raise HTTPException(404, "Cari bulunamadı")
    return list_aliases(db, company.id, cp.id)


@router.post("/{counterparty_id}/aliases", response_model=AliasResponse)
def create_alias(
    counterparty_id: int,
    payload: AliasCreate,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Add an alias (bank description fragment) to a counterparty."""
    cp = get_counterparty(db, company.id, counterparty_id)
    if not cp:
        raise HTTPException(404, "Cari bulunamadı")
    try:
        a = add_alias(db, company.id, cp.id, payload.alias)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Bu alias zaten tanımlı.")
    return a


@router.delete("/{counterparty_id}/aliases/{alias_id}")
def remove_alias(
    counterparty_id: int,
    alias_id: int,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Delete an alias."""
    ok = delete_alias(db, alias_id, company.id)
    if not ok:
        raise HTTPException(404, "Alias bulunamadı")
    return {"detail": "Alias silindi"}


# ═══════════════════════════════════════════
#  Analytics / Metrics
# ═══════════════════════════════════════════

@router.get("/metrics/all", response_model=List[CounterpartyMetrics])
def all_metrics(
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Get performance metrics for all counterparties."""
    return compute_counterparty_metrics(db, company.id)


@router.get("/{counterparty_id}/metrics", response_model=CounterpartyMetrics)
def single_metrics(
    counterparty_id: int,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Get performance metrics for a single counterparty."""
    m = get_single_counterparty_metrics(db, company.id, counterparty_id)
    if not m:
        raise HTTPException(404, "Cari bulunamadı veya metrik hesaplanamadı")
    return m


# ═══════════════════════════════════════════
#  Backfill utility (admin)
# ═══════════════════════════════════════════

@router.post("/backfill", response_model=BackfillResult)
def backfill_from_planned(
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Create counterparties from existing planned_cashflow_items.counterparty text.
    Safe to run multiple times (idempotent).
    """
    rows = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.company_id == company.id,
        PlannedCashflowItem.counterparty.isnot(None),
        PlannedCashflowItem.counterparty != "",
        PlannedCashflowItem.counterparty_id.is_(None),
    ).all()

    created_count = 0
    skipped_count = 0
    linked_count = 0
    errors = []

    for item in rows:
        raw = item.counterparty.strip()
        normalized = normalize_name(raw)
        if not normalized:
            skipped_count += 1
            continue

        # Find or create
        existing = db.query(Counterparty).filter(
            Counterparty.company_id == company.id,
            Counterparty.normalized_name == normalized,
        ).first()

        if existing:
            cp_id = existing.id
            skipped_count += 1
        else:
            try:
                cp = create_counterparty(db, company.id, raw)
                cp_id = cp.id
                created_count += 1
            except IntegrityError:
                db.rollback()
                skipped_count += 1
                continue
            except Exception as e:
                errors.append(f"Error creating '{raw}': {str(e)}")
                continue

        item.counterparty_id = cp_id
        db.add(item)
        linked_count += 1

    db.commit()

    return BackfillResult(
        created=created_count,
        skipped=skipped_count,
        linked=linked_count,
        errors=errors,
    )
