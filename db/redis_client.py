import redis.asyncio as redis
from typing import Optional, Any, Dict
import json
import logging
from datetime import timedelta

logger = logging.getLogger(__name__)

class RedisClient:
    """Redis client for caching and job queue"""
    
    def __init__(self, url: str):
        self.url = url
        self.client: Optional[redis.Redis] = None
        self.default_ttl = 3600  # 1 hour default cache
    
    async def connect(self):
        """Initialize Redis connection"""
        try:
            self.client = redis.from_url(self.url, decode_responses=True)
            await self.ping()
            logger.info("Redis connection established")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise
    
    async def close(self):
        """Close Redis connection"""
        if self.client:
            await self.client.close()
    
    async def ping(self) -> bool:
        """Check Redis connection"""
        try:
            await self.client.ping()
            return True
        except:
            return False
    
    async def get_cached_classification(self, entity_name: str) -> Optional[Dict[str, Any]]:
        """Get cached classification for an entity"""
        key = f"classification:{entity_name.lower()}"
        try:
            data = await self.client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Cache get error: {e}")
        return None
    
    async def cache_classification(
        self, 
        entity_name: str, 
        classification: Dict[str, Any],
        ttl: Optional[int] = None
    ):
        """Cache a classification result"""
        key = f"classification:{entity_name.lower()}"
        ttl = ttl or self.default_ttl
        try:
            await self.client.setex(
                key,
                timedelta(seconds=ttl),
                json.dumps(classification)
            )
        except Exception as e:
            logger.error(f"Cache set error: {e}")
    
    async def get_entity_by_uuid(self, uuid: str) -> Optional[Dict[str, Any]]:
        """Get entity by UUID from cache"""
        key = f"entity:{uuid}"
        try:
            data = await self.client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.error(f"Cache get error: {e}")
        return None
    
    async def cache_entity(self, uuid: str, entity: Dict[str, Any], ttl: Optional[int] = None):
        """Cache an entity"""
        key = f"entity:{uuid}"
        ttl = ttl or self.default_ttl
        try:
            await self.client.setex(
                key,
                timedelta(seconds=ttl),
                json.dumps(entity)
            )
        except Exception as e:
            logger.error(f"Cache set error: {e}")
    
    async def add_to_queue(self, queue_name: str, job_data: Dict[str, Any]):
        """Add job to processing queue"""
        try:
            await self.client.lpush(queue_name, json.dumps(job_data))
        except Exception as e:
            logger.error(f"Queue push error: {e}")
    
    async def get_from_queue(self, queue_name: str, timeout: int = 1) -> Optional[Dict[str, Any]]:
        """Get job from processing queue"""
        try:
            result = await self.client.brpop(queue_name, timeout=timeout)
            if result:
                return json.loads(result[1])
        except Exception as e:
            logger.error(f"Queue pop error: {e}")
        return None
    
    async def increment_counter(self, counter_name: str) -> int:
        """Increment a counter"""
        try:
            return await self.client.incr(counter_name)
        except Exception as e:
            logger.error(f"Counter increment error: {e}")
            return 0
    
    async def get_metrics(self) -> Dict[str, Any]:
        """Get cache metrics"""
        try:
            info = await self.client.info("stats")
            return {
                "total_connections": info.get("total_connections_received", 0),
                "commands_processed": info.get("total_commands_processed", 0),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "hit_rate": (
                    info.get("keyspace_hits", 0) / 
                    max(1, info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0))
                )
            }
        except Exception as e:
            logger.error(f"Metrics error: {e}")
            return {}