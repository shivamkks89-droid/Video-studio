"""Emergent Object Storage — persistent storage so files survive pod restarts."""
import asyncio
import os
from typing import Optional, Tuple

import httpx

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "cinereel"

_storage_key: Optional[str] = None
_init_lock = asyncio.Lock()


async def init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    async with _init_lock:
        if _storage_key:
            return _storage_key
        if not EMERGENT_KEY:
            return None
        try:
            async with httpx.AsyncClient(timeout=30.0) as c:
                r = await c.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY})
                r.raise_for_status()
                _storage_key = r.json().get("storage_key")
        except Exception as e:
            print(f"[objstore] init failed: {e}")
            _storage_key = None
    return _storage_key


async def put_object(path: str, data: bytes, content_type: str) -> Optional[dict]:
    key = await init_storage()
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=120.0) as c:
            r = await c.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key, "Content-Type": content_type},
                content=data,
            )
            if r.status_code in (200, 201):
                return r.json()
            print(f"[objstore] put {path} -> {r.status_code} {r.text[:160]}")
    except Exception as e:
        print(f"[objstore] put error: {e}")
    return None


async def get_object(path: str) -> Optional[Tuple[bytes, str]]:
    key = await init_storage()
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=60.0) as c:
            r = await c.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
            if r.status_code == 200:
                return r.content, r.headers.get("Content-Type", "application/octet-stream")
    except Exception as e:
        print(f"[objstore] get error: {e}")
    return None


def build_path(kind: str, ext: str, uid: str) -> str:
    """kind: images/audio/videos. uid: short hex. ext: png/jpg/mp3/mp4 etc."""
    return f"{APP_NAME}/{kind}/{uid}.{ext}"
