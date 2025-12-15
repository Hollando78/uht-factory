"""
Embedding generation client for UHT Factory.

Uses OpenAI text-embedding-3-small (1536 dimensions) to generate
semantic embeddings for entities with rich context including
name, description, and applicable trait names.
"""

import os
import asyncio
import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime
import httpx

logger = logging.getLogger(__name__)

# OpenAI embedding model configuration
EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSIONS = 1536
COST_PER_1M_TOKENS = 0.02  # $0.02 per 1M tokens for text-embedding-3-small


def build_embedding_text(
    entity_name: str,
    description: str = ""
) -> str:
    """
    Build the text to embed for an entity.

    Pure semantic embedding using only name and description.
    Traits are intentionally excluded to avoid artificial correlation
    with UHT similarity - we want embeddings to capture genuine
    semantic meaning, independent of structural classification.

    Example output:
        Hammer: A handheld tool with a heavy head attached to a handle,
        used for driving nails, shaping materials, or breaking objects.
    """
    if description:
        return f"{entity_name}: {description}"
    else:
        return entity_name


def estimate_tokens(text: str) -> int:
    """Rough token estimation (~4 chars per token for English)"""
    return len(text) // 4


class OpenAIEmbeddingClient:
    """OpenAI embedding client using text-embedding-3-small"""

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = "https://api.openai.com/v1"
        self.model = EMBEDDING_MODEL
        self.dimensions = EMBEDDING_DIMENSIONS

        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not found in environment")

    async def generate_embedding(
        self,
        text: str,
        entity_name: str = ""
    ) -> Dict[str, Any]:
        """
        Generate embedding for a single text input.

        Args:
            text: The text to embed (pre-built with build_embedding_text)
            entity_name: Optional name for logging

        Returns:
            Dict with embedding vector, cost, and metadata
        """
        try:
            start_time = datetime.now()

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "input": text,
                        "encoding_format": "float"
                    }
                )

            generation_time_ms = (datetime.now() - start_time).total_seconds() * 1000

            if response.status_code == 429:
                raise RateLimitError("OpenAI rate limit exceeded")

            if response.status_code != 200:
                error_detail = response.text if response.text else f"HTTP {response.status_code}"
                raise EmbeddingError(f"OpenAI API error: {error_detail}")

            result = response.json()

            # Extract embedding and usage
            embedding = result["data"][0]["embedding"]
            tokens_used = result.get("usage", {}).get("total_tokens", estimate_tokens(text))
            cost_usd = (tokens_used / 1_000_000) * COST_PER_1M_TOKENS

            logger.info(f"Generated embedding for '{entity_name or 'entity'}': {len(embedding)} dims, {tokens_used} tokens, ${cost_usd:.6f}")

            return {
                "success": True,
                "embedding": embedding,
                "dimension": len(embedding),
                "model_used": self.model,
                "tokens_used": tokens_used,
                "cost_usd": cost_usd,
                "generation_time_ms": round(generation_time_ms, 1),
                "created_at": datetime.utcnow().isoformat()
            }

        except RateLimitError:
            raise
        except Exception as e:
            logger.error(f"Embedding generation failed for '{entity_name}': {e}")
            return {
                "success": False,
                "error": str(e),
                "embedding": None,
                "dimension": 0,
                "model_used": self.model,
                "tokens_used": 0,
                "cost_usd": 0,
                "generation_time_ms": 0,
                "created_at": datetime.utcnow().isoformat()
            }

    async def generate_batch_embeddings(
        self,
        texts: List[str],
        max_batch_size: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Generate embeddings for multiple texts using OpenAI batch API.

        OpenAI supports up to 2048 inputs per request, but we limit to
        max_batch_size for memory and reliability.

        Args:
            texts: List of texts to embed
            max_batch_size: Maximum texts per API call

        Returns:
            List of embedding results (same order as input)
        """
        all_results = []

        for i in range(0, len(texts), max_batch_size):
            batch = texts[i:i + max_batch_size]

            try:
                start_time = datetime.now()

                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(
                        f"{self.base_url}/embeddings",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": self.model,
                            "input": batch,
                            "encoding_format": "float"
                        }
                    )

                generation_time_ms = (datetime.now() - start_time).total_seconds() * 1000

                if response.status_code == 429:
                    raise RateLimitError("OpenAI rate limit exceeded")

                if response.status_code != 200:
                    error_detail = response.text if response.text else f"HTTP {response.status_code}"
                    raise EmbeddingError(f"OpenAI API error: {error_detail}")

                result = response.json()
                tokens_used = result.get("usage", {}).get("total_tokens", 0)
                cost_usd = (tokens_used / 1_000_000) * COST_PER_1M_TOKENS

                # Extract embeddings in order
                embeddings_data = sorted(result["data"], key=lambda x: x["index"])

                for emb_data in embeddings_data:
                    all_results.append({
                        "success": True,
                        "embedding": emb_data["embedding"],
                        "dimension": len(emb_data["embedding"]),
                        "model_used": self.model,
                        "tokens_used": tokens_used // len(batch),  # Approximate per-item
                        "cost_usd": cost_usd / len(batch),
                        "generation_time_ms": generation_time_ms / len(batch),
                        "created_at": datetime.utcnow().isoformat()
                    })

                logger.info(f"Batch {i // max_batch_size + 1}: Generated {len(batch)} embeddings, {tokens_used} tokens, ${cost_usd:.6f}")

            except Exception as e:
                logger.error(f"Batch embedding failed at index {i}: {e}")
                # Add failure results for this batch
                for _ in batch:
                    all_results.append({
                        "success": False,
                        "error": str(e),
                        "embedding": None,
                        "dimension": 0,
                        "model_used": self.model,
                        "tokens_used": 0,
                        "cost_usd": 0,
                        "generation_time_ms": 0,
                        "created_at": datetime.utcnow().isoformat()
                    })

        return all_results


class EmbeddingOrchestrator:
    """
    Orchestrates embedding generation for entities.

    Follows the same pattern as ImageGenerationOrchestrator.
    """

    def __init__(self, redis_client=None):
        self.client = OpenAIEmbeddingClient()
        self.redis_client = redis_client
        self.auto_generate = os.getenv("EMBEDDING_AUTO_GENERATE", "optional")

    async def generate_entity_embedding(
        self,
        entity: Dict[str, Any],
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Generate embedding for an entity.

        Args:
            entity: Entity dict with uuid, name, description, and optionally traits
            use_cache: Whether to check/use Redis cache

        Returns:
            Embedding result with success status
        """
        entity_uuid = entity.get("uuid")
        entity_name = entity.get("name", "Unknown")
        description = entity.get("description", "")

        # Check cache first
        if use_cache and self.redis_client and entity_uuid:
            cached = await self._get_cached_embedding(entity_uuid)
            if cached:
                logger.info(f"Using cached embedding for '{entity_name}'")
                return {
                    "success": True,
                    "embedding": cached,
                    "dimension": len(cached),
                    "model_used": self.client.model,
                    "cached": True,
                    "entity_uuid": entity_uuid
                }

        # Build embedding text with rich context
        text = build_embedding_text(entity_name, description)

        # Generate embedding
        result = await self.client.generate_embedding(text, entity_name)

        if result["success"] and entity_uuid:
            result["entity_uuid"] = entity_uuid

            # Cache the result
            if self.redis_client:
                await self._cache_embedding(entity_uuid, result["embedding"])

        return result

    async def generate_batch_entity_embeddings(
        self,
        entities: List[Dict[str, Any]],
        max_concurrent: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Generate embeddings for multiple entities.

        Uses OpenAI batch API for efficiency.

        Args:
            entities: List of entity dicts
            max_concurrent: Max concurrent API calls (for rate limiting)

        Returns:
            List of embedding results (same order as input)
        """
        # Build texts for all entities (name + description only, no traits)
        texts = []
        for entity in entities:
            text = build_embedding_text(
                entity.get("name", "Unknown"),
                entity.get("description", "")
            )
            texts.append(text)

        # Generate embeddings in batch
        results = await self.client.generate_batch_embeddings(texts)

        # Add entity UUIDs and cache results
        for i, (entity, result) in enumerate(zip(entities, results)):
            entity_uuid = entity.get("uuid")
            if entity_uuid:
                result["entity_uuid"] = entity_uuid

                if result["success"] and self.redis_client:
                    await self._cache_embedding(entity_uuid, result["embedding"])

        return results

    async def _get_cached_embedding(self, entity_uuid: str) -> Optional[List[float]]:
        """Get embedding from Redis cache"""
        try:
            key = f"embedding:{entity_uuid}"
            data = await self.redis_client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warning(f"Cache read failed: {e}")
        return None

    async def _cache_embedding(self, entity_uuid: str, embedding: List[float], ttl: int = 86400):
        """Cache embedding in Redis (24 hour default TTL)"""
        try:
            key = f"embedding:{entity_uuid}"
            await self.redis_client.setex(key, ttl, json.dumps(embedding))
        except Exception as e:
            logger.warning(f"Cache write failed: {e}")

    def should_auto_generate(self, request_flag: Optional[bool] = None) -> bool:
        """
        Determine if embedding should be auto-generated based on config.

        Args:
            request_flag: The generate_embedding flag from the request

        Returns:
            True if embedding should be generated
        """
        if self.auto_generate == "always":
            return True
        elif self.auto_generate == "never":
            return False
        else:  # "optional"
            return request_flag is True


# Custom exceptions
class EmbeddingError(Exception):
    """Base exception for embedding operations"""
    pass


class RateLimitError(EmbeddingError):
    """Rate limit exceeded"""
    pass


# Comparison utilities
def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors"""
    import math

    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = math.sqrt(sum(a * a for a in vec1))
    norm2 = math.sqrt(sum(b * b for b in vec2))

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return dot_product / (norm1 * norm2)


def euclidean_distance(vec1: List[float], vec2: List[float]) -> float:
    """Calculate Euclidean distance between two vectors"""
    import math
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(vec1, vec2)))


def uht_binary_to_vector(binary_representation: str) -> List[float]:
    """Convert UHT 32-bit binary string to 32-dimensional float vector"""
    return [float(bit) for bit in binary_representation]


def calculate_comparison_metrics(
    entity_uuid: str,
    uht_binary: str,
    embedding: List[float]
) -> Dict[str, Any]:
    """
    Calculate comparison metrics between UHT code and embedding.

    Returns metrics comparing the 32-dim UHT vector with the embedding.
    """
    uht_vector = uht_binary_to_vector(uht_binary)

    # For direct comparison, we need to reduce embedding dimensions
    # Simple approach: sample 32 evenly-spaced dimensions
    step = len(embedding) // 32
    embedding_reduced = [embedding[i * step] for i in range(32)]

    # Normalize both vectors for fair comparison
    import math
    uht_norm = math.sqrt(sum(x * x for x in uht_vector)) or 1
    emb_norm = math.sqrt(sum(x * x for x in embedding_reduced)) or 1

    uht_normalized = [x / uht_norm for x in uht_vector]
    emb_normalized = [x / emb_norm for x in embedding_reduced]

    # Calculate metrics
    cos_sim = cosine_similarity(uht_normalized, emb_normalized)
    euc_dist = euclidean_distance(uht_normalized, emb_normalized)

    # Correlation score (Pearson)
    n = len(uht_normalized)
    mean_uht = sum(uht_normalized) / n
    mean_emb = sum(emb_normalized) / n

    numerator = sum((u - mean_uht) * (e - mean_emb) for u, e in zip(uht_normalized, emb_normalized))
    denom_uht = math.sqrt(sum((u - mean_uht) ** 2 for u in uht_normalized))
    denom_emb = math.sqrt(sum((e - mean_emb) ** 2 for e in emb_normalized))

    correlation = numerator / (denom_uht * denom_emb) if (denom_uht * denom_emb) > 0 else 0

    # Outlier score - how far is this embedding from average magnitude
    avg_magnitude = sum(abs(x) for x in embedding) / len(embedding)
    expected_avg = 0.02  # Typical for normalized embeddings
    outlier_score = min(1.0, abs(avg_magnitude - expected_avg) / expected_avg)

    return {
        "entity_uuid": entity_uuid,
        "uht_vector": uht_vector,
        "embedding_vector": embedding,  # Full 1536-dim
        "cosine_similarity": round(cos_sim, 4),
        "euclidean_distance": round(euc_dist, 4),
        "correlation_score": round(correlation, 4),
        "outlier_score": round(outlier_score, 4)
    }
