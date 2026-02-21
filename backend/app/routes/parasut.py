# app/routes/parasut.py
# Paraşüt muhasebe yazılımı entegrasyon endpoint'leri
# Sadece GET istekleri ile fatura verisi çekme (salt okunur)

from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_company
from app.models.company import Company
from app.models.parasut_integration import ParasutIntegration

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
        "include": "spender,details,details.product",
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
