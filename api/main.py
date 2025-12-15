import os
import logging
import re
from dotenv import load_dotenv

# Load .env BEFORE any other imports that depend on environment variables
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from contextlib import asynccontextmanager

from api.routes import classification, entities, traits, auth, preprocessing, graph, images, models, embeddings, users, collections, seo, admin, hex_calc, explorer
from api.middleware.api_key_auth import api_key_manager
from api.middleware.meta_injection import MetaTagInjectionMiddleware
from db.neo4j_client import Neo4jClient
from db.redis_client import RedisClient

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

# Add meta tag injection middleware (must be after CORS)
app.add_middleware(MetaTagInjectionMiddleware)

# Mount static files (API static assets like images)
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
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(collections.router, prefix="/api/v1/collections", tags=["Collections"])
app.include_router(seo.router, prefix="/api/v1", tags=["SEO"])
app.include_router(admin.router, prefix="/api/v1", tags=["Admin"])
app.include_router(hex_calc.router, prefix="/api/v1/hex-calc", tags=["Hex Calculator"])
app.include_router(explorer.router, prefix="/api/v1/explorer", tags=["Embedding Explorer"])

@app.get("/api")
async def root():
    """API information endpoint (moved from / to allow frontend serving)"""
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

# Serve frontend static assets (JS, CSS, images)
frontend_dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist_path):
    import mimetypes

    # Mount static assets subdirectory
    assets_path = os.path.join(frontend_dist_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    # Serve specific static files (favicon, robots.txt, og-images)
    @app.get("/favicon.svg")
    async def favicon():
        return FileResponse(os.path.join(frontend_dist_path, "favicon.svg"))

    @app.get("/robots.txt")
    async def robots():
        return FileResponse(os.path.join(frontend_dist_path, "robots.txt"))

    @app.get("/og-image.png")
    async def og_image():
        return FileResponse(os.path.join(frontend_dist_path, "og-image.png"), media_type="image/png")

    @app.get("/og-classify.png")
    async def og_classify():
        return FileResponse(os.path.join(frontend_dist_path, "og-classify.png"), media_type="image/png")

    # Catch-all route for SPA - serves index.html for all non-API routes
    # This must be defined LAST
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str, request: Request):
        """Serve React SPA with dynamic meta tag injection for entity pages"""
        import re
        import json

        # Don't intercept API routes or static file requests
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc"):
            raise HTTPException(status_code=404, detail="Not found")

        # Read index.html
        index_path = os.path.join(frontend_dist_path, "index.html")
        with open(index_path, 'r', encoding='utf-8') as f:
            html = f.read()

        # Static page meta tags for Twitter/social previews
        PAGE_META = {
            'classify': {
                'title': 'AI Entity Classification | UHT Factory',
                'description': 'Classify any concept, object, or idea using the Universal Hex Taxonomy. Our AI analyzes 32 fundamental traits to generate a unique 8-character hex code.',
                'image': 'https://factory.universalhex.org/og-classify.png'
            },
            'gallery': {
                'title': 'Entity Gallery | UHT Factory',
                'description': 'Browse thousands of classified entities with AI-generated images. Explore the Universal Hex Taxonomy visual collection.',
                'image': 'https://factory.universalhex.org/og-image.png'
            },
            'traits': {
                'title': 'Canonical Traits | UHT Factory',
                'description': 'Explore the 32 canonical traits of the Universal Hex Taxonomy across Physical, Functional, Abstract, and Social layers.',
                'image': 'https://factory.universalhex.org/og-image.png'
            },
            'how-it-works': {
                'title': 'How UHT Works | UHT Factory',
                'description': 'Learn how the Universal Hex Taxonomy classifies concepts using 32 binary traits to create unique 8-character hex codes.',
                'image': 'https://factory.universalhex.org/og-image.png'
            },
            'build': {
                'title': 'Build-a-Code | UHT Factory',
                'description': 'Search for entities by trait pattern. Toggle bits to find entities matching specific taxonomic characteristics.',
                'image': 'https://factory.universalhex.org/og-image.png'
            },
            'compare': {
                'title': 'Entity Comparison | UHT Factory',
                'description': 'Compare entities side-by-side to see their taxonomic similarities and differences across 32 traits.',
                'image': 'https://factory.universalhex.org/og-image.png'
            },
            'analytics': {
                'title': 'Trait Analytics | UHT Factory',
                'description': 'Explore trait co-occurrence patterns, frequency statistics, and taxonomic insights across the entity database.',
                'image': 'https://factory.universalhex.org/og-image.png'
            },
            'hex-calc': {
                'title': 'Hex Calculator | UHT Factory',
                'description': 'Perform XOR operations on UHT entity codes. Combine entities to discover new classifications and generate AI names for computed results.',
                'image': 'https://factory.universalhex.org/og-image.png'
            }
        }

        # Check for static page matches and inject meta tags
        page_key = full_path.rstrip('/')
        if page_key in PAGE_META:
            meta = PAGE_META[page_key]
            html = inject_static_page_meta(html, meta['title'], meta['description'], meta['image'],
                                           f'https://factory.universalhex.org/{page_key}')

        # Check if this is an entity page
        entity_match = re.match(r'^entity/([a-f0-9-]+)/?$', full_path)
        logger.info(f"serve_spa: full_path='{full_path}', entity_match={entity_match is not None}")
        if entity_match:
            uuid = entity_match.group(1)
            logger.info(f"serve_spa: Attempting to inject meta tags for entity {uuid}")

            # Try to inject meta tags for this entity
            try:
                neo4j_client = request.app.state.neo4j_client
                redis_client = request.app.state.redis_client

                # Check Redis cache first
                cache_key = f"entity_meta:{uuid}"
                entity = None
                try:
                    cached = await redis_client.client.get(cache_key)
                    if cached:
                        entity = json.loads(cached)
                        logger.info(f"serve_spa: Entity found in cache: {entity.get('name')}")
                except Exception as e:
                    logger.warning(f"serve_spa: Redis cache read failed: {e}")

                # Query Neo4j if not cached
                if not entity:
                    logger.info(f"serve_spa: Entity not in cache, querying Neo4j for {uuid}")
                    query = """
                    MATCH (e:Entity {uuid: $uuid})
                    RETURN e.uuid as uuid,
                           e.name as name,
                           e.description as description,
                           e.uht_code as uht_code,
                           e.image_url as image_url
                    LIMIT 1
                    """
                    result = await neo4j_client.execute_query(query, uuid=uuid)
                    if result:
                        entity = dict(result[0])
                        logger.info(f"serve_spa: Found entity in Neo4j: {entity.get('name')}")
                        # Cache for 1 hour
                        try:
                            from datetime import timedelta
                            await redis_client.client.setex(
                                cache_key,
                                timedelta(seconds=3600),
                                json.dumps(entity)
                            )
                        except Exception as e:
                            logger.warning(f"serve_spa: Redis cache write failed: {e}")
                    else:
                        logger.warning(f"serve_spa: Entity {uuid} not found in Neo4j")

                # Inject meta tags if entity found
                if entity:
                    logger.info(f"serve_spa: Injecting meta tags for {entity.get('name')}")
                    html = inject_entity_meta_tags(html, entity)
                    logger.info(f"serve_spa: Meta tags injected successfully")
                else:
                    logger.warning(f"serve_spa: No entity data available for {uuid}, serving default HTML")

            except Exception as e:
                # Log error but continue serving HTML
                logger.error(f"serve_spa: Error injecting meta tags for {uuid}: {e}", exc_info=True)

        return HTMLResponse(content=html, media_type="text/html")

    def inject_static_page_meta(html: str, title: str, description: str, image: str, url: str) -> str:
        """Replace default meta tags with page-specific ones for static pages"""
        import re
        # Replace title
        html = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', html, count=1, flags=re.DOTALL)
        # Replace OG tags
        html = re.sub(r'<meta property="og:title" content=".*?" />', f'<meta property="og:title" content="{title}" />', html, count=1)
        html = re.sub(r'<meta property="og:description" content=".*?" />', f'<meta property="og:description" content="{description}" />', html, count=1, flags=re.DOTALL)
        html = re.sub(r'<meta property="og:image" content=".*?" />', f'<meta property="og:image" content="{image}" />', html, count=1)
        html = re.sub(r'<meta property="og:url" content=".*?" />', f'<meta property="og:url" content="{url}" />', html, count=1)
        # Replace Twitter tags
        html = re.sub(r'<meta name="twitter:title" content=".*?" />', f'<meta name="twitter:title" content="{title}" />', html, count=1)
        html = re.sub(r'<meta name="twitter:description" content=".*?" />', f'<meta name="twitter:description" content="{description}" />', html, count=1, flags=re.DOTALL)
        html = re.sub(r'<meta name="twitter:image" content=".*?" />', f'<meta name="twitter:image" content="{image}" />', html, count=1)
        html = re.sub(r'<meta name="twitter:url" content=".*?" />', f'<meta name="twitter:url" content="{url}" />', html, count=1)
        # Replace meta description
        html = re.sub(r'<meta name="description" content=".*?" />', f'<meta name="description" content="{description}" />', html, count=1, flags=re.DOTALL)
        return html

    def inject_entity_meta_tags(html: str, entity: dict) -> str:
        """Replace default meta tags with entity-specific ones"""
        # Escape HTML entities
        def escape_html(text: str) -> str:
            if not text:
                return ""
            return (text
                    .replace('&', '&amp;')
                    .replace('<', '&lt;')
                    .replace('>', '&gt;')
                    .replace('"', '&quot;')
                    .replace("'", '&#39;'))

        name = escape_html(entity.get('name', 'Unknown Entity'))
        description = escape_html(entity.get('description', '')[:160])
        uht_code = entity.get('uht_code', '')
        uuid = entity.get('uuid', '')
        image_url = entity.get('image_url', '/og-image.png')

        # Ensure image URL is absolute
        if image_url and not image_url.startswith('http'):
            image_url = f"https://factory.universalhex.org{image_url}"
        else:
            image_url = "https://factory.universalhex.org/og-image.png"

        # Replace default title with entity-specific title (includes hex code now!)
        html = re.sub(
            r'<title>.*?</title>',
            f'<title>{name} ({uht_code}) | UHT Factory</title>',
            html,
            count=1,
            flags=re.DOTALL
        )

        # Replace default meta description
        html = re.sub(
            r'<meta name="description" content=".*?" />',
            f'<meta name="description" content="{description}" />',
            html,
            count=1,
            flags=re.DOTALL
        )

        # Replace default meta keywords
        html = re.sub(
            r'<meta name="keywords" content=".*?" />',
            f'<meta name="keywords" content="{name}, UHT code {uht_code}, entity classification, universal hex taxonomy" />',
            html,
            count=1,
            flags=re.DOTALL
        )

        # Replace Open Graph tags
        html = re.sub(
            r'<meta property="og:type" content=".*?" />',
            f'<meta property="og:type" content="article" />',
            html,
            count=1
        )
        html = re.sub(
            r'<meta property="og:url" content=".*?" />',
            f'<meta property="og:url" content="https://factory.universalhex.org/entity/{uuid}" />',
            html,
            count=1
        )
        html = re.sub(
            r'<meta property="og:title" content=".*?" />',
            f'<meta property="og:title" content="{name} ({uht_code}) | UHT Factory" />',
            html,
            count=1
        )
        html = re.sub(
            r'<meta property="og:description" content=".*?" />',
            f'<meta property="og:description" content="{description}" />',
            html,
            count=1,
            flags=re.DOTALL
        )
        html = re.sub(
            r'<meta property="og:image" content=".*?" />',
            f'<meta property="og:image" content="{image_url}" />',
            html,
            count=1
        )

        # Replace Twitter Card tags
        html = re.sub(
            r'<meta name="twitter:url" content=".*?" />',
            f'<meta name="twitter:url" content="https://factory.universalhex.org/entity/{uuid}" />',
            html,
            count=1
        )
        html = re.sub(
            r'<meta name="twitter:title" content=".*?" />',
            f'<meta name="twitter:title" content="{name} ({uht_code}) | UHT Factory" />',
            html,
            count=1,
            flags=re.DOTALL
        )
        html = re.sub(
            r'<meta name="twitter:description" content=".*?" />',
            f'<meta name="twitter:description" content="{description}" />',
            html,
            count=1,
            flags=re.DOTALL
        )
        html = re.sub(
            r'<meta name="twitter:image" content=".*?" />',
            f'<meta name="twitter:image" content="{image_url}" />',
            html,
            count=1
        )

        # Replace canonical URL
        html = re.sub(
            r'<link rel="canonical" href=".*?" />',
            f'<link rel="canonical" href="https://factory.universalhex.org/entity/{uuid}" />',
            html,
            count=1
        )

        logger.debug(f"Replaced meta tags for entity {uuid} ({name})")
        return html
