"""
SEO routes for sitemap generation and search engine optimization
"""
from fastapi import APIRouter, Depends, Response
from datetime import datetime
from typing import List, Dict, Any
from xml.etree.ElementTree import Element, SubElement, tostring

from api.dependencies import get_neo4j_client
from db.neo4j_client import Neo4jClient

router = APIRouter()


def create_sitemap_xml(urls: List[Dict[str, Any]]) -> str:
    """
    Generate XML sitemap from URL list

    Args:
        urls: List of dicts with keys: loc, lastmod, changefreq, priority

    Returns:
        XML string in sitemap format
    """
    urlset = Element('urlset')
    urlset.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')

    for url_data in urls:
        url = SubElement(urlset, 'url')

        loc = SubElement(url, 'loc')
        loc.text = url_data['loc']

        if 'lastmod' in url_data and url_data['lastmod']:
            lastmod = SubElement(url, 'lastmod')
            lastmod.text = url_data['lastmod']

        if 'changefreq' in url_data:
            changefreq = SubElement(url, 'changefreq')
            changefreq.text = url_data['changefreq']

        if 'priority' in url_data:
            priority = SubElement(url, 'priority')
            priority.text = str(url_data['priority'])

    xml_str = tostring(urlset, encoding='unicode', method='xml')
    return f'<?xml version="1.0" encoding="UTF-8"?>\n{xml_str}'


@router.get("/sitemap.xml")
async def get_sitemap(
    neo4j_client: Neo4jClient = Depends(get_neo4j_client)
):
    """
    Generate dynamic sitemap.xml with all entities and static pages

    Returns sitemap XML for search engine crawling
    """
    base_url = "https://factory.universalhex.org"
    urls = []

    # Static pages - high priority, weekly updates
    static_pages = [
        {"loc": f"{base_url}/", "changefreq": "daily", "priority": 1.0},
        {"loc": f"{base_url}/gallery", "changefreq": "daily", "priority": 0.9},
        {"loc": f"{base_url}/traits", "changefreq": "weekly", "priority": 0.8},
        {"loc": f"{base_url}/meta-classes", "changefreq": "weekly", "priority": 0.8},
        {"loc": f"{base_url}/analytics", "changefreq": "weekly", "priority": 0.7},
        {"loc": f"{base_url}/classify", "changefreq": "monthly", "priority": 0.6},
        {"loc": f"{base_url}/graph", "changefreq": "monthly", "priority": 0.6},
        {"loc": f"{base_url}/comparison", "changefreq": "monthly", "priority": 0.5},
        {"loc": f"{base_url}/build", "changefreq": "monthly", "priority": 0.5},
        {"loc": f"{base_url}/collections", "changefreq": "weekly", "priority": 0.7},
        {"loc": f"{base_url}/list", "changefreq": "daily", "priority": 0.8},
    ]

    urls.extend(static_pages)

    # Fetch all entities from Neo4j
    try:
        query = """
        MATCH (e:Entity)
        WHERE e.uuid IS NOT NULL
        RETURN e.uuid as uuid,
               e.created_at as created_at,
               e.name as name
        ORDER BY e.created_at DESC
        LIMIT 50000
        """

        result = await neo4j_client.execute_query(query)

        for record in result:
            uuid = record.get('uuid')
            created_at = record.get('created_at')

            # Format lastmod date
            lastmod = None
            if created_at:
                try:
                    # Handle Neo4j DateTime object
                    if hasattr(created_at, 'to_native'):
                        dt = created_at.to_native()
                        lastmod = dt.strftime('%Y-%m-%d')
                    elif isinstance(created_at, datetime):
                        lastmod = created_at.strftime('%Y-%m-%d')
                except:
                    pass

            # Add entity URL
            entity_url = {
                "loc": f"{base_url}/entity/{uuid}",
                "changefreq": "monthly",
                "priority": 0.7
            }

            if lastmod:
                entity_url["lastmod"] = lastmod

            urls.append(entity_url)

    except Exception as e:
        # Log error but continue with static pages
        print(f"Error fetching entities for sitemap: {e}")

    # Generate XML
    xml_content = create_sitemap_xml(urls)

    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={
            "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
        }
    )


@router.get("/sitemap-index.xml")
async def get_sitemap_index():
    """
    Sitemap index for very large sites (future-proofing)
    Currently just points to main sitemap
    """
    base_url = "https://factory.universalhex.org"

    sitemapindex = Element('sitemapindex')
    sitemapindex.set('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9')

    sitemap = SubElement(sitemapindex, 'sitemap')
    loc = SubElement(sitemap, 'loc')
    loc.text = f"{base_url}/api/v1/sitemap.xml"

    lastmod = SubElement(sitemap, 'lastmod')
    lastmod.text = datetime.now().strftime('%Y-%m-%d')

    xml_str = tostring(sitemapindex, encoding='unicode', method='xml')
    xml_content = f'<?xml version="1.0" encoding="UTF-8"?>\n{xml_str}'

    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={
            "Cache-Control": "public, max-age=3600",
        }
    )
