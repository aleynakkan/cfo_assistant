# app/routes/planned.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from decimal import Decimal
from io import StringIO
import csv
from typing import List

from app.core.deps import get_db, get_current_company
from app.models.planned_item import PlannedCashflowItem
from app.models.planned_item_schema import (
    PlannedItemCreate,
    PlannedItemResponse,
    PlannedMatchCreate,
    PlannedMatchResponse,
)
from app.models.company import Company
from app.models.planned_match import PlannedMatch
from app.models.transaction import Transaction, TransactionSchema
from app.services.planned_recompute import recompute_planned_status

router = APIRouter()


@router.post("/", response_model=PlannedItemResponse)
@router.post("", response_model=PlannedItemResponse)
def create_planned_item(
    payload: PlannedItemCreate,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):

    if payload.direction not in ("in", "out"):
        raise HTTPException(status_code=400, detail="direction sadece 'in' veya 'out' olabilir")

    item = PlannedCashflowItem(
        type=payload.type,
        direction=payload.direction,
        amount=payload.amount,
        due_date=payload.due_date,
        counterparty=payload.counterparty,
        reference_no=payload.reference_no,
        source="manual",
        settled_amount=0,
        remaining_amount=payload.amount,
        status="OPEN",
        company_id=current_company.id,
    )

    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/upload-csv")
async def upload_planned_items_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Lütfen CSV formatında dosya yükleyin.")

    content = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(StringIO(content))

    required_columns = {"type", "direction", "amount", "due_date", "counterparty"}
    if not required_columns.issubset(set(reader.fieldnames or [])):
        raise HTTPException(
            status_code=400,
            detail=f"CSV şu kolonları içermeli: {', '.join(required_columns)}",
        )

    inserted = 0
    errors = []

    for idx, row in enumerate(reader, start=1):
        try:
            type_val = row["type"].strip().upper()
            direction = row["direction"].strip().lower()
            amount = Decimal(row["amount"].strip().replace(",", "."))
            due_date = datetime.strptime(row["due_date"].strip(), "%Y-%m-%d").date()
            counterparty = row["counterparty"].strip()
            reference_no = row.get("reference_no", "").strip() or None

            if direction not in ("in", "out"):
                raise ValueError("direction sadece 'in' veya 'out' olabilir")

            if type_val not in ("INVOICE", "PO", "OTHER"):
                raise ValueError("type sadece 'INVOICE', 'PO' veya 'OTHER' olabilir")

            item = PlannedCashflowItem(
                type=type_val,
                direction=direction,
                amount=amount,
                due_date=due_date,
                counterparty=counterparty,
                reference_no=reference_no,
                source="csv",
                status="OPEN",
                settled_amount=0,
                remaining_amount=amount,
                company_id=current_company.id,
            )
            db.add(item)
            inserted += 1
        except Exception as e:
            errors.append(f"Satır {idx}: {e}")

    db.commit()

    return {
        "inserted": inserted,
        "errors": errors,
    }


@router.get("/", response_model=list[PlannedItemResponse])
@router.get("", response_model=list[PlannedItemResponse])
def list_planned_items(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    items = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.status.in_(["OPEN", "PARTIAL", "SETTLED"]),
        PlannedCashflowItem.company_id == current_company.id
    ).all()
    return items


@router.post("/{planned_id}/matches", response_model=PlannedMatchResponse)
def create_planned_match(
    planned_id: str,
    payload: PlannedMatchCreate,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    item = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.status.in_(["OPEN", "PARTIAL", "SETTLED"]),
        PlannedCashflowItem.company_id == current_company.id,
        PlannedCashflowItem.id == planned_id,
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Planlı nakit kaydı bulunamadı")

    tx = db.query(Transaction).filter(
        Transaction.id == payload.transaction_id,
        Transaction.company_id == current_company.id,
    ).first()

    if not tx:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")

    if tx.direction != item.direction:
        raise HTTPException(status_code=400, detail="Yönler uyuşmuyor")

    if payload.matched_amount <= 0:
        raise HTTPException(status_code=400, detail="Eşleşme tutarı pozitif olmalı")

    existing = db.query(PlannedMatch).filter(
        PlannedMatch.planned_item_id == planned_id,
        PlannedMatch.transaction_id == payload.transaction_id,
        PlannedMatch.company_id == current_company.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bu işlem zaten eşleştirildi")

    remaining = float(item.remaining_amount)
    if payload.matched_amount > Decimal(str(remaining + 0.005)):
        raise HTTPException(status_code=400, detail="Eşleşme tutarı kalan tutardan fazla olamaz")

    match = PlannedMatch(
        planned_item_id=planned_id,
        transaction_id=payload.transaction_id,
        matched_amount=payload.matched_amount,
        match_type=payload.match_type or "manual",
        company_id=current_company.id,
    )

    db.add(match)
    db.commit()
    db.refresh(match)

    recompute_planned_status(db, current_company.id, planned_id)
    return match



@router.get("/{planned_id}/matches")
def get_planned_matches(
    planned_id: str,
    db: Session = Depends(get_db),
    company=Depends(get_current_company),
):
    company_id = company.id

    item = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.company_id == company_id,
        PlannedCashflowItem.id == planned_id
    ).first()
    if not item:
        raise HTTPException(404, "Planned item bulunamadı")

    rows = db.query(PlannedMatch, Transaction).join(
        Transaction,
        Transaction.id == PlannedMatch.transaction_id
    ).filter(
        PlannedMatch.company_id == company_id,
        PlannedMatch.planned_item_id == planned_id
    ).order_by(PlannedMatch.created_at.desc()).all()

    result = []
    for m, tx in rows:
        result.append({
            "match_id": m.id,
            "matched_amount": float(m.matched_amount),
            "match_type": m.match_type,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "transaction": {
                "id": tx.id,
                "date": tx.date.isoformat(),
                "amount": float(tx.amount),
                "direction": tx.direction,
                "category": tx.category,
                "description": tx.description,
                "source": tx.source,
            }
        })

    return {
        "planned_id": planned_id,
        "count": len(result),
        "matches": result
    }


 


@router.delete("/{planned_id}")
def delete_planned_item(
    planned_id: str,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    item = db.query(PlannedCashflowItem).filter(
        PlannedCashflowItem.id == planned_id,
        PlannedCashflowItem.company_id == current_company.id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Planlı nakit kaydı bulunamadı")
    
    db.delete(item)
    db.commit()
    
    return {"status": "deleted"}
