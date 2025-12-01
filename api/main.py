from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

from api.routes import classification, entities, traits, auth, preprocessing, graph, images, models
from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient

load_dotenv()

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

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
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

@app.get("/")
async def root():
    return {
        "name": "UHT Classification Factory",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "classification": "/api/v1/classify",
            "entities": "/api/v1/entities",
            "traits": "/api/v1/traits",
            "docs": "/docs",
            "redoc": "/redoc"
        }
    }

@app.get("/health")
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