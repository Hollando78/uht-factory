from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from jose import jwt
import os
from datetime import datetime, timedelta

router = APIRouter()
security = HTTPBearer()

SECRET_KEY = os.getenv("JWT_SECRET", "fallback-secret-key")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

@router.post("/token")
async def create_token(api_key: str):
    """Create a JWT token for API access"""
    # In production, validate api_key against database
    # For now, accept any non-empty key
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    # Create JWT token
    payload = {
        "sub": api_key[:8],  # Subject (truncated key)
        "exp": datetime.utcnow() + timedelta(
            minutes=int(os.getenv("JWT_EXPIRATION_MINUTES", 30))
        ),
        "iat": datetime.utcnow()
    }
    
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": int(os.getenv("JWT_EXPIRATION_MINUTES", 30)) * 60
    }

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Validate JWT token"""
    token = credentials.credentials
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"username": username}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.get("/me")
async def get_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
    return current_user

@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """Refresh JWT token"""
    payload = {
        "sub": current_user["username"],
        "exp": datetime.utcnow() + timedelta(
            minutes=int(os.getenv("JWT_EXPIRATION_MINUTES", 30))
        ),
        "iat": datetime.utcnow()
    }
    
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": int(os.getenv("JWT_EXPIRATION_MINUTES", 30)) * 60
    }