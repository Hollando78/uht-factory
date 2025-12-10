"""
JWT Authentication Middleware for UHT Factory User Accounts.

Provides JWT-based authentication for user sessions (separate from API key auth).
"""

from fastapi import HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
from jose import jwt, JWTError
import bcrypt
from datetime import datetime, timedelta
import secrets
import os
import logging

logger = logging.getLogger(__name__)

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Security scheme
security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def generate_verification_token() -> str:
    """Generate a secure random token for email verification."""
    return secrets.token_urlsafe(32)


def generate_password_reset_token() -> str:
    """Generate a secure random token for password reset."""
    return secrets.token_urlsafe(32)


def create_access_token(user_id: str, email: str) -> str:
    """Create a short-lived access token."""
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": expire,
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """Create a long-lived refresh token."""
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.utcnow(),
        "jti": secrets.token_hex(16)  # Unique token ID for blacklisting
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        logger.debug(f"JWT decode error: {e}")
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    request: Request = None
) -> Dict[str, Any]:
    """
    Dependency that extracts and validates the current user from JWT.
    Raises HTTPException if not authenticated.
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = credentials.credentials
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=401,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Check if token is blacklisted (for logout)
    if request and hasattr(request.app.state, 'redis_client'):
        redis = request.app.state.redis_client
        if redis and redis.client:
            try:
                jti = payload.get("jti")
                if jti:
                    is_blacklisted = await redis.client.get(f"blacklist:{jti}")
                    if is_blacklisted:
                        raise HTTPException(
                            status_code=401,
                            detail="Token has been revoked",
                            headers={"WWW-Authenticate": "Bearer"}
                        )
            except Exception as e:
                logger.warning(f"Could not check token blacklist: {e}")

    return {
        "user_id": payload["sub"],
        "email": payload.get("email"),
        "token_type": "access"
    }


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    request: Request = None
) -> Optional[Dict[str, Any]]:
    """
    Dependency that returns user info if authenticated, or None for guests.
    Does not raise exceptions for missing/invalid tokens.
    """
    if not credentials:
        return None

    token = credentials.credentials
    payload = decode_token(token)

    if not payload or payload.get("type") != "access":
        return None

    return {
        "user_id": payload["sub"],
        "email": payload.get("email"),
        "token_type": "access"
    }


async def verify_refresh_token(
    token: str,
    request: Request = None
) -> Dict[str, Any]:
    """
    Verify a refresh token and return the payload.
    Raises HTTPException if invalid.
    """
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired refresh token"
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=401,
            detail="Invalid token type"
        )

    # Check if token is blacklisted
    if request and hasattr(request.app.state, 'redis_client'):
        redis = request.app.state.redis_client
        if redis and redis.client:
            try:
                jti = payload.get("jti")
                if jti:
                    is_blacklisted = await redis.client.get(f"blacklist:{jti}")
                    if is_blacklisted:
                        raise HTTPException(
                            status_code=401,
                            detail="Refresh token has been revoked"
                        )
            except Exception as e:
                logger.warning(f"Could not check token blacklist: {e}")

    return payload


async def blacklist_token(jti: str, expires_in: int, request: Request):
    """Add a token to the blacklist (for logout)."""
    if hasattr(request.app.state, 'redis_client'):
        redis = request.app.state.redis_client
        if redis and redis.client:
            try:
                await redis.client.setex(f"blacklist:{jti}", expires_in, "1")
                return True
            except Exception as e:
                logger.error(f"Could not blacklist token: {e}")
    return False


class RateLimiter:
    """Simple rate limiter using Redis."""

    def __init__(self, key_prefix: str, max_requests: int, window_seconds: int):
        self.key_prefix = key_prefix
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def check(self, identifier: str, request: Request) -> bool:
        """
        Check if the identifier is within rate limits.
        Returns True if allowed, False if rate limited.
        """
        if not hasattr(request.app.state, 'redis_client'):
            return True

        redis = request.app.state.redis_client
        if not redis or not redis.client:
            return True

        try:
            key = f"{self.key_prefix}:{identifier}"
            current = await redis.client.incr(key)

            if current == 1:
                await redis.client.expire(key, self.window_seconds)

            return current <= self.max_requests
        except Exception as e:
            logger.warning(f"Rate limit check failed: {e}")
            return True  # Allow on error

    async def check_or_raise(self, identifier: str, request: Request):
        """Check rate limit and raise HTTPException if exceeded."""
        if not await self.check(identifier, request):
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Limit: {self.max_requests} per {self.window_seconds} seconds"
            )


# Pre-configured rate limiters
login_rate_limiter = RateLimiter("ratelimit:login", max_requests=5, window_seconds=900)  # 5 per 15 min
register_rate_limiter = RateLimiter("ratelimit:register", max_requests=3, window_seconds=3600)  # 3 per hour
password_reset_rate_limiter = RateLimiter("ratelimit:reset", max_requests=3, window_seconds=3600)  # 3 per hour


def get_client_ip(request: Request) -> str:
    """Get client IP address from request, handling proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
