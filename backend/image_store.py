"""On-disk image storage to avoid huge base64-in-JSON responses (Cloudflare-safe)."""
import base64
import os
import re
import uuid
from pathlib import Path
from typing import Optional


IMG_DIR = Path(__file__).parent / "static" / "images"
IMG_DIR.mkdir(parents=True, exist_ok=True)


_DATA_URI_RE = re.compile(r"^data:(?P<mime>[\w/+.\-]+);base64,(?P<b64>.+)$", re.DOTALL)
_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp"}


def save_data_uri(data_uri: str) -> Optional[str]:
    """Persist a data URI to disk and return a short URL like /api/files/images/<id>.<ext>."""
    if not data_uri:
        return None
    m = _DATA_URI_RE.match(data_uri)
    if not m:
        # already a URL, keep as-is
        if data_uri.startswith("http") or data_uri.startswith("/api/"):
            return data_uri
        return None
    try:
        raw = base64.b64decode(m.group("b64"))
    except Exception:
        return None
    ext = _EXT.get(m.group("mime"), "png")
    fid = uuid.uuid4().hex[:14]
    path = IMG_DIR / f"{fid}.{ext}"
    path.write_bytes(raw)
    return f"/api/files/images/{fid}.{ext}"


def url_to_disk_path(url: str) -> Optional[Path]:
    """Map an /api/files/images/<file> URL back to a disk path (for the video renderer)."""
    if not url:
        return None
    if url.startswith("/api/files/images/"):
        name = url.rsplit("/", 1)[-1]
        p = IMG_DIR / name
        return p if p.exists() else None
    return None
