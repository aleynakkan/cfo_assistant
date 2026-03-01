# app/routes/parasut.py
# Paraşüt muhasebe yazılımı entegrasyon endpoint'leri
# Fatura verisi çekme ve planlanan nakit akışı kalemlerine aktarma

from datetime import datetime, timedelta, date as date_type
from typing import Optional
from decimal import Decimal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_company
from app.models.company import Company
from app.models.parasut_integration import ParasutIntegration
from app.models.planned_item import PlannedCashflowItem
from app.models.counterparty import Counterparty

router = APIRouter(prefix="/parasut", tags=["parasut"])

# Paraşüt API sabitleri
PARASUT_API_BASE = "https://api.parasut.com"
PARASUT_TOKEN_URL = f"{PARASUT_API_BASE}/oauth/token"
PARASUT_API_V4 = f"{PARASUT_API_BASE}/v4"

# ── Pydantic şemaları ──────────────────────────────────────────────

class ParasutConnectRequest(BaseModel):
    """Paraşüt bağlantı isteği"""
    client_id: str        # Kullanıcının Paraşüt API Client ID'si
    client_secret: str    # Kullanıcının Paraşüt API Client Secret'ı
    email: str            # Paraşüt hesap e-postası
    password: str         # Paraşüt hesap şifresi
    parasut_company_id: str  # Paraşüt firma numarası


class ParasutStatusResponse(BaseModel):
    """Paraşüt bağlantı durumu yanıtı"""
    is_connected: bool
    parasut_email: Optional[str] = None
    parasut_company_id: Optional[str] = None
    token_expires_at: Optional[str] = None


class ParasutDisconnectResponse(BaseModel):
    """Paraşüt bağlantı kesme yanıtı"""
    message: str


# ── Yardımcı fonksiyonlar ──────────────────────────────────────────

async def _get_parasut_token(email: str, password: str, client_id: str, client_secret: str) -> dict:
    """Paraşüt OAuth2 password grant ile token alır"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            PARASUT_TOKEN_URL,
            data={
                "grant_type": "password",
                "client_id": client_id,
                "client_secret": client_secret,
                "username": email,
                "password": password,
                "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        error_detail = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        raise HTTPException(
            status_code=400,
            detail=f"Paraşüt kimlik doğrulama başarısız: {error_detail.get('error_description', 'Bilinmeyen hata')}"
        )

    return response.json()


async def _refresh_parasut_token(refresh_token: str, client_id: str, client_secret: str) -> dict:
    """Refresh token ile yeni access_token alır"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            PARASUT_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        return None

    return response.json()


async def _ensure_valid_token(integration: ParasutIntegration, db: Session) -> str:
    """Token geçerliliğini kontrol eder, gerekirse yeniler"""
    # Token süresi dolmuş mu kontrol et (5 dakika marj)
    if integration.token_expires_at and integration.token_expires_at > datetime.utcnow() + timedelta(minutes=5):
        return integration.access_token

    # Token yenile
    if not integration.refresh_token:
        raise HTTPException(status_code=401, detail="Paraşüt oturumu sona ermiş. Lütfen yeniden bağlanın.")

    token_data = await _refresh_parasut_token(
        integration.refresh_token,
        integration.parasut_client_id,
        integration.parasut_client_secret,
    )
    if not token_data:
        # Refresh token da geçersiz, bağlantıyı kes
        integration.is_connected = False
        integration.access_token = None
        integration.refresh_token = None
        integration.token_expires_at = None
        db.commit()
        raise HTTPException(status_code=401, detail="Paraşüt oturumu sona ermiş. Lütfen yeniden bağlanın.")

    # Yeni token bilgilerini kaydet
    integration.access_token = token_data["access_token"]
    integration.refresh_token = token_data["refresh_token"]
    integration.token_expires_at = datetime.utcnow() + timedelta(seconds=token_data.get("expires_in", 7200))
    db.commit()

    return integration.access_token


async def _parasut_get(access_token: str, path: str, params: dict = None) -> dict:
    """Paraşüt API'ye GET isteği gönderir"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{PARASUT_API_V4}{path}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            params=params or {},
            timeout=30.0,
        )

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Paraşüt erişim jetonu geçersiz")

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Paraşüt API hatası: {response.status_code}"
        )

    return response.json()


def _get_integration(db: Session, company_id: int) -> ParasutIntegration:
    """Aktif Paraşüt entegrasyonunu getirir"""
    integration = db.query(ParasutIntegration).filter(
        ParasutIntegration.company_id == company_id
    ).first()

    if not integration or not integration.is_connected:
        raise HTTPException(status_code=404, detail="Paraşüt entegrasyonu bulunamadı. Önce bağlantı kurun.")

    return integration


# ── Endpoint'ler ───────────────────────────────────────────────────

@router.post("/connect", response_model=ParasutStatusResponse)
async def connect_parasut(
    request: ParasutConnectRequest,
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Paraşüt hesabına bağlanır.
    Kullanıcının Paraşüt e-postası, şifresi ve firma numarası ile OAuth2 token alır.
    """
    # Paraşüt'ten token al
    token_data = await _get_parasut_token(
        request.email, request.password,
        request.client_id, request.client_secret,
    )

    expires_at = datetime.utcnow() + timedelta(seconds=token_data.get("expires_in", 7200))

    # Mevcut entegrasyonu bul veya yeni oluştur
    integration = db.query(ParasutIntegration).filter(
        ParasutIntegration.company_id == company.id
    ).first()

    if integration:
        # Mevcut kaydı güncelle
        integration.parasut_company_id = request.parasut_company_id
        integration.parasut_client_id = request.client_id
        integration.parasut_client_secret = request.client_secret
        integration.access_token = token_data["access_token"]
        integration.refresh_token = token_data["refresh_token"]
        integration.token_expires_at = expires_at
        integration.is_connected = True
        integration.parasut_email = request.email
    else:
        # Yeni kayıt oluştur
        integration = ParasutIntegration(
            company_id=company.id,
            parasut_company_id=request.parasut_company_id,
            parasut_client_id=request.client_id,
            parasut_client_secret=request.client_secret,
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            token_expires_at=expires_at,
            is_connected=True,
            parasut_email=request.email,
        )
        db.add(integration)

    db.commit()

    return ParasutStatusResponse(
        is_connected=True,
        parasut_email=request.email,
        parasut_company_id=request.parasut_company_id,
        token_expires_at=expires_at.isoformat(),
    )


@router.get("/status", response_model=ParasutStatusResponse)
async def get_parasut_status(
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Paraşüt bağlantı durumunu döndürür"""
    integration = db.query(ParasutIntegration).filter(
        ParasutIntegration.company_id == company.id
    ).first()

    if not integration or not integration.is_connected:
        return ParasutStatusResponse(is_connected=False)

    return ParasutStatusResponse(
        is_connected=True,
        parasut_email=integration.parasut_email,
        parasut_company_id=integration.parasut_company_id,
        token_expires_at=integration.token_expires_at.isoformat() if integration.token_expires_at else None,
    )


@router.delete("/disconnect", response_model=ParasutDisconnectResponse)
async def disconnect_parasut(
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """Paraşüt bağlantısını keser ve token bilgilerini siler"""
    integration = db.query(ParasutIntegration).filter(
        ParasutIntegration.company_id == company.id
    ).first()

    if integration:
        integration.is_connected = False
        integration.access_token = None
        integration.refresh_token = None
        integration.token_expires_at = None
        integration.parasut_email = None
        db.commit()

    return ParasutDisconnectResponse(message="Paraşüt bağlantısı başarıyla kesildi")


@router.get("/sales-invoices")
async def get_sales_invoices(
    page: int = Query(1, ge=1, description="Sayfa numarası"),
    page_size: int = Query(15, ge=1, le=25, description="Sayfa başına kayıt"),
    issue_date: Optional[str] = Query(None, description="Fatura tarihi filtresi (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Paraşüt'ten satış faturalarını getirir (salt okunur).
    GET /{company_id}/sales_invoices
    """
    integration = _get_integration(db, company.id)
    access_token = await _ensure_valid_token(integration, db)

    params = {
        "page[number]": page,
        "page[size]": page_size,
        "include": "contact,details,details.product",
    }
    if issue_date:
        params["filter[issue_date]"] = issue_date

    data = await _parasut_get(
        access_token,
        f"/{integration.parasut_company_id}/sales_invoices",
        params,
    )

    return data


@router.get("/purchase-bills")
async def get_purchase_bills(
    page: int = Query(1, ge=1, description="Sayfa numarası"),
    page_size: int = Query(15, ge=1, le=25, description="Sayfa başına kayıt"),
    issue_date: Optional[str] = Query(None, description="Fatura tarihi filtresi (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Paraşüt'ten alış faturalarını / fişlerini getirir (salt okunur).
    GET /{company_id}/purchase_bills
    """
    integration = _get_integration(db, company.id)
    access_token = await _ensure_valid_token(integration, db)

    params = {
        "page[number]": page,
        "page[size]": page_size,
        "include": "spender,details,details.product,supplier",
    }
    if issue_date:
        params["filter[issue_date]"] = issue_date

    data = await _parasut_get(
        access_token,
        f"/{integration.parasut_company_id}/purchase_bills",
        params,
    )

    return data


@router.get("/contacts")
async def get_contacts(
    page: int = Query(1, ge=1, description="Sayfa numarası"),
    page_size: int = Query(15, ge=1, le=25, description="Sayfa başına kayıt"),
    account_type: Optional[str] = Query(None, description="Hesap tipi: customer veya supplier"),
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Paraşüt'ten müşteri/tedarikçi listesini getirir (salt okunur).
    GET /{company_id}/contacts
    """
    integration = _get_integration(db, company.id)
    access_token = await _ensure_valid_token(integration, db)

    params = {
        "page[number]": page,
        "page[size]": page_size,
    }
    if account_type:
        params["filter[account_type]"] = account_type

    data = await _parasut_get(
        access_token,
        f"/{integration.parasut_company_id}/contacts",
        params,
    )

    return data


# ── Yardımcı: Paraşüt ödeme durumunu → PlannedCashflowItem status'üne çevir ──

def _map_payment_status(parasut_status: str) -> str:
    """Paraşüt payment_status → PlannedCashflowItem status dönüşümü"""
    mapping = {
        "unpaid": "OPEN",
        "paid": "SETTLED",
        "partially_paid": "PARTIAL",
        "overdue": "OPEN",
    }
    return mapping.get(parasut_status, "OPEN")


def _build_contacts_map(included: list) -> dict:
    """
    Paraşüt response'undaki included dizisinden contact/spender id → name eşleşmesi oluşturur.
    Satış faturalarında type='contacts', alış faturalarında type='spenders' olabilir.
    """
    contacts_map = {}
    for item in (included or []):
        if item.get("type") in ("contacts", "spenders", "suppliers"):
            contacts_map[item["id"]] = item.get("attributes", {}).get("name", "")
    return contacts_map


def _find_counterparty_id(db: Session, company_id: int, contact_name: str) -> int | None:
    """
    Counterparties tablosunda isme göre eşleşme arar.
    Bulamazsa None döner.
    """
    if not contact_name:
        return None
    cp = db.query(Counterparty).filter(
        Counterparty.company_id == company_id,
        Counterparty.name == contact_name,
    ).first()
    return cp.id if cp else None


# ── Paraşüt Fatura → Planlanan Nakit Akışı Aktarımı ──────────────

class ImportResultResponse(BaseModel):
    """Fatura aktarım sonucu yanıtı"""
    toplam_fatura: int
    eklenen: int
    atlanan_mevcut: int
    hatali: int
    detay: list


@router.post("/import-sales-invoices")
async def import_sales_invoices(
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Paraşüt'ten satış faturalarını çeker ve planned_cashflow_items tablosuna aktarır.

    - Satış faturaları → type='INVOICE', direction='in' (tahsilat beklentisi)
    - Her faturanın Paraşüt ID'si external_id alanında saklanır (idempotency)
    - Daha önce aktarılmış faturalar atlanır
    - Müşteri adı counterparty alanına, varsa counterparty_id eşleştirilir
    """
    integration = _get_integration(db, company.id)
    access_token = await _ensure_valid_token(integration, db)

    # Tüm sayfaları çek
    tum_faturalar = []
    sayfa = 1
    while True:
        params = {
            "page[number]": sayfa,
            "page[size]": 25,
            "include": "contact",
        }
        data = await _parasut_get(
            access_token,
            f"/{integration.parasut_company_id}/sales_invoices",
            params,
        )

        faturalar = data.get("data", [])
        included = data.get("included", [])

        # Contact id → name eşleşme haritası
        contacts_map = _build_contacts_map(included)

        for fatura in faturalar:
            tum_faturalar.append((fatura, contacts_map))

        # Sonraki sayfa var mı kontrol et
        meta = data.get("meta", {})
        toplam_sayfa = meta.get("total_pages", 1)
        if sayfa >= toplam_sayfa:
            break
        sayfa += 1

    # Mevcut Paraşüt fatura ID'lerini topla (idempotency kontrolü)
    mevcut_external_ids = set(
        row[0] for row in db.query(PlannedCashflowItem.external_id).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.source == "parasut",
            PlannedCashflowItem.external_id.isnot(None),
        ).all()
    )

    eklenen = 0
    atlanan = 0
    hatali = 0
    detay = []

    for fatura, contacts_map in tum_faturalar:
        parasut_id = str(fatura.get("id", ""))
        attr = fatura.get("attributes", {})

        # Daha önce aktarılmış mı kontrol et
        if parasut_id in mevcut_external_ids:
            atlanan += 1
            continue

        try:
            # Müşteri bilgisi
            contact_data = fatura.get("relationships", {}).get("contact", {}).get("data")
            contact_id = contact_data.get("id") if contact_data else None
            musteri_adi = contacts_map.get(contact_id, "") if contact_id else ""

            # Counterparty eşleştirme
            counterparty_id = _find_counterparty_id(db, company.id, musteri_adi)

            # Tutar bilgileri
            net_total = Decimal(str(attr.get("net_total", "0")))
            total_paid = Decimal(str(attr.get("total_paid", "0")))
            remaining = Decimal(str(attr.get("remaining", "0")))

            # Vade tarihi
            due_date_str = attr.get("due_date") or attr.get("issue_date")
            due_date = date_type.fromisoformat(due_date_str) if due_date_str else None

            if not due_date:
                hatali += 1
                detay.append(f"Fatura {parasut_id}: Vade tarihi bulunamadı, atlandı")
                continue

            # Referans numarası: açıklama veya fatura no
            reference = attr.get("description") or attr.get("invoice_no") or f"Paraşüt #{parasut_id}"

            # Yeni kayıt oluştur
            yeni_kayit = PlannedCashflowItem(
                type="INVOICE",
                direction="in",
                amount=net_total,
                due_date=due_date,
                counterparty=musteri_adi or None,
                counterparty_id=counterparty_id,
                reference_no=reference,
                status=_map_payment_status(attr.get("payment_status", "unpaid")),
                settled_amount=total_paid,
                remaining_amount=remaining,
                source="parasut",
                external_id=parasut_id,
                company_id=company.id,
            )

            db.add(yeni_kayit)
            eklenen += 1
            detay.append(f"Fatura {parasut_id} ({musteri_adi}): ₺{net_total} — eklendi")

        except Exception as e:
            hatali += 1
            detay.append(f"Fatura {parasut_id}: Hata — {str(e)}")

    db.commit()

    return {
        "toplam_fatura": len(tum_faturalar),
        "eklenen": eklenen,
        "atlanan_mevcut": atlanan,
        "hatali": hatali,
        "detay": detay,
    }


@router.post("/import-purchase-bills")
async def import_purchase_bills(
    db: Session = Depends(get_db),
    company: Company = Depends(get_current_company),
):
    """
    Paraşüt'ten alış faturalarını çeker ve planned_cashflow_items tablosuna aktarır.

    - Alış faturaları → type='INVOICE', direction='out' (ödeme yükümlülüğü)
    - Her faturanın Paraşüt ID'si "pb_{id}" formatında external_id alanında saklanır (idempotency)
    - Daha önce aktarılmış faturalar atlanır
    - Tedarikçi adı counterparty alanına, varsa counterparty_id eşleştirilir
    """
    integration = _get_integration(db, company.id)
    access_token = await _ensure_valid_token(integration, db)

    # Tüm sayfaları çek
    tum_faturalar = []
    sayfa = 1
    while True:
        params = {
            "page[number]": sayfa,
            "page[size]": 25,
        }
        data = await _parasut_get(
            access_token,
            f"/{integration.parasut_company_id}/purchase_bills",
            params,
        )

        faturalar = data.get("data", [])

        for fatura in faturalar:
            tum_faturalar.append(fatura)

        # Sonraki sayfa var mı kontrol et
        meta = data.get("meta", {})
        toplam_sayfa = meta.get("total_pages", 1)
        if sayfa >= toplam_sayfa:
            break
        sayfa += 1

    # Faturalardaki benzersiz supplier (contact) ID'lerini topla
    supplier_ids = set()
    for fatura in tum_faturalar:
        relationships = fatura.get("relationships", {})
        supplier_data = (
            relationships.get("supplier", {}).get("data")
            or relationships.get("spender", {}).get("data")
            or relationships.get("contact", {}).get("data")
        )
        if supplier_data and supplier_data.get("id"):
            supplier_ids.add(supplier_data["id"])

    # Her supplier ID için Paraşüt contacts API'den ad bilgisini çek
    contacts_map = {}
    for sid in supplier_ids:
        try:
            contact_data = await _parasut_get(
                access_token,
                f"/{integration.parasut_company_id}/contacts/{sid}",
            )
            ad = contact_data.get("data", {}).get("attributes", {}).get("name", "")
            if ad:
                contacts_map[sid] = ad
        except Exception:
            # Contact bilgisi alınamazsa atla
            pass

        # Sonraki sayfa var mı kontrol et
        meta = data.get("meta", {})
        toplam_sayfa = meta.get("total_pages", 1)
        if sayfa >= toplam_sayfa:
            break
        sayfa += 1

    # Mevcut Paraşüt alış faturası ID'lerini topla (idempotency kontrolü)
    mevcut_external_ids = set(
        row[0] for row in db.query(PlannedCashflowItem.external_id).filter(
            PlannedCashflowItem.company_id == company.id,
            PlannedCashflowItem.source == "parasut",
            PlannedCashflowItem.external_id.isnot(None),
        ).all()
    )

    eklenen = 0
    atlanan = 0
    hatali = 0
    detay = []

    for fatura in tum_faturalar:
        parasut_id = str(fatura.get("id", ""))
        external_id = f"pb_{parasut_id}"
        attr = fatura.get("attributes", {})

        # Daha önce aktarılmış mı kontrol et
        if external_id in mevcut_external_ids:
            atlanan += 1
            continue

        try:
            # Tedarikçi bilgisi — supplier.data.id ile contacts_map'ten ad al
            relationships = fatura.get("relationships", {})
            contact_data = (
                relationships.get("supplier", {}).get("data")
                or relationships.get("spender", {}).get("data")
                or relationships.get("contact", {}).get("data")
            )
            contact_id = contact_data.get("id") if contact_data else None
            tedarikci_adi = contacts_map.get(contact_id, "") if contact_id else ""

            # Counterparty eşleştirme
            counterparty_id = _find_counterparty_id(db, company.id, tedarikci_adi)

            # Tutar bilgileri
            net_total = Decimal(str(attr.get("net_total", "0")))
            total_paid = Decimal(str(attr.get("total_paid", "0")))
            remaining = Decimal(str(attr.get("remaining", "0")))

            # Vade tarihi
            due_date_str = attr.get("due_date") or attr.get("issue_date")
            due_date = date_type.fromisoformat(due_date_str) if due_date_str else None

            if not due_date:
                hatali += 1
                detay.append(f"Fatura pb_{parasut_id}: Vade tarihi bulunamadı, atlandı")
                continue

            # Referans numarası: açıklama veya fatura no
            reference = attr.get("description") or attr.get("invoice_no") or f"Paraşüt Alış #{parasut_id}"

            # Yeni kayıt oluştur
            yeni_kayit = PlannedCashflowItem(
                type="INVOICE",
                direction="out",
                amount=net_total,
                due_date=due_date,
                counterparty=tedarikci_adi or None,
                counterparty_id=counterparty_id,
                reference_no=reference,
                status=_map_payment_status(attr.get("payment_status", "unpaid")),
                settled_amount=total_paid,
                remaining_amount=remaining,
                source="parasut",
                external_id=external_id,
                company_id=company.id,
            )

            db.add(yeni_kayit)
            eklenen += 1
            detay.append(f"Fatura pb_{parasut_id} ({tedarikci_adi}): ₺{net_total} — eklendi")

        except Exception as e:
            hatali += 1
            detay.append(f"Fatura pb_{parasut_id}: Hata — {str(e)}")

    db.commit()

    return {
        "toplam_fatura": len(tum_faturalar),
        "eklenen": eklenen,
        "atlanan_mevcut": atlanan,
        "hatali": hatali,
        "detay": detay,
    }
