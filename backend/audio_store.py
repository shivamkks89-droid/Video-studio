"""On-disk audio storage to keep project documents lean."""
import base64
import re
import uuid
from pathlib import Path
from typing import Optional


AUD_DIR = Path(__file__).parent / "static" / "audio"
AUD_DIR.mkdir(parents=True, exist_ok=True)


_DATA_URI_RE = re.compile(r"^data:(?P<mime>[\w/+.\-]+);base64,(?P<b64>.+)$", re.DOTALL)
_EXT = {"audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/ogg": "ogg"}


def save_audio_data_uri(data_uri: str) -> Optional[str]:
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
    ext = _EXT.get(m.group("mime"), "mp3")
    fid = uuid.uuid4().hex[:14]
    path = AUD_DIR / f"{fid}.{ext}"
    path.write_bytes(raw)
    return f"/api/files/audio/{fid}.{ext}"


def audio_url_to_path(url: str) -> Optional[Path]:
    if not url:
        return None
    if url.startswith("/api/files/audio/"):
        name = url.rsplit("/", 1)[-1]
        p = AUD_DIR / name
        return p if p.exists() else None
    return None
