"""
Simple privacy-friendly analytics for UHT Factory.

Tracks page views and unique visitors without storing personal data.
Uses Redis for storage with automatic expiration.
"""

import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from db.redis_client import RedisClient
from api.dependencies import get_redis_client
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])

# Redis key prefixes
KEY_PAGEVIEWS = "analytics:pageviews"  # Sorted set: path -> count
KEY_DAILY_VIEWS = "analytics:daily"     # Hash: date -> count
KEY_HOURLY_VIEWS = "analytics:hourly"   # Hash: hour -> count
KEY_VISITORS = "analytics:visitors"     # HyperLogLog for unique visitors
KEY_REFERRERS = "analytics:referrers"   # Sorted set: referrer -> count
KEY_PAGES_TODAY = "analytics:pages:today"  # Sorted set: path -> count (today only)
KEY_USER_AGENTS = "analytics:agents"    # Hash: browser -> count
KEY_RECENT = "analytics:recent"         # List of recent page views


class PageViewEvent(BaseModel):
    """A page view event from the frontend."""
    path: str
    referrer: Optional[str] = None
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None


class AnalyticsStats(BaseModel):
    """Analytics statistics response."""
    total_pageviews: int
    unique_visitors_today: int
    unique_visitors_week: int
    top_pages: List[Dict[str, Any]]
    top_referrers: List[Dict[str, Any]]
    daily_views: Dict[str, int]
    hourly_views: Dict[str, int]
    browsers: Dict[str, int]
    recent_views: List[Dict[str, Any]]


def hash_ip(ip: str, salt: str = "uht-analytics") -> str:
    """Hash IP for privacy - can't be reversed to original IP."""
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:16]


def parse_user_agent(ua: str) -> str:
    """Extract browser name from user agent."""
    ua_lower = ua.lower()
    if 'chrome' in ua_lower and 'edg' not in ua_lower:
        return 'Chrome'
    elif 'firefox' in ua_lower:
        return 'Firefox'
    elif 'safari' in ua_lower and 'chrome' not in ua_lower:
        return 'Safari'
    elif 'edg' in ua_lower:
        return 'Edge'
    elif 'brave' in ua_lower:
        return 'Brave'
    elif 'bot' in ua_lower or 'crawler' in ua_lower or 'spider' in ua_lower:
        return 'Bot'
    else:
        return 'Other'


def get_client_ip(request: Request) -> str:
    """Get real client IP, handling Cloudflare proxy."""
    # Cloudflare passes real IP in CF-Connecting-IP header
    cf_ip = request.headers.get('CF-Connecting-IP')
    if cf_ip:
        return cf_ip

    # Fallback to X-Forwarded-For
    xff = request.headers.get('X-Forwarded-For')
    if xff:
        return xff.split(',')[0].strip()

    # Last resort: direct connection IP
    return request.client.host if request.client else 'unknown'


@router.post("/pageview")
async def track_pageview(
    event: PageViewEvent,
    request: Request,
    redis: RedisClient = Depends(get_redis_client)
):
    """
    Track a page view event.

    Called by frontend on each page load.
    """
    try:
        now = datetime.utcnow()
        today = now.strftime("%Y-%m-%d")
        hour = now.strftime("%Y-%m-%d:%H")

        # Get client info
        client_ip = get_client_ip(request)
        ip_hash = hash_ip(client_ip)
        user_agent = request.headers.get('User-Agent', '')
        browser = parse_user_agent(user_agent)

        # Skip bots
        if browser == 'Bot':
            return {"status": "skipped", "reason": "bot"}

        # Clean path (remove query strings, normalize)
        path = event.path.split('?')[0].rstrip('/')
        if not path:
            path = '/'

        # Track in Redis (use pipeline for efficiency)
        pipe = redis.client.pipeline()

        # 1. Increment total pageviews for this path
        pipe.zincrby(KEY_PAGEVIEWS, 1, path)

        # 2. Increment daily count
        pipe.hincrby(KEY_DAILY_VIEWS, today, 1)

        # 3. Increment hourly count
        pipe.hincrby(KEY_HOURLY_VIEWS, hour, 1)

        # 4. Add to unique visitors (HyperLogLog)
        pipe.pfadd(f"{KEY_VISITORS}:{today}", ip_hash)
        pipe.pfadd(f"{KEY_VISITORS}:week", ip_hash)

        # 5. Track referrer if present
        if event.referrer and 'universalhex.org' not in event.referrer:
            # Extract domain from referrer
            try:
                from urllib.parse import urlparse
                ref_domain = urlparse(event.referrer).netloc
                if ref_domain:
                    pipe.zincrby(KEY_REFERRERS, 1, ref_domain)
            except:
                pass

        # 6. Track today's pages (with expiry)
        pipe.zincrby(KEY_PAGES_TODAY, 1, path)
        pipe.expire(KEY_PAGES_TODAY, 86400)  # 24 hours

        # 7. Track browser
        pipe.hincrby(KEY_USER_AGENTS, browser, 1)

        # 8. Add to recent views list (keep last 100)
        recent_entry = json.dumps({
            "path": path,
            "time": now.isoformat(),
            "browser": browser,
            "device": "mobile" if event.screen_width and event.screen_width < 768 else "desktop"
        })
        pipe.lpush(KEY_RECENT, recent_entry)
        pipe.ltrim(KEY_RECENT, 0, 99)

        # 9. Set expiry on weekly visitor count (reset weekly)
        pipe.expire(f"{KEY_VISITORS}:week", 604800)  # 7 days

        await pipe.execute()

        logger.debug(f"Tracked pageview: {path} from {browser}")
        return {"status": "ok"}

    except Exception as e:
        logger.error(f"Failed to track pageview: {e}")
        # Don't fail the request, just log
        return {"status": "error"}


@router.get("/stats", response_model=AnalyticsStats)
async def get_stats(
    request: Request,
    redis: RedisClient = Depends(get_redis_client)
):
    """
    Get analytics statistics.

    Returns aggregated stats for dashboard display.
    """
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")

        # Get total pageviews
        total_views = 0
        daily_counts = await redis.client.hgetall(KEY_DAILY_VIEWS)
        for count in daily_counts.values():
            total_views += int(count)

        # Get unique visitors
        visitors_today = await redis.client.pfcount(f"{KEY_VISITORS}:{today}")
        visitors_week = await redis.client.pfcount(f"{KEY_VISITORS}:week")

        # Get top pages (all time)
        top_pages_raw = await redis.client.zrevrange(KEY_PAGEVIEWS, 0, 9, withscores=True)
        top_pages = [{"path": p, "views": int(v)} for p, v in top_pages_raw]

        # Get top referrers
        top_refs_raw = await redis.client.zrevrange(KEY_REFERRERS, 0, 9, withscores=True)
        top_referrers = [{"domain": r, "count": int(c)} for r, c in top_refs_raw]

        # Get daily views (last 14 days)
        daily_views = {}
        for i in range(14):
            date = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
            count = await redis.client.hget(KEY_DAILY_VIEWS, date)
            daily_views[date] = int(count) if count else 0

        # Get hourly views (last 24 hours)
        hourly_views = {}
        for i in range(24):
            hour = (datetime.utcnow() - timedelta(hours=i)).strftime("%Y-%m-%d:%H")
            count = await redis.client.hget(KEY_HOURLY_VIEWS, hour)
            hourly_views[hour] = int(count) if count else 0

        # Get browser stats
        browsers_raw = await redis.client.hgetall(KEY_USER_AGENTS)
        browsers = {k: int(v) for k, v in browsers_raw.items()}

        # Get recent views
        recent_raw = await redis.client.lrange(KEY_RECENT, 0, 19)
        recent_views = []
        for entry in recent_raw:
            try:
                recent_views.append(json.loads(entry))
            except:
                pass

        return AnalyticsStats(
            total_pageviews=total_views,
            unique_visitors_today=visitors_today,
            unique_visitors_week=visitors_week,
            top_pages=top_pages,
            top_referrers=top_referrers,
            daily_views=daily_views,
            hourly_views=hourly_views,
            browsers=browsers,
            recent_views=recent_views
        )

    except Exception as e:
        logger.error(f"Failed to get analytics stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve analytics")


@router.get("/live")
async def get_live_stats(
    redis: RedisClient = Depends(get_redis_client)
):
    """
    Get live/recent activity for real-time dashboard.
    """
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        current_hour = datetime.utcnow().strftime("%Y-%m-%d:%H")

        # Views this hour
        views_this_hour = await redis.client.hget(KEY_HOURLY_VIEWS, current_hour)

        # Visitors today
        visitors_today = await redis.client.pfcount(f"{KEY_VISITORS}:{today}")

        # Last 5 page views
        recent_raw = await redis.client.lrange(KEY_RECENT, 0, 4)
        recent = [json.loads(r) for r in recent_raw if r]

        return {
            "views_this_hour": int(views_this_hour) if views_this_hour else 0,
            "visitors_today": visitors_today,
            "recent": recent
        }

    except Exception as e:
        logger.error(f"Failed to get live stats: {e}")
        return {"views_this_hour": 0, "visitors_today": 0, "recent": []}
