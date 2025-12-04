"""Shared dependencies for API routes."""
from fastapi import Request
from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient


async def get_neo4j_client(request: Request) -> Neo4jClient:
    """Get the shared Neo4j client from app state."""
    return request.app.state.neo4j_client


async def get_redis_client(request: Request) -> RedisClient:
    """Get the shared Redis client from app state."""
    return request.app.state.redis_client


def get_traits(request: Request) -> list:
    """Get the cached traits from app state."""
    return request.app.state.traits
