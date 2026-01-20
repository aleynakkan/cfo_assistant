# app/routes/transactions.py
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, date
from decimal import Decimal
from io import StringIO, BytesIO
import csv
import hashlib
import pandas as pd
import logging

from app.core.deps import get_db, get_current_company
from app.models.transaction import (
    Transaction,
    TransactionSchema,
    TransactionCreate,
    TransactionCategoryUpdate,
    ReconciliationInfo,
    AkbankUploadResponse,
)
from app.models.planned_match import PlannedMatch
from app.models.planned_item import PlannedCashflowItem
from app.models.company import Company
from app.services.categorization import categorize_transaction
from app.services.auto_match import auto_match_transaction

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=List[TransactionSchema])
@router.get("", response_model=List[TransactionSchema])
def list_transactions(
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
    start_date: date | None = None,
    end_date: date | None = None,
):
    q = db.query(Transaction).filter(Transaction.company_id == current_company.id)

    if start_date:
        q = q.filter(Transaction.date >= start_date)
    if end_date:
        q = q.filter(Transaction.date <= end_date)

    tx_list = q.order_by(Transaction.date.desc()).all()
    return tx_list

@router.post("/upload-csv")
async def upload_transactions_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Lütfen CSV formatında dosya yükleyin.")

    content = (await file.read()).decode("utf-8", errors="ignore")
    reader = csv.DictReader(StringIO(content))

    required_columns = {"date", "description", "amount", "direction"}
    if not required_columns.issubset(set(reader.fieldnames or [])):
        raise HTTPException(
            status_code=400,
            detail=f"CSV şu kolonları içermeli: {', '.join(required_columns)}",
        )

    inserted = 0
    errors = []
    today = date.today()

    for idx, row in enumerate(reader, start=1):
        try:
            date_value = datetime.strptime(row["date"].strip(), "%Y-%m-%d").date()
            
            # Tarih validasyonu - tarih bugünden sonra olamaz
            if date_value > today:
                raise ValueError(f"Tarih ({date_value}) bugünün tarihinden ({today}) sonra olamaz")
            
            amount = Decimal(row["amount"].strip().replace(",", "."))
            direction = row["direction"].strip().lower()
            if direction not in ("in", "out"):
                raise ValueError("direction sadece 'in' veya 'out' olabilir")

            description = row["description"].strip()

            category = categorize_transaction(description, amount, direction)

            tx = Transaction(
                date=date_value,
                description=description,
                amount=amount,
                direction=direction,
                source="csv",
                category=category,
                company_id=current_company.id,
            )
            db.add(tx)
            db.commit()
            db.refresh(tx)
            
            # Auto-match with planned items
            auto_match_transaction(db, tx, current_company.id)
            
            inserted += 1
        except Exception as e:
            db.rollback()
            errors.append(f"Satır {idx}: {e}")

    return {
        "inserted": inserted,
        "errors": errors,
    }

@router.post("/", response_model=TransactionSchema)
@router.post("", response_model=TransactionSchema)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    
    # Basit direction validasyonu
    if payload.direction not in ("in", "out"):
        raise HTTPException(status_code=400, detail="direction sadece 'in' veya 'out' olabilir")
    
    # Tarih validasyonu - tarih bugünden sonra olamaz
    today = date.today()
    if payload.date > today:
        raise HTTPException(status_code=400, detail=f"Tarih bugünün tarihinden ({today}) sonra olamaz")
    
    if payload.category:
        category = payload.category
    else:
        category = categorize_transaction(payload.description, payload.amount, payload.direction)
    
    # Manual transaction'lar için de external_id generate et (mükerrerlik kontrolü için)
    external_id = f"MANUAL|{payload.date}|{payload.direction}|{payload.amount}|{payload.description[:20]}"

    tx = Transaction(
        date=payload.date,
        description=payload.description,
        amount=payload.amount,
        direction=payload.direction,
        category=category,
        source="manual",  # manuel eklenen kayıtlar için
        company_id=current_company.id,
        external_id=external_id,  # mükerrerlik kontrolü için
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    
    # Auto-match with planned items
    auto_match_transaction(db, tx, current_company.id)
    
    return tx

@router.delete("/{tx_id}")
def delete_transaction(
    tx_id: str,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    tx = db.query(Transaction).filter(
        Transaction.id == tx_id,
        Transaction.company_id == current_company.id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction bulunamadı")

    db.delete(tx)
    db.commit()
    return {"status": "deleted"}

@router.patch("/{tx_id}/category", response_model=TransactionSchema)
def update_transaction_category(
    tx_id: str,
    payload: TransactionCategoryUpdate,
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    tx = db.query(Transaction).filter(
        Transaction.id == tx_id,
        Transaction.company_id == current_company.id
    ).first()
    
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction bulunamadı")
    
    tx.category = payload.category
    db.commit()
    db.refresh(tx)
    return tx


@router.get("/{tx_id}/matches")
def get_transaction_matches(
    tx_id: str,
    db: Session = Depends(get_db),
    company = Depends(get_current_company),
):
    company_id = company.id

    tx = db.query(Transaction).filter(
        Transaction.company_id == company_id,
        Transaction.id == tx_id
    ).first()
    if not tx:
        raise HTTPException(404, "Transaction bulunamadı")

    rows = db.query(PlannedMatch, PlannedCashflowItem).join(
        PlannedCashflowItem,
        PlannedCashflowItem.id == PlannedMatch.planned_item_id
    ).filter(
        PlannedMatch.company_id == company_id,
        PlannedMatch.transaction_id == tx_id
    ).order_by(PlannedMatch.created_at.desc()).all()

    result = []
    for m, item in rows:
        result.append({
            "match_id": m.id,
            "matched_amount": float(m.matched_amount),
            "match_type": m.match_type,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "planned_item": {
                "id": item.id,
                "type": item.type,
                "direction": item.direction,
                "due_date": item.due_date.isoformat(),
                "amount": float(item.amount),
                "status": item.status,
                "remaining_amount": float(item.remaining_amount),
                "counterparty": item.counterparty,
                "reference_no": item.reference_no,
            }
        })

    return {
        "transaction_id": tx_id,
        "count": len(result),
        "matches": result
    }

# --------- Akbank Excel Upload ---------

def parse_us_number(val) -> float:
    """
    Akbank excelde sayılar "1,000" veya "1,000.81" gibi geliyor.
    Binlik ayırıcı: ','  Ondalık: '.'
    """
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if s == "":
        return 0.0
    s = s.replace(",", "")  # binlik ayırıcıyı kaldır
    return float(s)

def normalize_str(x) -> str:
    return (str(x).strip() if x is not None else "")

def make_external_id(fis_no: str, tx_date: date, tx_time: str, amount_abs: float, desc: str) -> str:
    fis_no = normalize_str(fis_no)
    
    # Tarih-Saat-FisNo kombinasyonu: AKB|YYYYMMDDHHmm+FisNo|Amount
    date_str = tx_date.strftime("%Y%m%d")  # 20251231
    time_str = tx_time.replace(":", "")[:4] if tx_time else "0000"  # "15:36" -> "1536"
    
    if fis_no:
        return f"AKB|{date_str}{time_str}{fis_no}|{amount_abs:.2f}"
    
    # fis yoksa deterministic hash (tarih + saat + tutar + description)
    base = f"{tx_date.isoformat()}|{tx_time}|{amount_abs:.2f}|{desc}"
    h = hashlib.md5(base.encode("utf-8")).hexdigest()
    return f"AKB|{h}|{amount_abs:.2f}"

@router.post("/upload-akbank-excel", response_model=AkbankUploadResponse)
async def upload_akbank_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Akbank Excel ekstresi:
    - Başlıklar 9. satır (A-F)
    - Hareketler 10. satırdan itibaren
    Kolonlar:
      A: tarih
      B: saat
      C: tutar (giriş +, çıkış -)
      D: bakiye (doğrulama için)
      E: açıklama
      F: fiş/dekont no
    """
    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xlsm") or filename.endswith(".xltx") or filename.endswith(".xltm") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Lütfen Excel formatında dosya yükleyin (.xlsx, .xls vb.)")

    content = await file.read()
    
    # Dosya uzantısına göre doğru engine'i seç
    engine = 'xlrd' if filename.endswith('.xls') else 'openpyxl'
    
    try:
        df = pd.read_excel(BytesIO(content), sheet_name=0, header=None, engine=engine)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel okunamadı: {str(e)}")

    # Başlık satırını otomatik bul (0-14 arası, 0-indexed)
    header_row = None
    
    for potential_row_idx in range(min(15, len(df))):
        try:
            col_a = normalize_str(df.iloc[potential_row_idx, 0]).lower()
            col_b = normalize_str(df.iloc[potential_row_idx, 1]).lower()
            col_c = normalize_str(df.iloc[potential_row_idx, 2]).lower()
            
            # tarih, saat, tutar içeren satırı ara
            if ("tarih" in col_a or "date" in col_a) and \
               ("saat" in col_b or "time" in col_b or "zaman" in col_b) and \
               ("tutar" in col_c or "amount" in col_c):
                header_row = potential_row_idx
                break
        except:
            continue
    
    if header_row is None:
        header_row = 8  # Fallback Akbank format (0-indexed, yani 9. satır)

    inserted = 0
    duplicates = 0
    errors = []

    start_row_idx = header_row + 1
    max_row_idx = len(df)

    # Reconciliation tracking
    rows_seen = 0
    rows_skipped = 0
    first_balance = None
    last_balance = None
    last_balance_value = None  # Son satırdaki D sütunu (bakiye)
    last_amount_value = None   # Son satırdaki C sütunu (tutar)
    sum_signed_amount = 0.0
    balance_col_idx = 3  # Column D (index 3)

    # Data import
    for row_idx in range(start_row_idx, max_row_idx):
        try:
            raw_date = df.iloc[row_idx, 0]  # tarih (column A, index 0)
            raw_time = df.iloc[row_idx, 1]  # saat (column B, index 1)
            raw_amount = df.iloc[row_idx, 2]  # tutar (column C, index 2)
            raw_balance = df.iloc[row_idx, balance_col_idx]  # bakiye (column D, index 3)
            raw_desc = df.iloc[row_idx, 4]  # açıklama (column E, index 4)
            raw_fis = df.iloc[row_idx, 5]  # fis/dekont no (column F, index 5)

            # boş satır bitiş kontrolü
            if pd.isna(raw_date) and pd.isna(raw_desc) and pd.isna(raw_amount):
                rows_skipped += 1
                continue

            # tarih parse
            if pd.isna(raw_date):
                rows_skipped += 1
                continue
            
            tx_date = None
            if isinstance(raw_date, datetime):
                tx_date = raw_date.date()
            elif isinstance(raw_date, date):
                tx_date = raw_date
            else:
                try:
                    if hasattr(raw_date, 'date'):  # pandas Timestamp
                        tx_date = raw_date.date()
                    else:
                        # String format: "12.12.2025"
                        tx_date = datetime.strptime(str(raw_date).strip(), "%d.%m.%Y").date()
                except Exception as parse_err:
                    rows_skipped += 1
                    continue

            tx_time = normalize_str(raw_time)

            amount_signed = parse_us_number(raw_amount)
            if amount_signed == 0:
                rows_skipped += 1
                continue

            # Reconciliation: track balance
            # İlk veri satırı = last_balance (en yeni bakiye / kapanış)
            if last_balance is None and not pd.isna(raw_balance):
                last_balance = parse_us_number(raw_balance)
            
            # Son satırdaki D ve C değerlerini sakla (first_balance hesaplamak için)
            if not pd.isna(raw_balance):
                last_balance_value = parse_us_number(raw_balance)
            if not pd.isna(raw_amount):
                last_amount_value = parse_us_number(raw_amount)
            
            sum_signed_amount += amount_signed
            rows_seen += 1

            direction = "in" if amount_signed > 0 else "out"
            amount_abs = abs(float(amount_signed))

            desc = normalize_str(raw_desc)

            fis_no = normalize_str(raw_fis)
            external_id = make_external_id(fis_no, tx_date, tx_time, amount_abs, desc)

            # Pre-check: Aynı external_id varsa direction kontrol et
            existing = db.query(Transaction).filter(
                Transaction.external_id == external_id,
                Transaction.company_id == current_company.id
            ).first()
            
            if existing:
                if existing.direction == direction:
                    # Aynı direction - gerçek duplicate
                    duplicates += 1
                    continue
                # else: direction farklı - insert et (sistem yönetecek)

            # kategori otomatik
            category = categorize_transaction(desc, amount_abs, direction)

            tx = Transaction(
                date=tx_date,
                description=desc,
                amount=amount_abs,
                direction=direction,
                category=category,
                source="akbank_excel",
                external_id=external_id,
                company_id=current_company.id
            )

            db.add(tx)
            db.commit()  # Her kayıt sonra commit et
            db.refresh(tx)
            
            # Auto-match with planned items
            auto_match_transaction(db, tx, current_company.id)
            
            inserted += 1

        except Exception as e:
            db.rollback()  # Her error'da rollback et
            import traceback
            error_str = str(e)
            # UNIQUE constraint hatası - direction aynı ise duplicate say
            if 'UNIQUE constraint failed' in error_str or 'duplicate' in error_str.lower():
                # Aynı external_id'ye sahip transaction'ı bul
                existing = db.query(Transaction).filter(
                    Transaction.external_id == external_id,
                    Transaction.company_id == current_company.id
                ).first()
                
                # Direction'ları karşılaştır - aynıysa duplicate, farklıysa hata olarak kayıt et
                if existing and existing.direction == direction:
                    duplicates += 1
                    # Duplicate detaylarını errors'a ekle (ilk 20 duplicate)
                    if len(errors) < 20:
                        errors.append({"row": row_idx + 1, "error": "DUPLICATE", "external_id": external_id, "desc": desc[:50]})
                else:
                    # Direction farklı, hata olarak kayıt et
                    error_details = f"UNIQUE constraint failed ama direction farklı: existing={existing.direction if existing else 'None'}, new={direction}"
                    errors.append({"row": row_idx + 1, "error": error_str, "details": error_details})
            else:
                error_details = f"{error_str} | {traceback.format_exc()}"
                errors.append({"row": row_idx + 1, "error": error_str, "details": error_details})

    # Reconciliation calculation
    tolerance = 0.05
    
    if last_balance is None:
        last_balance = 0.0
    
    # first_balance = son satırdaki D sütunu - son satırdaki C sütunu
    # Bu, o işlemden önce nasıl bir bakiye vardı anlamına gelir
    if last_balance_value is not None and last_amount_value is not None:
        first_balance = last_balance_value - last_amount_value
    else:
        first_balance = 0.0
    
    expected_last_balance = first_balance + sum_signed_amount
    difference = abs(last_balance - expected_last_balance)
    
    recon_status = "PASS" if difference <= tolerance else "FAIL"
    
    reconciliation = ReconciliationInfo(
        status=recon_status,
        first_balance=first_balance,
        last_balance=last_balance,
        sum_signed_amount=sum_signed_amount,
        expected_last_balance=expected_last_balance,
        difference=difference,
        tolerance=tolerance,
        rows_seen=rows_seen,
        rows_skipped=rows_skipped,
    )
    
    # Log if reconciliation fails
    if recon_status == "FAIL":
        logger.warning(
            "IMPORT_RECONCILIATION_FAIL",
            extra={
                "company_id": current_company.id,
                "source": "akbank_excel",
                "difference": difference,
                "rows_seen": rows_seen,
                "rows_skipped": rows_skipped,
                "first_balance": first_balance,
                "last_balance": last_balance,
                "sum_signed_amount": sum_signed_amount,
                "expected_last_balance": expected_last_balance,
            }
        )

    return AkbankUploadResponse(
        inserted=inserted,
        duplicates=duplicates,
        errors=errors[:50],  # ilk 50 hata
        reconciliation=reconciliation,
    )


@router.post("/upload-enpara-excel", response_model=AkbankUploadResponse)
async def upload_enpara_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Enpara Excel ekstresi:
    - Başlıklar 11. satır (B-F)
    - Hareketler 12. satırdan itibaren
    Kolonlar (B-F, index 1-5):
      B: tarih (GG.AA.YYYY)
      C: hareket tipi (giriş/çıkış)
      D: açıklama
      E: işlem tutarı
      F: bakiye
    """
    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xlsm") or filename.endswith(".xltx") or filename.endswith(".xltm") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Lütfen Excel formatında dosya yükleyin (.xlsx, .xls vb.)")

    content = await file.read()
    
    # Dosya uzantısına göre doğru engine'i seç
    engine = 'xlrd' if filename.endswith('.xls') else 'openpyxl'
    
    try:
        df = pd.read_excel(BytesIO(content), sheet_name=0, header=None, engine=engine)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel okunamadı: {str(e)}")

    print(f"\n=== ENPARA EXCEL DEBUG ===")
    print(f"Total rows: {len(df)}, Total columns: {len(df.columns)}")
    print(f"=========================\n")

    # Enpara: başlık satırını otomatik bul (Tarih | Hareket tipi | Açıklama | İşlem Tutarı | Bakiye)
    header_row = None
    for potential_row_idx in range(min(20, len(df))):
        try:
            # Tüm sütunları kontrol et
            row_values = [str(df.iloc[potential_row_idx, j]).lower() if not pd.isna(df.iloc[potential_row_idx, j]) else "" for j in range(len(df.columns))]
            row_str = " ".join(row_values)
            
            if "tarih" in row_str and "hareket" in row_str and "aciklama" in row_str and ("islem tutari" in row_str or "islemi" in row_str):
                header_row = potential_row_idx
                print(f"Enpara header satırı bulundu: {header_row}")
                break
        except:
            continue
    
    if header_row is None:
        header_row = 10  # Fallback
        print(f"Enpara header satırı bulunamadı, fallback: {header_row}")
    
    inserted = 0
    duplicates = 0
    errors = []
    rows_seen = 0
    rows_skipped = 0
    first_balance = None
    last_balance = None
    last_balance_value = None
    last_amount_value = None
    sum_signed_amount = 0.0

    start_row_idx = header_row + 1
    max_row_idx = len(df)

    for row_idx in range(start_row_idx, max_row_idx):
        try:
            raw_date = df.iloc[row_idx, 1]      # B (index 1): tarih
            raw_movement_type = df.iloc[row_idx, 2]  # C (index 2): hareket tipi
            raw_desc = df.iloc[row_idx, 5]      # F (index 5): açıklama
            raw_amount = df.iloc[row_idx, 7]    # H (index 7): işlem tutarı
            raw_balance = df.iloc[row_idx, 8]   # I (index 8): bakiye

            # Boş satır = Excel'in sonu. Tüm sütunlar NaN ise, yüklemeyi bitir
            if all(pd.isna(df.iloc[row_idx, i]) for i in range(len(df.columns))):
                print(f"Boş satır bulundu (Row {row_idx}), yükleme tamamlandı.")
                break

            # tarih, tutar ve açıklama hepsi boş ise skip et
            if pd.isna(raw_date) and pd.isna(raw_desc) and pd.isna(raw_amount):
                rows_skipped += 1
                continue

            # tarih parse (GG.AA.YYYY formatında)
            if pd.isna(raw_date):
                rows_skipped += 1
                continue
            
            tx_date = None
            if isinstance(raw_date, datetime):
                tx_date = raw_date.date()
            elif isinstance(raw_date, date):
                tx_date = raw_date
            else:
                try:
                    if hasattr(raw_date, 'date'):
                        tx_date = raw_date.date()
                    else:
                        tx_date = datetime.strptime(str(raw_date).strip(), "%d.%m.%Y").date()
                except Exception as e:
                    # Tarih parse hatası = Excel'in veri sonu, footer başlangıcı
                    print(f"Tarih parse hatası, veri sonu (Row {row_idx}): {str(raw_date)[:50]}")
                    break

            try:
                amount_signed = parse_us_number(raw_amount)
            except Exception as e:
                errors.append({"row": row_idx + 1, "error": f"Tutar parse hatası: {str(raw_amount)}"})
                continue
                
            if amount_signed == 0:
                errors.append({"row": row_idx + 1, "error": f"Tutar sıfır: {str(raw_amount)}"})
                continue

            # Hareket tipi'nden direction belirle
            # NOT: Tutar negatif ise MUTLAKA "out" olmalı, hareket tipi yazsa bile!
            movement_type_str = normalize_str(raw_movement_type).lower()
            
            if amount_signed < 0:
                # Tutar negatif = ÇIKIŞ (hareket tipi yazsa da yok sayılır)
                direction = "out"
                amount_abs = abs(amount_signed)
            elif amount_signed > 0:
                # Tutar pozitif = GİRİŞ
                direction = "in"
                amount_abs = amount_signed
            else:
                # Tutar 0 - bu case daha önce catch edilmiş olmalı
                direction = "in"
                amount_abs = 0

            # Reconciliation tracking
            if last_balance is None and not pd.isna(raw_balance):
                last_balance = parse_us_number(raw_balance)
            
            if not pd.isna(raw_balance):
                last_balance_value = parse_us_number(raw_balance)
            if not pd.isna(raw_amount):
                last_amount_value = parse_us_number(raw_amount)
            
            sum_signed_amount += amount_signed
            rows_seen += 1

            desc = normalize_str(raw_desc)
            balance_val = parse_us_number(raw_balance) if not pd.isna(raw_balance) else 0
            
            # external_id: ENP|YYYYMMDDAmount|Desc|Balance (tutar + açıklama + bakiye kombinasyonu)
            date_str = tx_date.strftime("%Y%m%d")
            desc_short = desc[:40].replace(" ", "_")
            external_id = f"ENP|{date_str}{amount_abs:.2f}|{desc_short}|{balance_val:.2f}"

            category = categorize_transaction(desc, amount_abs, direction)

            tx = Transaction(
                date=tx_date,
                description=desc,
                amount=amount_abs,
                direction=direction,
                category=category,
                source="enpara_excel",
                external_id=external_id,
                company_id=current_company.id
            )

            db.add(tx)
            db.commit()
            db.refresh(tx)
            
            # Auto-match with planned items
            auto_match_transaction(db, tx, current_company.id)
            
            inserted += 1

        except Exception as e:
            db.rollback()
            error_str = str(e)
            if 'UNIQUE constraint failed' in error_str or 'duplicate' in error_str.lower():
                duplicates += 1
            else:
                if len(errors) < 20:
                    errors.append({"row": row_idx + 1, "error": error_str})

    # Reconciliation
    tolerance = 0.05
    if last_balance is None:
        last_balance = 0.0
    
    if last_balance_value is not None and last_amount_value is not None:
        first_balance = last_balance_value - last_amount_value
    else:
        first_balance = 0.0
    
    expected_last_balance = first_balance + sum_signed_amount
    difference = abs(last_balance - expected_last_balance)
    
    recon_status = "PASS" if difference <= tolerance else "FAIL"
    
    reconciliation = ReconciliationInfo(
        status=recon_status,
        first_balance=first_balance,
        last_balance=last_balance,
        sum_signed_amount=sum_signed_amount,
        expected_last_balance=expected_last_balance,
        difference=difference,
        tolerance=tolerance,
        rows_seen=rows_seen,
        rows_skipped=rows_skipped,
    )
    
    return AkbankUploadResponse(
        inserted=inserted,
        duplicates=duplicates,
        errors=errors[:50],
        reconciliation=reconciliation,
    )


@router.post("/upload-yapikredi-excel", response_model=AkbankUploadResponse)
async def upload_yapikredi_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_company: Company = Depends(get_current_company),
):
    """
    Yapı Kredi Excel upload endpoint.
    Header row: 11 (0-indexed = 10)
    Columns:
      A: tarih
      B: saat
      C: işlem
      D: kanal
      E: referans no
      F: açıklama
      G: işlem tutarı
      H: bakiye
    """
    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xlsm") or filename.endswith(".xltx") or filename.endswith(".xltm") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Lütfen Excel formatında dosya yükleyin (.xlsx, .xls vb.)")

    content = await file.read()
    try:
        df = pd.read_excel(BytesIO(content), sheet_name=0, header=None)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Excel okunamadı: {str(e)}")

    # Yapı Kredi: başlık satırını otomatik bul (Tarih | Saat | İşlem | Kanal | Açıklama | İşlem Tutarı | Bakiye)
    header_row = None
    for potential_row_idx in range(min(20, len(df))):
        try:
            # Tüm sütunları kontrol et
            row_values = [str(df.iloc[potential_row_idx, j]).lower() if not pd.isna(df.iloc[potential_row_idx, j]) else "" for j in range(len(df.columns))]
            row_str = " ".join(row_values)
            
            if "tarih" in row_str and "saat" in row_str and "islem" in row_str and "kanal" in row_str and ("aciklama" in row_str or "desc" in row_str):
                header_row = potential_row_idx
                print(f"Yapı Kredi header satırı bulundu: {header_row}")
                break
        except:
            continue
    
    if header_row is None:
        header_row = 10  # Fallback
        print(f"Yapı Kredi header satırı bulunamadı, fallback: {header_row}")
    
    inserted = 0
    duplicates = 0
    errors = []
    rows_seen = 0
    rows_skipped = 0
    first_balance = None
    last_balance = None
    last_balance_value = None
    last_amount_value = None
    sum_signed_amount = 0.0

    start_row_idx = header_row + 1
    max_row_idx = len(df)

    for row_idx in range(start_row_idx, max_row_idx):
        try:
            raw_date = df.iloc[row_idx, 0]      # A (index 0): tarih
            raw_time = df.iloc[row_idx, 1]      # B (index 1): saat
            raw_movement = df.iloc[row_idx, 2]  # C (index 2): işlem
            raw_channel = df.iloc[row_idx, 3]   # D (index 3): kanal
            raw_ref = df.iloc[row_idx, 4]       # E (index 4): referans no
            raw_desc = df.iloc[row_idx, 5]      # F (index 5): açıklama
            raw_amount = df.iloc[row_idx, 6]    # G (index 6): işlem tutarı
            raw_balance = df.iloc[row_idx, 7]   # H (index 7): bakiye

            # Boş satır = Excel'in sonu. Tüm sütunlar NaN ise, yüklemeyi bitir
            if all(pd.isna(df.iloc[row_idx, i]) for i in range(len(df.columns))):
                print(f"Boş satır bulundu (Row {row_idx}), yükleme tamamlandı.")
                break

            # tarih, tutar ve açıklama hepsi boş ise skip et
            if pd.isna(raw_date) and pd.isna(raw_desc) and pd.isna(raw_amount):
                rows_skipped += 1
                continue

            # tarih parse (GG/AA/YYYY formatında)
            if pd.isna(raw_date):
                rows_skipped += 1
                continue
            
            tx_date = None
            if isinstance(raw_date, datetime):
                tx_date = raw_date.date()
            elif isinstance(raw_date, date):
                tx_date = raw_date
            else:
                try:
                    if hasattr(raw_date, 'date'):
                        tx_date = raw_date.date()
                    else:
                        # Yapı Kredi: GG/AA/YYYY formatı
                        tx_date = datetime.strptime(str(raw_date).strip(), "%d/%m/%Y").date()
                except Exception as e:
                    # Tarih parse hatası = Excel'in veri sonu, footer başlangıcı
                    print(f"Tarih parse hatası, veri sonu (Row {row_idx}): {str(raw_date)[:50]}")
                    break

            try:
                amount_signed = parse_us_number(raw_amount)
            except Exception as e:
                errors.append({"row": row_idx + 1, "error": f"Tutar parse hatası: {str(raw_amount)}"})
                continue
                
            if amount_signed == 0:
                errors.append({"row": row_idx + 1, "error": f"Tutar sıfır: {str(raw_amount)}"})
                continue

            # İşlem tipinden direction belirle (Yapı Kredi'de "işlem" sütununda tipik olarak örneğin "Gelen Transfer", "EFT Çıkışı" vb)
            movement_str = normalize_str(raw_movement).lower() if not pd.isna(raw_movement) else ""
            
            # Hareket tipi'nden direction belirle
            # NOT: Tutar negatif ise MUTLAKA "out" olmalı, hareket tipi yazsa bile!
            movement_str = normalize_str(raw_movement_type).lower() if not pd.isna(raw_movement_type) else ""
            
            if amount_signed < 0:
                # Tutar negatif = ÇIKIŞ (hareket tipi yazsa da yok sayılır)
                direction = "out"
                amount_abs = abs(amount_signed)
            elif amount_signed > 0:
                # Tutar pozitif = GİRİŞ
                direction = "in"
                amount_abs = amount_signed
            else:
                # Tutar 0 - bu case daha önce catch edilmiş olmalı
                direction = "in"
                amount_abs = 0

            # Reconciliation tracking
            if last_balance is None and not pd.isna(raw_balance):
                last_balance = parse_us_number(raw_balance)
            
            if not pd.isna(raw_balance):
                last_balance_value = parse_us_number(raw_balance)
            if not pd.isna(raw_amount):
                last_amount_value = parse_us_number(raw_amount)
            
            sum_signed_amount += amount_signed
            rows_seen += 1

            desc = normalize_str(raw_desc) if not pd.isna(raw_desc) else ""
            balance_val = parse_us_number(raw_balance) if not pd.isna(raw_balance) else 0
            
            # external_id: YKD|YYYYMMDDAmount|Desc|Balance (tutar + açıklama + bakiye kombinasyonu)
            date_str = tx_date.strftime("%Y%m%d")
            desc_short = desc[:40].replace(" ", "_")
            external_id = f"YKD|{date_str}{amount_abs:.2f}|{desc_short}|{balance_val:.2f}"

            category = categorize_transaction(desc, amount_abs, direction)

            tx = Transaction(
                date=tx_date,
                description=desc,
                amount=amount_abs,
                direction=direction,
                category=category,
                source="yapikredi_excel",
                external_id=external_id,
                company_id=current_company.id
            )

            db.add(tx)
            db.commit()
            db.refresh(tx)
            
            # Auto-match with planned items
            auto_match_transaction(db, tx, current_company.id)
            
            inserted += 1

        except Exception as e:
            db.rollback()
            error_str = str(e)
            if len(errors) < 20:
                errors.append({"row": row_idx + 1, "error": error_str})

    # Reconciliation
    tolerance = 0.05
    if last_balance is None:
        last_balance = 0.0
    
    if last_balance_value is not None and last_amount_value is not None:
        first_balance = last_balance_value - last_amount_value
    else:
        first_balance = 0.0
    
    expected_last_balance = first_balance + sum_signed_amount
    difference = abs(last_balance - expected_last_balance)
    
    recon_status = "PASS" if difference <= tolerance else "FAIL"
    
    reconciliation = ReconciliationInfo(
        status=recon_status,
        first_balance=first_balance,
        last_balance=last_balance,
        sum_signed_amount=sum_signed_amount,
        expected_last_balance=expected_last_balance,
        difference=difference,
        tolerance=tolerance,
        rows_seen=rows_seen,
        rows_skipped=rows_skipped,
    )

    return AkbankUploadResponse(
        inserted=inserted,
        duplicates=duplicates,
        errors=errors[:50],
        reconciliation=reconciliation,
    )