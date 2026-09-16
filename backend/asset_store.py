"""Disk + Object-Storage hybrid asset storage.

Files are written to the persistent object store (Emergent) AND mirrored to local
disk so the ffmpeg renderer can stream them as a regular path. The public URL
returned to clients always points to our own `/api/files/...` endpoint, which
serves the bytes from object storage (falling back to disk if available).
"""
import asyncio
import base64
import re
import uuid
from pathlib import Path
from typing import Optional

from object_storage import build_path, get_object, put_object

IMG_DIR = Path(__file__).parent / "static" / "images"
AUD_DIR = Path(__file__).parent / "static" / "audio"
VID_DIR = Path(__file__).parent / "static" / "videos"
IMG_DIR.mkdir(parents=True, exist_ok=True)
AUD_DIR.mkdir(parents=True, exist_ok=True)
VID_DIR.mkdir(parents=True, exist_ok=True)

_DATA_URI_RE = re.compile(r"^data:(?P<mime>[\w/+.\-]+);base64,(?P<b64>.+)$", re.DOTALL)
_IMG_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp"}
_AUD_EXT = {"audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/ogg": "ogg"}


async def save_image_data_uri(data_uri: str) -> Optional[str]:
    if not data_uri:
        return None
    m = _DATA_URI_RE.match(data_uri)
    if not m:
        if data_uri.startswith("http") or data_uri.startswith("/api/"):
            return data_uri
        return None
    try:
        raw = base64.b64decode(m.group("b64"))
    except Exception:
        return None
    mime = m.group("mime")
    ext = _IMG_EXT.get(mime, "png")
    return await _save_bytes("images", raw, ext, mime, IMG_DIR)


async def save_audio_data_uri(data_uri: str) -> Optional[str]:
    if not data_uri:
        return None
    m = _DATA_URI_RE.match(data_uri)
    if not m:
        if data_uri.startswith("http") or data_uri.startswith("/api/"):
            return data_uri
        return None
    try:
        raw = base64.b64decode(m.group("b64"))
    except Exception:
        return None
    mime = m.group("mime")
    ext = _AUD_EXT.get(mime, "mp3")
    return await _save_bytes("audio", raw, ext, mime, AUD_DIR)


async def save_video_bytes(raw: bytes) -> Optional[str]:
    return await _save_bytes("videos", raw, "mp4", "video/mp4", VID_DIR)


async def _save_bytes(kind: str, raw: bytes, ext: str, mime: str, local_dir: Path) -> Optional[str]:
    fid = uuid.uuid4().hex[:14]
    fname = f"{fid}.{ext}"
    path = build_path(kind, ext, fid)
    # mirror to local disk first (so ffmpeg can read instantly even if object-store push is slow)
    try:
        (local_dir / fname).write_bytes(raw)
    except Exception:
        pass
    # push to object storage in background
    await put_object(path, raw, mime)
    return f"/api/files/{kind}/{fname}"


async def fetch_to_bytes(url: str) -> Optional[bytes]:
    """Resolve any image/audio URL we returned earlier to raw bytes.
    Try local disk first, then object storage."""
    if not url:
        return None
    if url.startswith("data:"):
        m = _DATA_URI_RE.match(url)
        if not m:
            return None
        try:
            return base64.b64decode(m.group("b64"))
        except Exception:
            return None
    # /api/files/<kind>/<filename>
    m = re.match(r"^/api/files/(images|audio|videos)/([\w.-]+)$", url)
    if not m:
        # External URL (e.g. picsum, cdn, seedance output, etc.) — download it.
        if url.startswith(("http://", "https://")):
            try:
                import httpx
                async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
                    r = await c.get(url)
                    if r.status_code == 200:
                        return r.content
            except Exception:
                pass
        return None
    kind, fname = m.group(1), m.group(2)
    local_dir = {"images": IMG_DIR, "audio": AUD_DIR, "videos": VID_DIR}[kind]
    p = local_dir / fname
    if p.exists():
        try:
            return p.read_bytes()
        except Exception:
            pass
    # fallback to object store
    fid, ext = fname.rsplit(".", 1)
    obj = await get_object(build_path(kind, ext, fid))
    if obj:
        data, _ct = obj
        # mirror locally for next time so ffmpeg/render is fast
        try:
            p.write_bytes(data)
        except Exception:
            pass
        return data
    return None


def url_kind_and_path(url: str) -> Optional[tuple]:
    m = re.match(r"^/api/files/(images|audio|videos)/([\w.-]+)$", url or "")
    if not m:
        return None
    kind, fname = m.group(1), m.group(2)
    local_dir = {"images": IMG_DIR, "audio": AUD_DIR, "videos": VID_DIR}[kind]
    return kind, fname, local_dir / fname
