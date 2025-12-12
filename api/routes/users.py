"""
User Authentication Routes for UHT Factory.

Provides registration, login, email verification, and password management.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timedelta
import uuid
import os
import resend
import logging

from api.middleware.jwt_auth import (
    hash_password,
    verify_password,
    generate_verification_token,
    generate_password_reset_token,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    get_current_user,
    get_current_user_optional,
    blacklist_token,
    login_rate_limiter,
    register_rate_limiter,
    password_reset_rate_limiter,
    get_client_ip,
    decode_token,
    REFRESH_TOKEN_EXPIRE_DAYS,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    COOKIE_SECURE
)
from api.dependencies import get_neo4j_client
from db.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)
router = APIRouter()

# Base URL for email links
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://factory.universalhex.org")


# ==================== Request/Response Models ====================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class UserResponse(BaseModel):
    id: str
    email: str
    verified: bool
    created_at: str
    last_login: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


# ==================== Email Functions ====================

def send_verification_email(email: str, token: str):
    """Send email verification link."""
    verify_url = f"{APP_BASE_URL}/verify-email?token={token}"

    resend.api_key = os.getenv("RESEND_API_KEY")

    if not resend.api_key:
        logger.warning(f"[VERIFY EMAIL] RESEND_API_KEY not configured")
        logger.info(f"[VERIFY EMAIL] Email: {email}")
        logger.info(f"[VERIFY EMAIL] Verify URL: {verify_url}")
        return False

    try:
        params = {
            "from": "UHT Factory <info@paperworkchaser.com>",
            "to": [email],
            "subject": "Verify your UHT Factory account",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #00E5FF;">Welcome to UHT Factory</h2>
                <p>Thanks for registering! Please verify your email address by clicking the link below:</p>
                <p style="margin: 20px 0;">
                    <a href="{verify_url}"
                       style="background-color: #00E5FF; color: #000; padding: 12px 24px;
                              text-decoration: none; border-radius: 4px; display: inline-block;">
                        Verify Email Address
                    </a>
                </p>
                <p style="color: #666; font-size: 14px;">
                    Or copy this link: <a href="{verify_url}">{verify_url}</a>
                </p>
                <p style="color: #666; font-size: 12px;">
                    This link expires in 24 hours. If you didn't create an account, you can ignore this email.
                </p>
            </div>
            """
        }

        result = resend.Emails.send(params)
        logger.info(f"[VERIFY EMAIL] Email sent via Resend: {result}")
        return True
    except Exception as e:
        logger.error(f"[VERIFY EMAIL] Failed to send: {e}")
        return False


def send_password_reset_email(email: str, token: str):
    """Send password reset link."""
    reset_url = f"{APP_BASE_URL}/reset-password?token={token}"

    resend.api_key = os.getenv("RESEND_API_KEY")

    if not resend.api_key:
        logger.warning(f"[RESET PASSWORD] RESEND_API_KEY not configured")
        logger.info(f"[RESET PASSWORD] Email: {email}")
        logger.info(f"[RESET PASSWORD] Reset URL: {reset_url}")
        return False

    try:
        params = {
            "from": "UHT Factory <info@paperworkchaser.com>",
            "to": [email],
            "subject": "Reset your UHT Factory password",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #00E5FF;">Password Reset Request</h2>
                <p>We received a request to reset your password. Click the link below to set a new password:</p>
                <p style="margin: 20px 0;">
                    <a href="{reset_url}"
                       style="background-color: #00E5FF; color: #000; padding: 12px 24px;
                              text-decoration: none; border-radius: 4px; display: inline-block;">
                        Reset Password
                    </a>
                </p>
                <p style="color: #666; font-size: 14px;">
                    Or copy this link: <a href="{reset_url}">{reset_url}</a>
                </p>
                <p style="color: #666; font-size: 12px;">
                    This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.
                </p>
            </div>
            """
        }

        result = resend.Emails.send(params)
        logger.info(f"[RESET PASSWORD] Email sent via Resend: {result}")
        return True
    except Exception as e:
        logger.error(f"[RESET PASSWORD] Failed to send: {e}")
        return False


# ==================== Routes ====================

@router.post("/register", response_model=UserResponse)
async def register(
    request: Request,
    data: RegisterRequest,
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Register a new user account.

    - Sends verification email to complete registration
    - Password must be at least 8 characters
    """
    # Rate limit by IP
    client_ip = get_client_ip(request)
    await register_rate_limiter.check_or_raise(client_ip, request)

    # Check if email already exists
    existing = await neo4j.find_user_by_email(data.email)
    if existing:
        # Don't reveal that email exists
        raise HTTPException(
            status_code=400,
            detail="Unable to create account. Please try again or use a different email."
        )

    # Create user
    user_id = str(uuid.uuid4())
    verification_token = generate_verification_token()
    verification_expires = (datetime.utcnow() + timedelta(hours=24)).isoformat()

    user_data = {
        "id": user_id,
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "verification_token": verification_token,
        "verification_expires": verification_expires
    }

    user = await neo4j.create_user(user_data)

    if not user:
        raise HTTPException(status_code=500, detail="Failed to create account")

    # Send verification email
    send_verification_email(data.email, verification_token)

    return UserResponse(
        id=user["id"],
        email=user["email"],
        verified=user.get("verified", False),
        created_at=user["created_at"],
        last_login=user.get("last_login")
    )


@router.get("/verify-email/{token}")
async def verify_email(
    token: str,
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Verify user's email address using the token from verification email.
    """
    user = await neo4j.find_user_by_verification_token(token)

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired verification link"
        )

    success = await neo4j.verify_user_email(user["id"])

    if not success:
        raise HTTPException(status_code=500, detail="Failed to verify email")

    return {
        "message": "Email verified successfully. You can now log in.",
        "verified": True
    }


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    data: LoginRequest,
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Login with email and password.

    - Returns access token (15 min) and refresh token (7 days)
    - Refresh token is also set as httpOnly cookie
    """
    # Rate limit by IP
    client_ip = get_client_ip(request)
    await login_rate_limiter.check_or_raise(client_ip, request)

    # Find user
    user = await neo4j.find_user_by_email(data.email)

    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # Check if email is verified
    if not user.get("verified", False):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address before logging in"
        )

    # Update last login
    await neo4j.update_user_last_login(user["id"])

    # Generate tokens
    access_token = create_access_token(user["id"], user["email"])
    refresh_token = create_refresh_token(user["id"])

    # Set refresh token as httpOnly cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user)
):
    """
    Logout the current user.

    - Blacklists the current tokens
    - Clears the refresh token cookie
    """
    # Try to blacklist refresh token from cookie
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            if payload and payload.get("jti"):
                # Blacklist for remaining lifetime
                exp = payload.get("exp", 0)
                remaining = max(0, exp - int(datetime.utcnow().timestamp()))
                await blacklist_token(payload["jti"], remaining, request)
        except Exception as e:
            logger.warning(f"Could not blacklist refresh token: {e}")

    # Clear cookie
    response.delete_cookie("refresh_token")

    return {"message": "Logged out successfully"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    request: Request,
    response: Response,
    data: RefreshRequest = None,
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Refresh access token using refresh token.

    - Accepts refresh token from request body or httpOnly cookie
    - Returns new access and refresh tokens
    """
    # Get refresh token from body or cookie
    refresh_token = data.refresh_token if data else request.cookies.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            status_code=401,
            detail="Refresh token required"
        )

    # Verify refresh token
    payload = await verify_refresh_token(refresh_token, request)

    # Get user to ensure they still exist and are verified
    user = await neo4j.find_user_by_id(payload["sub"])

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    if not user.get("verified", False):
        raise HTTPException(
            status_code=403,
            detail="Email not verified"
        )

    # Blacklist old refresh token
    if payload.get("jti"):
        exp = payload.get("exp", 0)
        remaining = max(0, exp - int(datetime.utcnow().timestamp()))
        await blacklist_token(payload["jti"], remaining, request)

    # Generate new tokens
    new_access_token = create_access_token(user["id"], user["email"])
    new_refresh_token = create_refresh_token(user["id"])

    # Set new refresh token cookie
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get current authenticated user's information.
    """
    user = await neo4j.find_user_by_id(current_user["user_id"])

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=user["id"],
        email=user["email"],
        verified=user.get("verified", False),
        created_at=user["created_at"],
        last_login=user.get("last_login")
    )


@router.post("/forgot-password")
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Request password reset email.

    - Always returns success to prevent email enumeration
    """
    # Rate limit by email (not IP, to prevent abuse targeting specific accounts)
    await password_reset_rate_limiter.check_or_raise(data.email.lower(), request)

    user = await neo4j.find_user_by_email(data.email)

    if user and user.get("verified", False):
        token = generate_password_reset_token()
        expires = (datetime.utcnow() + timedelta(hours=1)).isoformat()

        await neo4j.set_password_reset_token(user["id"], token, expires)
        send_password_reset_email(data.email, token)

    # Always return success to prevent email enumeration
    return {
        "message": "If an account with that email exists, a password reset link has been sent."
    }


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Reset password using token from email.
    """
    user = await neo4j.find_user_by_reset_token(data.token)

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link"
        )

    new_hash = hash_password(data.password)
    success = await neo4j.update_user_password(user["id"], new_hash)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to reset password")

    return {"message": "Password reset successfully. You can now log in with your new password."}


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Change password for authenticated user.

    - Requires current password for verification
    """
    user = await neo4j.find_user_by_id(current_user["user_id"])

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify current password
    if not verify_password(data.current_password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect"
        )

    # Update password
    new_hash = hash_password(data.new_password)
    success = await neo4j.update_user_password(user["id"], new_hash)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to update password")

    return {"message": "Password changed successfully"}


@router.get("/me/apikeys")
async def get_my_api_keys(
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Get all API keys linked to the current authenticated user.

    - Returns key metadata (not the actual key values)
    - Use this to retrieve your API key(s) after login
    """
    user_id = current_user["user_id"]
    keys = await neo4j.get_user_api_keys(user_id)

    return {
        "api_keys": keys,
        "count": len(keys)
    }


@router.post("/me/apikeys/generate")
async def generate_my_api_key(
    current_user: dict = Depends(get_current_user),
    neo4j: Neo4jClient = Depends(get_neo4j_client),
    request: Request = None
):
    """
    Generate a new API key for the current authenticated user.

    - Automatically links the key to your user account
    - Returns the plaintext key (SHOWN ONLY ONCE - save it!)
    - Default scopes: read, classify, preprocess, images
    """
    from api.middleware.api_key_auth import api_key_manager

    user_id = current_user["user_id"]
    user_email = current_user.get("email", "user")

    # Generate API key
    result = await api_key_manager.create_api_key(
        name=f"user-{user_email.split('@')[0]}",
        scopes=["read", "classify", "preprocess", "images"],
        rate_limit=500,
        expires_days=365
    )

    # Link to user account
    key_id = result["key_id"]
    await neo4j.link_api_key_to_user(user_id, key_id)

    logger.info(f"Generated and linked API key for user {user_email} (key_id: {key_id})")

    return {
        "api_key": result["api_key"],  # Plaintext - ONLY TIME IT'S SHOWN
        "key_id": key_id,
        "message": "API key generated successfully. Save it now - it won't be shown again!",
        "scopes": result["scopes"],
        "expires_at": result.get("expires_at")
    }
