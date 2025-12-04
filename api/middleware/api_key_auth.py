"""
API Key Authentication Middleware for UHT Factory.

Provides secure API key validation for LLM-calling endpoints.
"""

from fastapi import HTTPException, Security, Depends, Request
from fastapi.security import APIKeyHeader
from typing import Optional, Dict, Any
import hashlib
import secrets
import os
from datetime import datetime
from functools import lru_cache

# API Key header configuration
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)

# Scopes for different levels of access
class Scopes:
    READ = "read"              # Read entities, traits, stats
    CLASSIFY = "classify"      # Run classifications (LLM calls)
    PREPROCESS = "preprocess"  # Run preprocessing (LLM calls)
    IMAGES = "images"          # Generate images (LLM/API calls)
    EMBEDDINGS = "embeddings"  # Generate embeddings (OpenAI API calls)
    ADMIN = "admin"            # Manage API keys, full access


def hash_api_key(key: str) -> str:
    """Hash an API key for secure storage."""
    return hashlib.sha256(key.encode()).hexdigest()


def generate_api_key(prefix: str = "uht") -> tuple[str, str]:
    """
    Generate a new API key and its hash.
    Returns (plaintext_key, hashed_key)
    """
    # Generate 32 random bytes, encode as hex
    random_part = secrets.token_hex(24)
    key = f"{prefix}_{random_part}"
    hashed = hash_api_key(key)
    return key, hashed


class APIKeyManager:
    """Manages API key validation and tracking."""

    def __init__(self, neo4j_client=None, redis_client=None):
        self.neo4j = neo4j_client
        self.redis = redis_client
        self._initialized = False

    async def initialize(self, neo4j_client, redis_client):
        """Initialize with database clients."""
        self.neo4j = neo4j_client
        self.redis = redis_client
        await self._create_constraints()
        self._initialized = True

    async def _create_constraints(self):
        """Create database constraints for API keys."""
        if not self.neo4j:
            return

        constraints = [
            "CREATE CONSTRAINT apikey_id IF NOT EXISTS FOR (k:APIKey) REQUIRE k.key_id IS UNIQUE",
            "CREATE INDEX apikey_hash IF NOT EXISTS FOR (k:APIKey) ON (k.hashed_key)",
            "CREATE INDEX apikey_active IF NOT EXISTS FOR (k:APIKey) ON (k.is_active)"
        ]

        async with self.neo4j.driver.session() as session:
            for constraint in constraints:
                try:
                    await session.run(constraint)
                except Exception:
                    pass  # Constraint may already exist

    async def create_api_key(
        self,
        name: str,
        scopes: list[str] = None,
        rate_limit: int = 1000,
        expires_days: int = None
    ) -> Dict[str, Any]:
        """
        Create a new API key.

        Returns the plaintext key (only shown once) and key metadata.
        """
        import uuid
        from datetime import timedelta

        key_id = str(uuid.uuid4())
        plaintext_key, hashed_key = generate_api_key()

        # Default scopes if not specified
        if scopes is None:
            scopes = [Scopes.READ, Scopes.CLASSIFY, Scopes.PREPROCESS]

        expires_at = None
        if expires_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_days)

        query = """
        CREATE (k:APIKey {
            key_id: $key_id,
            hashed_key: $hashed_key,
            name: $name,
            key_prefix: $key_prefix,
            scopes: $scopes,
            rate_limit: $rate_limit,
            created_at: datetime(),
            expires_at: $expires_at,
            is_active: true,
            used_count: 0,
            last_used: null
        })
        RETURN k
        """

        async with self.neo4j.driver.session() as session:
            result = await session.run(
                query,
                key_id=key_id,
                hashed_key=hashed_key,
                name=name,
                key_prefix=plaintext_key[:12] + "...",
                scopes=scopes,
                rate_limit=rate_limit,
                expires_at=expires_at.isoformat() if expires_at else None
            )
            record = await result.single()

        return {
            "key_id": key_id,
            "api_key": plaintext_key,  # Only returned once!
            "name": name,
            "key_prefix": plaintext_key[:12] + "...",
            "scopes": scopes,
            "rate_limit": rate_limit,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "message": "Store this API key securely - it will not be shown again!"
        }

    async def validate_api_key(self, api_key: str) -> Optional[Dict[str, Any]]:
        """
        Validate an API key and return its metadata if valid.
        Returns None if invalid.
        """
        if not api_key or not self.neo4j:
            return None

        hashed = hash_api_key(api_key)

        query = """
        MATCH (k:APIKey {hashed_key: $hashed_key, is_active: true})
        WHERE k.expires_at IS NULL OR datetime(k.expires_at) > datetime()
        SET k.last_used = datetime(),
            k.used_count = k.used_count + 1
        RETURN k
        """

        async with self.neo4j.driver.session() as session:
            result = await session.run(query, hashed_key=hashed)
            record = await result.single()

            if record:
                key_data = dict(record["k"])
                return {
                    "key_id": key_data["key_id"],
                    "name": key_data["name"],
                    "scopes": key_data["scopes"],
                    "rate_limit": key_data["rate_limit"],
                    "used_count": key_data["used_count"]
                }

        return None

    async def check_rate_limit(self, key_id: str, rate_limit: int) -> bool:
        """
        Check if the API key is within its rate limit.
        Uses Redis for rate limiting with a sliding window.
        Returns True if allowed, False if rate limited.
        """
        if not self.redis:
            return True  # No rate limiting without Redis

        import time
        window_key = f"ratelimit:{key_id}:{int(time.time()) // 3600}"  # Hourly window

        try:
            current = await self.redis.client.incr(window_key)
            if current == 1:
                # Set expiry on new keys
                await self.redis.client.expire(window_key, 3600)

            return current <= rate_limit
        except Exception:
            return True  # Allow on Redis errors

    async def revoke_api_key(self, key_id: str) -> bool:
        """Revoke an API key."""
        query = """
        MATCH (k:APIKey {key_id: $key_id})
        SET k.is_active = false,
            k.revoked_at = datetime()
        RETURN k
        """

        async with self.neo4j.driver.session() as session:
            result = await session.run(query, key_id=key_id)
            record = await result.single()
            return record is not None

    async def list_api_keys(self) -> list[Dict[str, Any]]:
        """List all API keys (without hashes)."""
        query = """
        MATCH (k:APIKey)
        RETURN k
        ORDER BY k.created_at DESC
        """

        keys = []
        async with self.neo4j.driver.session() as session:
            result = await session.run(query)
            async for record in result:
                key_data = dict(record["k"])
                keys.append({
                    "key_id": key_data["key_id"],
                    "name": key_data["name"],
                    "key_prefix": key_data["key_prefix"],
                    "scopes": key_data["scopes"],
                    "rate_limit": key_data["rate_limit"],
                    "is_active": key_data["is_active"],
                    "created_at": str(key_data.get("created_at", "")),
                    "last_used": str(key_data.get("last_used", "")),
                    "used_count": key_data.get("used_count", 0)
                })

        return keys


# Global API key manager instance
api_key_manager = APIKeyManager()


async def get_api_key_manager() -> APIKeyManager:
    """Dependency to get the API key manager."""
    return api_key_manager


async def verify_api_key(
    api_key: str = Security(API_KEY_HEADER),
    request: Request = None
) -> Dict[str, Any]:
    """
    Dependency that verifies API key and returns key metadata.
    Raises HTTPException if invalid.
    """
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="API key required. Include 'X-API-Key' header.",
            headers={"WWW-Authenticate": "ApiKey"}
        )

    # Validate the key
    key_data = await api_key_manager.validate_api_key(api_key)

    if not key_data:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired API key",
            headers={"WWW-Authenticate": "ApiKey"}
        )

    # Check rate limit
    if not await api_key_manager.check_rate_limit(key_data["key_id"], key_data["rate_limit"]):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Limit: {key_data['rate_limit']} requests/hour"
        )

    return key_data


def require_scope(required_scope: str):
    """
    Factory function to create a dependency that checks for a specific scope.

    Usage:
        @router.post("/classify")
        async def classify(key_data: dict = Depends(require_scope(Scopes.CLASSIFY))):
            ...
    """
    async def scope_checker(
        key_data: Dict[str, Any] = Depends(verify_api_key)
    ) -> Dict[str, Any]:
        if Scopes.ADMIN in key_data.get("scopes", []):
            return key_data  # Admin has all scopes

        if required_scope not in key_data.get("scopes", []):
            raise HTTPException(
                status_code=403,
                detail=f"API key does not have required scope: {required_scope}"
            )
        return key_data

    return scope_checker


# Convenience dependencies for common scopes
require_classify = require_scope(Scopes.CLASSIFY)
require_preprocess = require_scope(Scopes.PREPROCESS)
require_images = require_scope(Scopes.IMAGES)
require_embeddings = require_scope(Scopes.EMBEDDINGS)
require_admin = require_scope(Scopes.ADMIN)
