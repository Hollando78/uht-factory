import os
import asyncio
import time
from typing import Dict, Any, List, Optional
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
import logging
import json
import re
from datetime import datetime
import httpx

logger = logging.getLogger(__name__)


@dataclass
class ModelStats:
    """Track per-model availability statistics"""
    model_id: str
    success_count: int = 0
    failure_count: int = 0
    rate_limit_count: int = 0
    last_rate_limit: Optional[float] = None
    cooldown_until: Optional[float] = None
    cooldown_level: int = 0  # 0=30s, 1=60s, 2=120s, 3=300s
    quality_score: Optional[float] = None  # 0-1 from benchmarks

    COOLDOWN_DURATIONS = [30, 60, 120, 300]  # seconds

    def record_success(self):
        """Record a successful API call"""
        self.success_count += 1
        self.cooldown_level = 0  # Reset cooldown level on success
        self.cooldown_until = None

    def record_rate_limit(self):
        """Record a rate limit (429) and set cooldown"""
        self.rate_limit_count += 1
        self.last_rate_limit = time.time()

        # Set cooldown with escalating duration
        duration = self.COOLDOWN_DURATIONS[min(self.cooldown_level, len(self.COOLDOWN_DURATIONS) - 1)]
        self.cooldown_until = time.time() + duration
        self.cooldown_level = min(self.cooldown_level + 1, len(self.COOLDOWN_DURATIONS) - 1)

        logger.warning(f"Model {self.model_id} rate-limited, cooldown for {duration}s")

    def record_failure(self):
        """Record a non-rate-limit failure"""
        self.failure_count += 1

    def is_available(self) -> bool:
        """Check if model is available (not in cooldown)"""
        if self.cooldown_until is None:
            return True
        return time.time() >= self.cooldown_until

    def availability_score(self) -> float:
        """Calculate availability score (0-1)"""
        if not self.is_available():
            return 0.0

        total = self.success_count + self.failure_count
        if total == 0:
            return 0.5  # Unknown, neutral score

        return self.success_count / total

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ModelStats':
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})

class BaseLLMClient(ABC):
    """Base class for LLM clients"""
    
    @abstractmethod
    async def evaluate_trait(
        self, 
        entity: Dict[str, Any], 
        trait: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate if a trait applies to an entity"""
        pass

class OpenAIClient(BaseLLMClient):
    """OpenAI API client for trait evaluation"""
    
    def __init__(self, api_key: str, model: str = None):
        import openai
        self.client = openai.AsyncOpenAI(api_key=api_key)
        # Use GPT-4o mini for 98% cost reduction with better quality than GPT-3.5
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    async def evaluate_trait(
        self, 
        entity: Dict[str, Any], 
        trait: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate trait using OpenAI"""
        
        system_prompt = f"""You are a specialist evaluator for the Universal Hex Taxonomy trait: "{trait['name']}".
        
Trait Definition: {trait['expanded_definition']}
Layer: {trait['layer']}

Your task is to determine if this trait applies to the given entity.
Respond with a JSON object containing:
- "applicable": true or false (binary decision)
- "confidence": 0.0 to 1.0 (your confidence in the decision)
- "justification": brief explanation (max 100 words)

Be precise and consistent. Consider the trait definition carefully."""

        user_prompt = f"""Entity: {entity['name']}
Description: {entity.get('description', 'No description provided')}
Context: {entity.get('context', 'No context provided')}

Does the trait "{trait['name']}" apply to this entity?"""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            
            return {
                "trait_bit": trait["bit"],
                "trait_name": trait["name"],
                "applicable": result.get("applicable", False),
                "confidence": float(result.get("confidence", 0.5)),
                "justification": result.get("justification", ""),
                "model_used": self.model,
                "evaluated_at": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"OpenAI evaluation error: {e}")
            return {
                "trait_bit": trait["bit"],
                "trait_name": trait["name"],
                "applicable": False,
                "confidence": 0.0,
                "justification": f"Error: {str(e)}",
                "model_used": self.model,
                "evaluated_at": datetime.utcnow().isoformat()
            }
    
    async def get_completion(self, prompt: str, temperature: float = 0.3) -> str:
        """Get a simple completion from OpenAI"""
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                response_format={"type": "json_object"}
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI completion error: {e}")
            raise e

class AnthropicClient(BaseLLMClient):
    """Anthropic Claude client for trait evaluation"""
    
    def __init__(self, api_key: str):
        import anthropic
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = "claude-3-opus-20240229"
    
    async def evaluate_trait(
        self, 
        entity: Dict[str, Any], 
        trait: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate trait using Claude"""
        
        prompt = f"""You are evaluating the Universal Hex Taxonomy trait: "{trait['name']}"

Trait Definition: {trait['expanded_definition']}
Layer: {trait['layer']}

Entity: {entity['name']}
Description: {entity.get('description', 'No description provided')}

Determine if this trait applies to the entity. Respond ONLY with valid JSON:
{{
    "applicable": true/false,
    "confidence": 0.0-1.0,
    "justification": "brief explanation"
}}"""

        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=200,
                temperature=0.3,
                messages=[{"role": "user", "content": prompt}]
            )
            
            # Extract JSON from response
            text = response.content[0].text
            # Find JSON in response
            import re
            json_match = re.search(r'\{[^}]+\}', text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
            else:
                result = {"applicable": False, "confidence": 0.0, "justification": "Parse error"}
            
            return {
                "trait_bit": trait["bit"],
                "trait_name": trait["name"],
                "applicable": result.get("applicable", False),
                "confidence": float(result.get("confidence", 0.5)),
                "justification": result.get("justification", ""),
                "model_used": self.model,
                "evaluated_at": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Anthropic evaluation error: {e}")
            return {
                "trait_bit": trait["bit"],
                "trait_name": trait["name"],
                "applicable": False,
                "confidence": 0.0,
                "justification": f"Error: {str(e)}",
                "model_used": self.model,
                "evaluated_at": datetime.utcnow().isoformat()
            }

class OllamaClient(BaseLLMClient):
    """Ollama local LLM client for trait evaluation"""
    
    def __init__(self, host: str = "http://localhost:11434"):
        import ollama
        self.client = ollama.AsyncClient(host=host)
        self.model = "llama3.2:3b"
    
    async def evaluate_trait(
        self, 
        entity: Dict[str, Any], 
        trait: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate trait using local Ollama"""
        
        prompt = f"""Evaluate if the trait "{trait['name']}" applies to "{entity['name']}".

Trait: {trait['expanded_definition']}

Entity: {entity.get('description', entity['name'])}

Respond with JSON only:
{{"applicable": true/false, "confidence": 0.0-1.0, "justification": "reason"}}"""

        try:
            response = await self.client.chat(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.3}
            )
            
            # Parse response
            text = response["message"]["content"]
            import re
            json_match = re.search(r'\{[^}]+\}', text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
            else:
                result = {"applicable": False, "confidence": 0.0, "justification": "Parse error"}
            
            return {
                "trait_bit": trait["bit"],
                "trait_name": trait["name"],
                "applicable": result.get("applicable", False),
                "confidence": float(result.get("confidence", 0.5)),
                "justification": result.get("justification", ""),
                "model_used": f"ollama/{self.model}",
                "evaluated_at": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Ollama evaluation error: {e}")
            return {
                "trait_bit": trait["bit"],
                "trait_name": trait["name"],
                "applicable": False,
                "confidence": 0.0,
                "justification": f"Error: {str(e)}",
                "model_used": f"ollama/{self.model}",
                "evaluated_at": datetime.utcnow().isoformat()
            }


class ModelSelector:
    """Smart model selection based on quality benchmarks and availability"""

    # Class-level state (shared across instances)
    _model_stats: Dict[str, ModelStats] = {}
    _quality_scores: Dict[str, float] = {}
    _last_benchmark: Optional[float] = None
    _available_models: List[Dict] = []
    _models_cache_time: Optional[float] = None

    BENCHMARK_CACHE_HOURS = 24
    MODELS_CACHE_HOURS = 1

    def __init__(self, redis_client=None):
        self.redis = redis_client

    def get_stats(self, model_id: str) -> ModelStats:
        """Get or create stats for a model"""
        if model_id not in ModelSelector._model_stats:
            ModelSelector._model_stats[model_id] = ModelStats(model_id=model_id)
        return ModelSelector._model_stats[model_id]

    def record_success(self, model_id: str):
        """Record successful API call"""
        stats = self.get_stats(model_id)
        stats.record_success()
        logger.debug(f"Model {model_id}: success recorded (total: {stats.success_count})")

    def record_rate_limit(self, model_id: str):
        """Record rate limit and set cooldown"""
        stats = self.get_stats(model_id)
        stats.record_rate_limit()

    def record_failure(self, model_id: str):
        """Record non-rate-limit failure"""
        stats = self.get_stats(model_id)
        stats.record_failure()
        logger.debug(f"Model {model_id}: failure recorded (total: {stats.failure_count})")

    def is_available(self, model_id: str) -> bool:
        """Check if model is available (not in cooldown)"""
        stats = self.get_stats(model_id)
        return stats.is_available()

    def calculate_score(self, model_id: str, context_length: int = 0) -> float:
        """Calculate combined score for model selection"""
        stats = self.get_stats(model_id)

        # Quality score (0-1) - from benchmarks or default 0.5
        quality = ModelSelector._quality_scores.get(model_id, 0.5)

        # Availability score (0-1)
        availability = stats.availability_score()

        # Context bonus (up to 0.1 for large context)
        context_bonus = min(context_length / 1000000, 0.1)  # 1M context = +0.1

        # Weighted combination: quality 60%, availability 30%, context 10%
        score = (quality * 0.6) + (availability * 0.3) + context_bonus

        return score

    def select_best_model(self, free_models: List[Dict]) -> Optional[str]:
        """Select best available model based on scores"""
        # Filter to available models (not in cooldown)
        available = [m for m in free_models if self.is_available(m["id"])]

        if not available:
            # All models in cooldown - find one with shortest wait
            logger.warning("All models in cooldown, selecting least-cooldown model")
            min_cooldown = float('inf')
            best_model = None
            for m in free_models:
                stats = self.get_stats(m["id"])
                if stats.cooldown_until and stats.cooldown_until < min_cooldown:
                    min_cooldown = stats.cooldown_until
                    best_model = m["id"]
            return best_model or free_models[0]["id"] if free_models else None

        # Score and sort available models
        scored = []
        for m in available:
            model_id = m["id"]
            context_length = m.get("context_length", 0)
            score = self.calculate_score(model_id, context_length)
            scored.append((model_id, score, m))

        scored.sort(key=lambda x: -x[1])  # Highest score first

        if scored:
            best = scored[0]
            logger.info(f"Selected model: {best[0]} (score: {best[1]:.3f})")
            return best[0]

        return None

    def set_quality_score(self, model_id: str, score: float):
        """Set quality score from benchmark"""
        ModelSelector._quality_scores[model_id] = score
        stats = self.get_stats(model_id)
        stats.quality_score = score

    def get_all_stats(self) -> Dict[str, Dict]:
        """Get all model stats for API response"""
        return {
            model_id: {
                **stats.to_dict(),
                "quality_score": ModelSelector._quality_scores.get(model_id),
                "combined_score": self.calculate_score(
                    model_id,
                    next((m.get("context_length", 0) for m in ModelSelector._available_models if m["id"] == model_id), 0)
                )
            }
            for model_id, stats in ModelSelector._model_stats.items()
        }

    async def persist_to_redis(self):
        """Save stats to Redis for persistence"""
        if not self.redis:
            return

        try:
            stats_data = {k: v.to_dict() for k, v in ModelSelector._model_stats.items()}
            await self.redis.set("openrouter:model_stats", json.dumps(stats_data), ex=86400)

            await self.redis.set("openrouter:quality_scores", json.dumps(ModelSelector._quality_scores), ex=86400)

            if ModelSelector._last_benchmark:
                await self.redis.set("openrouter:last_benchmark", str(ModelSelector._last_benchmark), ex=86400)

            logger.debug("Model stats persisted to Redis")
        except Exception as e:
            logger.error(f"Failed to persist model stats to Redis: {e}")

    async def load_from_redis(self):
        """Load stats from Redis"""
        if not self.redis:
            return

        try:
            stats_json = await self.redis.get("openrouter:model_stats")
            if stats_json:
                stats_data = json.loads(stats_json)
                for model_id, data in stats_data.items():
                    ModelSelector._model_stats[model_id] = ModelStats.from_dict(data)

            scores_json = await self.redis.get("openrouter:quality_scores")
            if scores_json:
                ModelSelector._quality_scores = json.loads(scores_json)

            benchmark_time = await self.redis.get("openrouter:last_benchmark")
            if benchmark_time:
                ModelSelector._last_benchmark = float(benchmark_time)

            logger.info(f"Loaded {len(ModelSelector._model_stats)} model stats from Redis")
        except Exception as e:
            logger.error(f"Failed to load model stats from Redis: {e}")


class OpenRouterClient(BaseLLMClient):
    """OpenRouter API client with smart free model selection"""

    BASE_URL = "https://openrouter.ai/api/v1"

    # Class-level cache for model list (shared across instances)
    _available_free_models: List[Dict] = []
    _models_cache_time: Optional[float] = None

    # Shared model selector instance
    _model_selector: Optional[ModelSelector] = None

    def __init__(self, redis_client=None):
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY not set")
        self.http_client = httpx.AsyncClient(timeout=60.0)

        # Initialize shared model selector
        if OpenRouterClient._model_selector is None:
            OpenRouterClient._model_selector = ModelSelector(redis_client)

    @property
    def selector(self) -> ModelSelector:
        return OpenRouterClient._model_selector

    async def _fetch_free_models(self) -> List[Dict]:
        """Fetch and cache available free models (1 hour cache)"""
        # Check cache
        if OpenRouterClient._available_free_models and OpenRouterClient._models_cache_time:
            if time.time() - OpenRouterClient._models_cache_time < 3600:
                return OpenRouterClient._available_free_models

        logger.info("Fetching available models from OpenRouter...")

        try:
            response = await self.http_client.get(
                f"{self.BASE_URL}/models",
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            response.raise_for_status()
            models = response.json().get("data", [])

            # Filter free models (pricing.prompt == "0" and pricing.completion == "0")
            free_models = []
            for m in models:
                pricing = m.get("pricing", {})
                prompt_price = pricing.get("prompt", "1")
                completion_price = pricing.get("completion", "1")

                # Check if both are "0" or 0
                if str(prompt_price) == "0" and str(completion_price) == "0":
                    free_models.append(m)

            if not free_models:
                raise RuntimeError("No free models available on OpenRouter.")

            OpenRouterClient._available_free_models = free_models
            OpenRouterClient._models_cache_time = time.time()
            ModelSelector._available_models = free_models

            logger.info(f"Found {len(free_models)} free models")
            return free_models

        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch models from OpenRouter: {e}")
            raise RuntimeError(f"Failed to fetch models from OpenRouter: {e}")

    async def get_best_free_model(self) -> str:
        """Select the best available free model using smart scoring."""
        # Check for forced model override
        forced_model = os.getenv("OPENROUTER_FORCE_MODEL")
        if forced_model:
            logger.info(f"Using forced model: {forced_model}")
            return forced_model

        free_models = await self._fetch_free_models()

        # Use ModelSelector for smart selection
        selected = self.selector.select_best_model(free_models)

        if not selected:
            # Fallback to first available
            selected = free_models[0]["id"] if free_models else None

        if not selected:
            raise RuntimeError("No free models available")

        return selected

    async def evaluate_trait(
        self,
        entity: Dict[str, Any],
        trait: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate trait using OpenRouter free model"""

        model = await self.get_best_free_model()

        system_prompt = f"""You are a specialist evaluator for the Universal Hex Taxonomy trait: "{trait['name']}".

Trait Definition: {trait['expanded_definition']}
Layer: {trait['layer']}

Your task is to determine if this trait applies to the given entity.
Respond with a JSON object containing:
- "applicable": true or false (binary decision)
- "confidence": 0.0 to 1.0 (your confidence in the decision)
- "justification": brief explanation (max 100 words)

Be precise and consistent. Consider the trait definition carefully.
IMPORTANT: Respond ONLY with valid JSON, no other text."""

        user_prompt = f"""Entity: {entity['name']}
Description: {entity.get('description', 'No description provided')}
Context: {entity.get('context', 'No context provided')}

Does the trait "{trait['name']}" apply to this entity?"""

        # Retry logic with model rotation on rate limits
        max_retries = 3
        retry_delay = 2.0
        last_error = None
        result_text = None

        for attempt in range(max_retries):
            try:
                response = await self.http_client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "HTTP-Referer": "https://uht-factory.local",
                        "X-Title": "UHT Classification Factory"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.3
                    },
                    timeout=30.0
                )

                if response.status_code == 429:
                    # Rate limited - record and try different model
                    self.selector.record_rate_limit(model)
                    logger.warning(f"Model {model} rate-limited, selecting alternative...")

                    # Try to get a different model
                    new_model = await self.get_best_free_model()
                    if new_model != model:
                        model = new_model
                        logger.info(f"Switched to model: {model}")
                    else:
                        # Same model selected (no alternatives) - wait
                        wait_time = retry_delay * (2 ** attempt)
                        await asyncio.sleep(wait_time)
                    continue

                response.raise_for_status()
                result_text = response.json()["choices"][0]["message"]["content"]

                # Record success
                self.selector.record_success(model)
                break

            except Exception as e:
                last_error = e
                if "429" in str(e):
                    self.selector.record_rate_limit(model)
                    # Try different model
                    model = await self.get_best_free_model()
                    if attempt < max_retries - 1:
                        continue
                else:
                    self.selector.record_failure(model)
                raise
        else:
            raise last_error or Exception("Max retries exceeded")

        try:
            # Parse JSON from response (handle potential markdown wrapping)
            json_match = re.search(r'\{[^}]+\}', result_text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
            else:
                result = {"applicable": False, "confidence": 0.0, "justification": "Parse error"}

            return {
                "trait_bit": trait["bit"],
                "trait_name": trait["name"],
                "applicable": result.get("applicable", False),
                "confidence": float(result.get("confidence", 0.5)),
                "justification": result.get("justification", ""),
                "model_used": model,
                "evaluated_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"OpenRouter JSON parse error: {e}")
            return {
                "trait_bit": trait["bit"],
                "trait_name": trait["name"],
                "applicable": False,
                "confidence": 0.0,
                "justification": f"Parse error: {str(e)}",
                "model_used": model,
                "evaluated_at": datetime.utcnow().isoformat()
            }

    async def get_completion(self, prompt: str, temperature: float = 0.3) -> str:
        """Get a simple completion from OpenRouter free model"""
        model = await self.get_best_free_model()

        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                response = await self.http_client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "HTTP-Referer": "https://uht-factory.local",
                        "X-Title": "UHT Classification Factory"
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": temperature
                    },
                    timeout=30.0
                )

                if response.status_code == 429:
                    self.selector.record_rate_limit(model)
                    model = await self.get_best_free_model()
                    continue

                response.raise_for_status()
                self.selector.record_success(model)
                return response.json()["choices"][0]["message"]["content"]

            except Exception as e:
                last_error = e
                if "429" in str(e):
                    self.selector.record_rate_limit(model)
                    model = await self.get_best_free_model()
                    continue
                self.selector.record_failure(model)
                raise

        raise last_error or Exception("Max retries exceeded")

    @classmethod
    def get_current_model(cls) -> Optional[str]:
        """Get the currently selected model (for display in UI)"""
        return cls._selected_model

    @classmethod
    def get_available_free_models(cls) -> List[str]:
        """Get list of available free model IDs"""
        return [m["id"] for m in cls._available_free_models]


class LLMFactory:
    """Factory for creating LLM clients"""

    @staticmethod
    def create_client(provider: str) -> BaseLLMClient:
        """Create appropriate LLM client based on provider"""
        
        if provider == "openai":
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not set")
            return OpenAIClient(api_key)
        
        elif provider == "anthropic":
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not set")
            return AnthropicClient(api_key)
        
        elif provider == "ollama":
            host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
            return OllamaClient(host)

        elif provider == "openrouter":
            return OpenRouterClient()

        else:
            raise ValueError(f"Unknown LLM provider: {provider}. Supported: openai, anthropic, ollama, openrouter")