import os
from dotenv import load_dotenv

# Load .env BEFORE any other imports that depend on environment variables
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from api.routes import classification, entities, traits, auth, preprocessing, graph, images, models, embeddings
from api.middleware.api_key_auth import api_key_manager
from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient

# Initialize clients
neo4j_client = Neo4jClient(
    uri=os.getenv("NEO4J_URI"),
    user=os.getenv("NEO4J_USER"),
    password=os.getenv("NEO4J_PASSWORD")
)
redis_client = RedisClient(url=os.getenv("REDIS_URL"))

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await neo4j_client.connect()
    await redis_client.connect()

    # Store clients in app.state for shared access across routes
    app.state.neo4j_client = neo4j_client
    app.state.redis_client = redis_client

    # Load and cache traits JSON at startup
    import json
    traits_path = "/root/project/uht-github/canonical_traits/traits_v2.json"
    try:
        with open(traits_path, "r") as f:
            app.state.traits = json.load(f)
    except Exception as e:
        print(f"Warning: Could not load traits: {e}")
        app.state.traits = []

    # Initialize API key manager with database clients
    await api_key_manager.initialize(neo4j_client, redis_client)

    yield
    # Shutdown
    await neo4j_client.close()
    await redis_client.close()

# Create FastAPI app
app = FastAPI(
    title=os.getenv("API_TITLE", "UHT Classification Factory"),
    description=os.getenv("API_DESCRIPTION"),
    version=os.getenv("API_VERSION", "v1"),
    lifespan=lifespan
)

# Configure CORS - restricted to specific origins for production
ALLOWED_ORIGINS = [
    "https://factory.universalhex.org",
    "http://localhost:5177",
    "http://127.0.0.1:5177",
    "http://localhost:3000",
]

# Allow additional origins from environment
extra_origins = os.getenv("CORS_ORIGINS")
if extra_origins:
    import json
    try:
        ALLOWED_ORIGINS.extend(json.loads(extra_origins))
    except json.JSONDecodeError:
        pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(classification.router, prefix="/api/v1/classify", tags=["Classification"])
app.include_router(entities.router, prefix="/api/v1/entities", tags=["Entities"])
app.include_router(traits.router, prefix="/api/v1/traits", tags=["Traits"])
app.include_router(preprocessing.router, prefix="/api/v1/preprocess", tags=["Preprocessing"])
app.include_router(graph.router, prefix="/api/v1/graph", tags=["Graph"])
app.include_router(images.router, prefix="/api/v1/images", tags=["Images"])
app.include_router(models.router, prefix="/api/v1/models", tags=["Models"])
app.include_router(embeddings.router, prefix="/api/v1/embeddings", tags=["Embeddings"])

@app.get("/")
async def root():
    return {
        "name": "UHT Classification Factory",
        "version": "1.0.0",
        "status": "operational",
        "auth_required": "API key required for LLM endpoints (classify, preprocess, images)",
        "endpoints": {
            "classification": "/api/v1/classify",
            "entities": "/api/v1/entities",
            "traits": "/api/v1/traits",
            "auth": "/api/v1/auth",
            "docs": "/docs",
            "redoc": "/redoc"
        }
    }

@app.get("/api/v1/health")
async def health_check():
    """Health check endpoint"""
    checks = {
        "api": "healthy",
        "neo4j": "unknown",
        "redis": "unknown"
    }

    try:
        # Check Neo4j connection
        if await neo4j_client.verify_connection():
            checks["neo4j"] = "healthy"
    except:
        checks["neo4j"] = "unhealthy"

    try:
        # Check Redis connection
        if await redis_client.ping():
            checks["redis"] = "healthy"
    except:
        checks["redis"] = "unhealthy"

    overall_health = all(v == "healthy" for v in checks.values())

    return {
        "status": "healthy" if overall_health else "degraded",
        "checks": checks
    }

@app.get("/health")
async def health_check_root():
    """Root health check endpoint (alias)"""
    return await health_check()
