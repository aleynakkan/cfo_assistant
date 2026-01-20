# app/core/security.py

from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from passlib.context import CryptContext

# 🔹 Bunları .env'ye taşırsın ileride
SECRET_KEY = "super-secret-key-change-this-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 gün

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    # UTF-8 encode ve 72 byte'a truncate et
    pwd_bytes = password.encode('utf-8')[:72]
    pwd_str = pwd_bytes.decode('utf-8', errors='ignore')
    return pwd_context.hash(pwd_str)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # UTF-8 encode ve 72 byte'a truncate et
    pwd_bytes = plain_password.encode('utf-8')[:72]
    pwd_str = pwd_bytes.decode('utf-8', errors='ignore')
    return pwd_context.verify(pwd_str, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
