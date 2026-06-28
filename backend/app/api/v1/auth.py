"""
Authentication endpoints: register, login, refresh, Google OAuth.
"""
import httpx
import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.security import (
    async_hash_password, async_verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from app.db.base import get_db
from app.db.models import User, UserSettings
from app.schemas.auth import (
    UserRegister, UserLogin, TokenResponse,
    RefreshTokenRequest, UserResponse, PasswordChangeRequest,
    GoogleLoginRequest,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user."""
    # Check existing email
    result = await db.execute(select(User).where(User.email == str(data.email)))
    if result.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Check existing username
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")

    user = User(
        email=str(data.email),
        username=data.username,
        full_name=data.full_name,
        hashed_password=await async_hash_password(data.password),
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    # Create default settings
    user_settings = UserSettings(user_id=user.id)
    db.add(user_settings)
    await db.flush()

    return _user_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """Login with email and password."""
    result = await db.execute(select(User).where(User.email == str(data.email)))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not await async_verify_password(data.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is inactive")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    """Refresh access token using a valid refresh token."""
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")

    access_token = create_access_token({"sub": str(user.id)})
    new_refresh = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/google", response_model=TokenResponse)
async def google_login(data: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with Google OAuth2."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Google OAuth not configured")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": data.code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": f"{settings.FRONTEND_URL}/auth/google/callback",
                "grant_type": "authorization_code",
            },
        )
        if token_response.status_code != 200:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google authentication failed")

        token_data = token_response.json()
        google_access_token = token_data.get("access_token")

        # Get user info
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
        if userinfo_response.status_code != 200:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Could not fetch Google user info")

        google_user = userinfo_response.json()

    email = google_user.get("email")
    google_id = google_user.get("id")
    name = google_user.get("name")
    avatar = google_user.get("picture")

    # Find or create user
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        # Check by email
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user:
            # Link Google to existing account
            user.google_id = google_id
            user.avatar_url = avatar
        else:
            # Create new user
            username = email.split("@")[0].replace(".", "_").lower()
            # Make username unique
            base_username = username
            counter = 1
            while True:
                check = await db.execute(select(User).where(User.username == username))
                if not check.scalar_one_or_none():
                    break
                username = f"{base_username}{counter}"
                counter += 1

            user = User(
                email=email,
                username=username,
                full_name=name,
                google_id=google_id,
                avatar_url=avatar,
                is_active=True,
                is_verified=True,
            )
            db.add(user)
            await db.flush()

            user_settings = UserSettings(user_id=user.id)
            db.add(user_settings)

    await db.flush()

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token_str = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token_str,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user info."""
    return _user_response(current_user)


@router.put("/password")
async def change_password(
    data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change user password."""
    if not current_user.hashed_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No password set (OAuth user)")

    if not await async_verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")

    current_user.hashed_password = await async_hash_password(data.new_password)
    await db.flush()
    return {"message": "Password changed successfully"}


@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """
    Logout: blacklists the current access token in Redis so it cannot be reused.
    The frontend should also delete the tokens from localStorage.
    """
    from app.core.security import decode_token
    from datetime import datetime, timezone

    token = None
    if request:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if token:
        payload = decode_token(token)
        if payload:
            # Calculate remaining TTL for the token
            exp = payload.get("exp", 0)
            now = int(datetime.now(timezone.utc).timestamp())
            remaining_ttl = max(exp - now, 0)

            if remaining_ttl > 0:
                try:
                    from app.api.v1.analytics import _get_redis
                    r = await _get_redis()
                    if r:
                        blacklist_key = f"blacklist_token:{token[:50]}"  # truncated for key safety
                        await r.setex(blacklist_key, remaining_ttl, "1")
                        logger.info("Token blacklisted for user %s (TTL=%ds)", current_user.id, remaining_ttl)
                except Exception as e:
                    logger.warning("Could not blacklist token: %s", e)

    return {"message": "Logged out successfully"}


def _user_response(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else "",
    }
