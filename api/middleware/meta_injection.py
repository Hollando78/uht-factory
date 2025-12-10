"""
Meta Tag Injection Middleware for SEO

Intercepts HTML requests for entity pages and injects dynamic meta tags
before serving to search engine crawlers and users.
"""
import re
import json
from typing import Optional, Dict, Any
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, StreamingResponse
import logging

logger = logging.getLogger(__name__)


class MetaTagInjectionMiddleware(BaseHTTPMiddleware):
    """
    Middleware that injects entity-specific meta tags into HTML responses.

    For routes matching /entity/:uuid, fetches entity data from Neo4j and
    injects SEO meta tags (title, description, Open Graph, Twitter Card)
    into the HTML before the </head> tag.

    Uses Redis caching to minimize database queries.
    """

    async def dispatch(self, request: Request, call_next):
        # Let the request proceed normally
        response = await call_next(request)

        # Log request path for debugging
        logger.info(f"Processing request: {request.url.path}")

        # Only process HTML responses for entity pages
        if not self._should_inject(request, response):
            logger.debug(f"Skipping injection for {request.url.path}: should_inject=False")
            return response

        # Extract UUID from path
        uuid_match = re.match(r'^/entity/([a-f0-9-]+)/?$', request.url.path)
        if not uuid_match:
            return response

        uuid = uuid_match.group(1)

        try:
            # Fetch entity data (with caching)
            entity = await self._fetch_entity_data(uuid, request.app)
            if not entity:
                logger.warning(f"Entity not found for meta injection: {uuid}")
                return response

            # Read response body
            body = await self._read_response_body(response)
            if not body:
                return response

            # Inject meta tags
            html = body.decode('utf-8')
            modified_html = self._inject_meta_tags(html, entity)

            # Return modified response
            return Response(
                content=modified_html.encode('utf-8'),
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type="text/html"
            )

        except Exception as e:
            logger.error(f"Error injecting meta tags for {uuid}: {e}", exc_info=True)
            # Return original response on error
            return response

    def _should_inject(self, request: Request, response: Response) -> bool:
        """Check if we should inject meta tags for this request/response."""
        # Only process entity routes
        if not request.url.path.startswith('/entity/'):
            logger.debug(f"Path {request.url.path} does not start with /entity/")
            return False

        # Only process successful HTML responses
        if response.status_code != 200:
            logger.debug(f"Status code is {response.status_code}, not 200")
            return False

        # Check content type
        content_type = response.headers.get('content-type', '')
        logger.debug(f"Content-Type: {content_type}")
        if 'text/html' not in content_type:
            logger.debug(f"Content-Type {content_type} does not contain text/html")
            return False

        logger.info(f"Will inject meta tags for {request.url.path}")
        return True

    async def _read_response_body(self, response: Response) -> Optional[bytes]:
        """Read the complete response body."""
        from fastapi.responses import FileResponse

        # For FileResponse, read the file directly
        if isinstance(response, FileResponse):
            try:
                with open(response.path, 'rb') as f:
                    return f.read()
            except Exception as e:
                logger.error(f"Error reading file: {e}")
                return None

        # For streaming responses, collect all chunks
        if isinstance(response, StreamingResponse):
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            return body
        else:
            # For regular responses
            return response.body if hasattr(response, 'body') else None

    async def _fetch_entity_data(self, uuid: str, app) -> Optional[Dict[str, Any]]:
        """
        Fetch entity data from cache or Neo4j.

        Returns dict with: uuid, name, description, uht_code, image_url
        """
        redis_client = app.state.redis_client
        neo4j_client = app.state.neo4j_client

        # Check Redis cache first
        cache_key = f"entity_meta:{uuid}"
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                logger.debug(f"Cache hit for entity meta: {uuid}")
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Redis cache read failed: {e}")

        # Query Neo4j
        query = """
        MATCH (e:Entity {uuid: $uuid})
        RETURN e.uuid as uuid,
               e.name as name,
               e.description as description,
               e.uht_code as uht_code,
               e.image_url as image_url
        LIMIT 1
        """

        try:
            result = await neo4j_client.execute_query(query, {"uuid": uuid})
            if not result:
                return None

            entity = dict(result[0])

            # Cache for 1 hour
            try:
                await redis_client.setex(
                    cache_key,
                    3600,  # 1 hour TTL
                    json.dumps(entity)
                )
                logger.debug(f"Cached entity meta: {uuid}")
            except Exception as e:
                logger.warning(f"Redis cache write failed: {e}")

            return entity

        except Exception as e:
            logger.error(f"Neo4j query failed for {uuid}: {e}")
            return None

    def _inject_meta_tags(self, html: str, entity: Dict[str, Any]) -> str:
        """Replace default meta tags with entity-specific ones."""
        # Escape HTML entities in meta content
        name = self._escape_html(entity.get('name', 'Unknown Entity'))
        description = self._escape_html(entity.get('description', '')[:160])
        uht_code = entity.get('uht_code', '')
        uuid = entity.get('uuid', '')
        image_url = entity.get('image_url', '/og-image.png')

        # Ensure image URL is absolute
        if image_url and not image_url.startswith('http'):
            image_url = f"https://factory.universalhex.org{image_url}"
        else:
            image_url = "https://factory.universalhex.org/og-image.png"

        # Replace default title with entity-specific title
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

        logger.debug(f"Replaced meta tags for entity {uuid}")
        return html

    def _escape_html(self, text: str) -> str:
        """Escape HTML entities to prevent XSS in meta tags."""
        if not text:
            return ""
        return (text
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;')
                .replace("'", '&#39;'))
