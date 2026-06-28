"""
JWT creation/validation and password hashing utilities.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=4 if settings.APP_ENV == "development" else 10
)
ALGORITHM = settings.ALGORITHM


def hash_password(password: str) -> str:
    """Synchronous bcrypt hash — use only in non-async contexts."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Synchronous bcrypt verify — use only in non-async contexts."""
    return pwd_context.verify(plain_password, hashed_password)


async def async_hash_password(password: str) -> str:
    """Non-blocking bcrypt hash — runs in a thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(pwd_context.hash, password)


async def async_verify_password(plain_password: str, hashed_password: str) -> bool:
    """Non-blocking bcrypt verify — runs in a thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(pwd_context.verify, plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def verify_access_token(token: str) -> Optional[str]:
    """Returns user_id if valid, else None."""
    payload = decode_token(token)
    if payload and payload.get("type") == "access":
        return payload.get("sub")
    return None
