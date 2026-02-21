# app/models/parasut_integration.py
# Paraşüt muhasebe yazılımı entegrasyon modeli

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class ParasutIntegration(Base):
    """Firma bazında Paraşüt OAuth2 entegrasyon bilgileri"""
    __tablename__ = "parasut_integrations"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), unique=True, nullable=False, index=True)

    # Paraşüt firma numarası (API URL'lerinde kullanılır)
    parasut_company_id = Column(String, nullable=False)

    # Kullanıcının kendi Paraşüt API uygulama bilgileri
    parasut_client_id = Column(String, nullable=False)
    parasut_client_secret = Column(String, nullable=False)

    # OAuth2 token bilgileri
    access_token = Column(String, nullable=True)
    refresh_token = Column(String, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)

    # Bağlantı durumu
    is_connected = Column(Boolean, default=False)

    # Paraşüt kullanıcı e-postası (bilgi amaçlı)
    parasut_email = Column(String, nullable=True)

    # Zaman damgaları
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
