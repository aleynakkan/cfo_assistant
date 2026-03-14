# app/routes/auth.py

from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.deps import get_db
from app.models.user import User
from app.models.company import Company
from app.core.security import verify_password, hash_password, create_access_token
from app.core.email import send_password_reset_email
from app.core.deps import get_current_user
from app.schemas.auth import Token, LoginRequest


class LoginFormData(BaseModel):
    username: str
    password: str

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/health")
def health_check():
    """API sağlık kontrolü - database bağlantısı olmadan"""
    return {
        "status": "API is running",
        "timestamp": "2026-02-21"
    }


@router.post("/register", response_model=Token)
def register(
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """Yeni kullanıcı kaydı ve ilişkili company oluşturma."""
    # basit register: email unique check
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email zaten kayıtlı")

    user = User(
        email=email,
        hashed_password=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # her user için tek company (MVP)
    company = Company(name=f"{email} Company", owner_id=user.id)
    db.add(company)
    db.commit()
    db.refresh(company)

    access_token = create_access_token(
        {"sub": str(user.id), "company_id": company.id}
    )
    return Token(access_token=access_token)


@router.post("/login", response_model=Token)
def login(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """Kullanıcı girişi ve token üretimi (OAuth2PasswordBearer uyumlu)."""
    # Swagger UI'nin Authorize dialog'u 'username' gönderir, email gibi kullan
    email = username
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Geçersiz kimlik bilgileri")

    if not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Geçersiz kimlik bilgileri")

    # Bu user'ın companysini bul (MVP: ilk company)
    company = db.query(Company).filter(Company.owner_id == user.id).first()
    if not company:
        # yoksa oluştur
        company = Company(name=f"{user.email} Company", owner_id=user.id)
        db.add(company)
        db.commit()
        db.refresh(company)

    access_token = create_access_token(
        {"sub": str(user.id), "company_id": company.id}
    )
    return Token(access_token=access_token)


@router.post("/forgot-password")
def forgot_password(
    email: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Parola sıfırlama - reset token oluştur ve email ile gönder.
    Güvenlik: Email var/yok ayrımı yapılmaz.
    """
    # Aynı mesajı her durumda dön (email enumeration koruması)
    success_msg = "Eğer bu email adresi sistemde kayıtlıysa, parola sıfırlama bağlantısı gönderilmiştir."

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"message": success_msg}

    # Güvenli rastgele token oluştur
    reset_token = secrets.token_urlsafe(32)
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    # Email gönder
    email_sent = send_password_reset_email(to_email=email, reset_token=reset_token)

    if not email_sent:
        # SMTP çalışmıyorsa token'ı doğrudan dön (development modu)
        import os
        if os.getenv("ENV", "local") != "production":
            return {
                "message": success_msg,
                "dev_reset_token": reset_token,
                "dev_note": "SMTP ayarları eksik. Bu token sadece development ortamında gösterilir."
            }

    return {"message": success_msg}


@router.post("/reset-password")
def reset_password(
    token: str = Form(...),
    new_password: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Reset token ile yeni parola belirleme.
    """
    if not token or not new_password:
        raise HTTPException(status_code=400, detail="Token ve yeni şifre gereklidir")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Şifre en az 6 karakter olmalıdır")

    # Token ile kullanıcıyı bul
    user = db.query(User).filter(User.reset_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş sıfırlama bağlantısı")

    # Token süresini kontrol et
    if user.reset_token_expires is None or user.reset_token_expires < datetime.utcnow():
        # Süresi dolmuş token'ı temizle
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()
        raise HTTPException(status_code=400, detail="Sıfırlama bağlantısının süresi dolmuş. Lütfen tekrar deneyin.")

    # Şifreyi güncelle ve token'ı temizle
    user.hashed_password = hash_password(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return {"message": "Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz."}


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Login olan kullanıcı mevcut şifresini doğrulayarak yeni şifre belirler.
    """
    if not body.old_password or not body.new_password:
        raise HTTPException(status_code=400, detail="Mevcut şifre ve yeni şifre gereklidir")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Yeni şifre en az 6 karakter olmalıdır")

    if not verify_password(body.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Mevcut şifreniz hatalı")

    current_user.hashed_password = hash_password(body.new_password)
    db.commit()

    return {"message": "Şifreniz başarıyla güncellendi."}
