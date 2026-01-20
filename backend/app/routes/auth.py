# app/routes/auth.py

from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.deps import get_db
from app.models.user import User
from app.models.company import Company
from app.core.security import verify_password, hash_password, create_access_token
from app.schemas.auth import Token, LoginRequest


class LoginFormData(BaseModel):
    username: str
    password: str

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/test-login-debug")
def test_login_debug(
    email: str = Form(...),
    password: str = Form(...),
):
    """Debug endpoint - form alıyor mu?"""
    return {
        "email_received": email,
        "password_received": password,
        "status": "form received successfully"
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
