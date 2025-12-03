"""
Authentication routes for UHT Factory.

Provides API key management for protecting LLM-calling endpoints.
"""

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from jose import jwt
import os
import uuid
import resend
from datetime import datetime, timedelta

from api.middleware.api_key_auth import (
    api_key_manager,
    verify_api_key,
    require_admin,
    Scopes
)

router = APIRouter()
security = HTTPBearer(auto_error=False)

SECRET_KEY = os.getenv("JWT_SECRET", "your-jwt-secret-minimum-32-characters-change-in-production")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

# Admin secret for initial API key creation (set in .env)
ADMIN_SECRET = os.getenv("UHT_ADMIN_SECRET", None)

# Pending access requests (in-memory for simplicity, could use Redis)
pending_requests: dict = {}


class CreateAPIKeyRequest(BaseModel):
    """Request model for creating a new API key."""
    name: str
    scopes: Optional[List[str]] = None
    rate_limit: Optional[int] = 1000
    expires_days: Optional[int] = None


class RevokeAPIKeyRequest(BaseModel):
    """Request model for revoking an API key."""
    key_id: str


class AccessRequest(BaseModel):
    """Request model for requesting access."""
    email: EmailStr


# ==================== API KEY MANAGEMENT ====================

@router.post("/keys/create")
async def create_api_key(
    request: CreateAPIKeyRequest,
    admin_secret: str = Header(None, alias="X-Admin-Secret"),
    key_data: dict = Depends(require_admin)
):
    """
    Create a new API key.

    Requires admin scope or admin secret header.
    Returns the plaintext API key (shown only once).
    """
    # Allow creation with admin API key OR admin secret
    if key_data is None and admin_secret != ADMIN_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Admin access required to create API keys"
        )

    # Validate scopes
    valid_scopes = {Scopes.READ, Scopes.CLASSIFY, Scopes.PREPROCESS, Scopes.IMAGES, Scopes.ADMIN}
    if request.scopes:
        invalid = set(request.scopes) - valid_scopes
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid scopes: {invalid}. Valid: {valid_scopes}"
            )

    result = await api_key_manager.create_api_key(
        name=request.name,
        scopes=request.scopes,
        rate_limit=request.rate_limit,
        expires_days=request.expires_days
    )

    return result


@router.post("/keys/bootstrap")
async def bootstrap_api_key(
    request: CreateAPIKeyRequest,
    admin_secret: str = Header(..., alias="X-Admin-Secret")
):
    """
    Bootstrap the first API key using admin secret.

    This endpoint can only be used with the X-Admin-Secret header
    and is intended for initial setup before any API keys exist.
    """
    if not ADMIN_SECRET:
        raise HTTPException(
            status_code=500,
            detail="UHT_ADMIN_SECRET not configured. Set it in .env file."
        )

    if admin_secret != ADMIN_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Invalid admin secret"
        )

    # Force admin scope for bootstrap key
    scopes = request.scopes or [Scopes.ADMIN, Scopes.CLASSIFY, Scopes.PREPROCESS, Scopes.IMAGES, Scopes.READ]

    result = await api_key_manager.create_api_key(
        name=request.name,
        scopes=scopes,
        rate_limit=request.rate_limit or 10000,  # Higher limit for admin
        expires_days=request.expires_days
    )

    return result


@router.get("/keys")
async def list_api_keys(
    key_data: dict = Depends(require_admin)
):
    """
    List all API keys (admin only).

    Returns key metadata but never the actual key values.
    """
    keys = await api_key_manager.list_api_keys()
    return {"keys": keys, "total": len(keys)}


@router.post("/keys/revoke")
async def revoke_api_key(
    request: RevokeAPIKeyRequest,
    key_data: dict = Depends(require_admin)
):
    """
    Revoke an API key (admin only).

    The key will immediately become invalid.
    """
    success = await api_key_manager.revoke_api_key(request.key_id)

    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"API key not found: {request.key_id}"
        )

    return {"message": f"API key {request.key_id} revoked successfully"}


@router.get("/keys/verify")
async def verify_current_key(
    key_data: dict = Depends(verify_api_key)
):
    """
    Verify the current API key and return its metadata.

    Useful for testing that an API key is valid.
    """
    return {
        "valid": True,
        "key_id": key_data["key_id"],
        "name": key_data["name"],
        "scopes": key_data["scopes"],
        "rate_limit": key_data["rate_limit"],
        "used_count": key_data["used_count"]
    }


# ==================== JWT TOKEN ENDPOINTS (Legacy) ====================

@router.post("/token")
async def create_token(api_key: str = Header(..., alias="X-API-Key")):
    """
    Exchange a valid API key for a JWT token.

    The JWT can be used as an alternative to API key for subsequent requests.
    """
    # Validate the API key first
    key_data = await api_key_manager.validate_api_key(api_key)

    if not key_data:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Create JWT token
    payload = {
        "sub": key_data["key_id"],
        "name": key_data["name"],
        "scopes": key_data["scopes"],
        "exp": datetime.utcnow() + timedelta(
            minutes=int(os.getenv("JWT_EXPIRATION_MINUTES", 30))
        ),
        "iat": datetime.utcnow()
    }

    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": int(os.getenv("JWT_EXPIRATION_MINUTES", 30)) * 60,
        "scopes": key_data["scopes"]
    }


@router.get("/me")
async def get_user_info(key_data: dict = Depends(verify_api_key)):
    """Get current authenticated user/key information."""
    return {
        "key_id": key_data["key_id"],
        "name": key_data["name"],
        "scopes": key_data["scopes"]
    }


# ==================== ACCESS REQUEST SYSTEM ====================

def send_access_request_email(email: str, token: str, base_url: str):
    """Send access request notification to admin with magic link using Resend."""
    admin_email = os.getenv("ADMIN_EMAIL", "steven.holland@outlook.com")
    approve_url = f"{base_url}/api/v1/auth/approve/{token}"

    # Configure Resend API key
    resend.api_key = os.getenv("RESEND_API_KEY")

    if not resend.api_key:
        print("[ACCESS REQUEST] RESEND_API_KEY not configured")
        print(f"[ACCESS REQUEST] Email: {email}")
        print(f"[ACCESS REQUEST] Approve URL: {approve_url}")
        return False

    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px; background: #1a1a1a; color: #fff;">
        <div style="max-width: 600px; margin: 0 auto; background: #2a2a2a; padding: 30px; border-radius: 8px; border: 1px solid #00E5FF;">
            <h2 style="color: #00E5FF; margin-top: 0;">UHT Factory Access Request</h2>
            <p>A user has requested access to UHT Factory:</p>
            <p style="background: #333; padding: 15px; border-radius: 4px; font-size: 18px;">
                <strong>Email:</strong> {email}
            </p>
            <p>Click the button below to approve and generate an API key:</p>
            <a href="{approve_url}"
               style="display: inline-block; background: #00E5FF; color: #000; padding: 12px 24px;
                      text-decoration: none; border-radius: 4px; font-weight: bold; margin: 20px 0;">
                Approve Access
            </a>
            <p style="color: #888; font-size: 12px; margin-top: 30px;">
                This link expires in 24 hours. Request time: {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}
            </p>
        </div>
    </body>
    </html>
    """

    try:
        params = {
            "from": "UHT Factory <hello@paperworkchaser.com>",
            "to": [admin_email],
            "subject": f"UHT Factory Access Request: {email}",
            "html": html_content,
            "headers": {
                "X-Entity-Ref-ID": token  # Unique ID for deduplication
            }
        }

        # Send without click tracking (Resend tracks by default which wraps URLs)
        result = resend.Emails.send(params)
        print(f"[ACCESS REQUEST] Email sent via Resend: {result}")
        return True

    except Exception as e:
        print(f"[ACCESS REQUEST] Resend failed: {e}")
        # Fall back to logging the approval URL
        print(f"[ACCESS REQUEST] Email: {email}")
        print(f"[ACCESS REQUEST] Approve URL: {approve_url}")
        return False


@router.post("/request-access")
async def request_access(request: AccessRequest, req: Request):
    """
    Request access to UHT Factory.

    Sends an email to admin with a magic link to approve the request.
    """
    email = request.email

    # Check if already pending
    for token, data in pending_requests.items():
        if data["email"] == email and data["expires"] > datetime.now():
            return {
                "message": "Access request already pending. Please wait for admin approval.",
                "email": email
            }

    # Generate approval token
    token = str(uuid.uuid4())

    # Store pending request (expires in 24 hours)
    pending_requests[token] = {
        "email": email,
        "created": datetime.now(),
        "expires": datetime.now() + timedelta(hours=24)
    }

    # Always use production URL for approve links (admin clicks from email)
    base_url = "https://factory.universalhex.org"

    # Send email to admin
    email_sent = send_access_request_email(email, token, base_url)

    return {
        "message": "Access request submitted. You will receive an email with your API key once approved.",
        "email": email,
        "email_sent": email_sent
    }


@router.get("/approve/{token}", response_class=HTMLResponse)
async def approve_access(token: str):
    """
    Approve an access request and generate API key.

    This endpoint is accessed via the magic link sent to admin email.
    """
    # Check if token exists and is valid
    if token not in pending_requests:
        return HTMLResponse(content="""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; text-align: center;">
            <h2 style="color: #ff4444;">Invalid or Expired Token</h2>
            <p>This access request link is invalid or has expired.</p>
        </body>
        </html>
        """, status_code=404)

    request_data = pending_requests[token]

    if request_data["expires"] < datetime.now():
        del pending_requests[token]
        return HTMLResponse(content="""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; text-align: center;">
            <h2 style="color: #ff4444;">Token Expired</h2>
            <p>This access request link has expired. The user will need to request access again.</p>
        </body>
        </html>
        """, status_code=410)

    email = request_data["email"]

    # Generate API key for the user
    try:
        result = await api_key_manager.create_api_key(
            name=f"user-{email.split('@')[0]}",
            scopes=[Scopes.READ, Scopes.CLASSIFY, Scopes.PREPROCESS, Scopes.IMAGES],
            rate_limit=500,
            expires_days=365
        )

        api_key = result["api_key"]

        # Remove from pending
        del pending_requests[token]

        return HTMLResponse(content=f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; background: #1a1a1a; color: #fff;">
            <div style="max-width: 600px; margin: 0 auto; background: #2a2a2a; padding: 30px; border-radius: 8px; border: 1px solid #00E5FF;">
                <h2 style="color: #00E5FF; margin-top: 0;">Access Approved!</h2>
                <p>API key generated for: <strong>{email}</strong></p>
                <p style="margin-top: 20px;">API Key:</p>
                <div style="background: #333; padding: 15px; border-radius: 4px; font-family: monospace; word-break: break-all; font-size: 14px; border: 1px solid #00E5FF;">
                    {api_key}
                </div>
                <p style="color: #888; font-size: 12px; margin-top: 20px;">
                    Please send this API key to the user at {email}.<br>
                    They can enter it in Settings on the UHT Factory website.
                </p>
                <p style="margin-top: 30px;">
                    <strong>Scopes:</strong> read, classify, preprocess, images<br>
                    <strong>Rate Limit:</strong> 500 requests/hour<br>
                    <strong>Expires:</strong> 1 year
                </p>
            </div>
        </body>
        </html>
        """)

    except Exception as e:
        return HTMLResponse(content=f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; text-align: center;">
            <h2 style="color: #ff4444;">Error Creating API Key</h2>
            <p>Failed to create API key: {str(e)}</p>
        </body>
        </html>
        """, status_code=500)
