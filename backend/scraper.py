"""Real-content scraper: detect URL / Play Store ID / website and return real metadata."""
import asyncio
import re
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup


PLAYSTORE_ID_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$")


def _detect_kind(q: str) -> str:
    q = q.strip()
    if not q:
        return "unknown"
    if q.startswith("http://") or q.startswith("https://"):
        if "play.google.com" in q:
            return "playstore"
        if "apps.apple.com" in q:
            return "appstore"
        return "website"
    if PLAYSTORE_ID_RE.match(q):
        return "playstore"
    return "unknown"


def _extract_playstore_id(q: str) -> Optional[str]:
    if PLAYSTORE_ID_RE.match(q):
        return q
    m = re.search(r"[?&]id=([^&]+)", q)
    return m.group(1) if m else None


async def _scrape_playstore(app_id: str) -> dict:
    def _work():
        from google_play_scraper import app as ps_app  # type: ignore
        try:
            return ps_app(app_id, lang="en", country="in")
        except Exception as e:
            return {"_error": str(e)}
    data = await asyncio.to_thread(_work)
    if "_error" in data:
        return {"kind": "playstore", "ok": False, "error": data["_error"]}
    return {
        "kind": "playstore",
        "ok": True,
        "id": data.get("appId", app_id),
        "title": data.get("title"),
        "description": (data.get("description") or "")[:1500],
        "summary": data.get("summary"),
        "developer": data.get("developer"),
        "icon": data.get("icon"),
        "header_image": data.get("headerImage"),
        "screenshots": (data.get("screenshots") or [])[:8],
        "score": data.get("score"),
        "installs": data.get("installs"),
        "category": data.get("genre"),
        "url": data.get("url") or f"https://play.google.com/store/apps/details?id={app_id}",
    }


async def _scrape_website(url: str) -> dict:
    if not url.startswith("http"):
        url = "https://" + url
    headers = {"User-Agent": "Mozilla/5.0 (compatible; CineReelBot/1.0)"}
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
            r = await client.get(url)
            if r.status_code >= 400:
                return {"kind": "website", "ok": False, "error": f"HTTP {r.status_code}"}
            html = r.text
    except Exception as e:
        return {"kind": "website", "ok": False, "error": str(e)}

    soup = BeautifulSoup(html, "lxml")

    def meta(prop):
        tag = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
        return tag["content"].strip() if tag and tag.get("content") else None

    title = meta("og:title") or (soup.title.string.strip() if soup.title and soup.title.string else None)
    description = meta("og:description") or meta("description")
    image = meta("og:image") or meta("twitter:image")
    site_name = meta("og:site_name")
    favicon = None
    icon_tag = soup.find("link", rel=lambda v: v and ("icon" in v.lower()))
    if icon_tag and icon_tag.get("href"):
        href = icon_tag["href"]
        if href.startswith("//"):
            favicon = "https:" + href
        elif href.startswith("/"):
            p = urlparse(url)
            favicon = f"{p.scheme}://{p.netloc}{href}"
        elif href.startswith("http"):
            favicon = href
    # gather image candidates from <img>
    extras = []
    for img in soup.find_all("img", limit=20):
        src = img.get("src") or img.get("data-src")
        if not src:
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            p = urlparse(url)
            src = f"{p.scheme}://{p.netloc}{src}"
        if src.startswith("http") and not src.endswith(".svg"):
            extras.append(src)
    screenshots = []
    seen = set()
    for s in [image] + extras:
        if s and s not in seen:
            screenshots.append(s)
            seen.add(s)
        if len(screenshots) >= 6:
            break

    return {
        "kind": "website",
        "ok": True,
        "url": url,
        "title": title,
        "description": (description or "")[:1500],
        "summary": description,
        "developer": site_name,
        "icon": favicon or image,
        "screenshots": screenshots,
        "category": None,
    }


async def scrape(query: str) -> dict:
    kind = _detect_kind(query)
    if kind == "playstore":
        app_id = _extract_playstore_id(query) or query
        return await _scrape_playstore(app_id)
    if kind == "website":
        return await _scrape_website(query)
    return {"kind": kind, "ok": False, "error": "Could not detect a URL or Play Store ID."}


def to_script_context(scraped: dict) -> str:
    """Format scraped data into a context block to feed Claude for script generation."""
    if not scraped.get("ok"):
        return ""
    lines = []
    if scraped.get("title"):
        lines.append(f"App / Brand name: {scraped['title']}")
    if scraped.get("developer"):
        lines.append(f"Developer / Company: {scraped['developer']}")
    if scraped.get("category"):
        lines.append(f"Category: {scraped['category']}")
    if scraped.get("description"):
        lines.append(f"Real description (from Play Store / website): {scraped['description'][:900]}")
    if scraped.get("installs"):
        lines.append(f"Installs: {scraped['installs']}")
    if scraped.get("score"):
        lines.append(f"Average rating: {scraped['score']}")
    if scraped.get("url"):
        lines.append(f"Source URL: {scraped['url']}")
    return "\n".join(lines)
