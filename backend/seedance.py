"""ByteDance Seedance video generation via fal.ai.

Two modes:
- text_to_video: pure prompt-driven clip
- image_to_video: animate a still (recommended — costs less, better subject consistency)

Both return a public MP4 URL from fal.ai. Caller is responsible for downloading /
mirroring the file if long-term persistence is needed.
"""
from __future__ import annotations

import asyncio
import os
from typing import Optional

import time
from urllib.parse import urlparse

import requests

# Fal Universal Key supports queue inference through Emergent proxy only, not Fal Platform APIs.
_PROXY = os.environ.get("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com").rstrip("/") + "/api/v1/fal"

MODEL_T2V = "fal-ai/bytedance/seedance/v1/pro/text-to-video"
MODEL_I2V = "fal-ai/bytedance/seedance/v1/pro/image-to-video"


class SeedanceError(RuntimeError):
    pass


def _clamp_duration(d: Optional[float]) -> int:
    """Seedance supports 5s or 10s clips."""
    if not d:
        return 5
    return max(2, min(12, int(round(d))))


def _resolution_for(aspect_ratio: str) -> str:
    """Seedance supports 480p / 720p / 1080p."""
    return "720p"


def _headers(extra: Optional[dict] = None) -> dict:
    h = {"Authorization": f"Bearer {os.environ['EMERGENT_LLM_KEY']}", "Content-Type": "application/json"}
    for env, names in (("job_id", ("X-App-ID", "X-Job-ID")), ("run_id", ("X-Environment-ID",))):
        if os.environ.get(env):
            for n in names:
                h[n] = os.environ[env]
    h.update(extra or {})
    return h


def _trusted(url: str) -> str:
    c, q = urlparse(url), urlparse(_PROXY + "/queue/")
    if c.scheme != q.scheme or c.netloc != q.netloc or not c.path.startswith(q.path):
        raise SeedanceError("Untrusted queue URL from proxy")
    return url


def _get(url: str, deadline: float) -> dict:
    delay = 1
    for attempt in range(5):
        try:
            r = requests.get(url, headers=_headers(), timeout=max(1, min(60, deadline - time.monotonic())))
            r.raise_for_status()
            return r.json()
        except (requests.ConnectTimeout, requests.ReadTimeout, requests.ConnectionError):
            if attempt == 4 or time.monotonic() + delay > deadline:
                raise SeedanceError("Video polling failed after network errors")
            time.sleep(delay)
            delay *= 2


def _run(endpoint: str, payload: dict, timeout_s: int = 900) -> dict:
    r = requests.post(f"{_PROXY}/proxy", json=payload, timeout=60,
                      headers=_headers({"X-Fal-Target-Url": f"https://queue.fal.run/{endpoint}"}))
    if r.status_code == 402:
        raise SeedanceError("Universal Key balance exhausted — top up to generate video clips.")
    if r.status_code >= 400:
        raise SeedanceError(f"{r.status_code}: {r.text[:300]}")
    sub = r.json()
    status_url, response_url = _trusted(sub["status_url"]), _trusted(sub["response_url"])
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        st = _get(status_url, deadline)
        status = (st.get("status") or "").upper()
        if status in {"COMPLETED", "OK"}:
            if st.get("error"):
                raise SeedanceError(f"Generation failed: {st['error']}")
            return _get(response_url, deadline)
        if status in {"FAILED", "CANCELLED", "CANCELED", "ERROR"}:
            raise SeedanceError(f"Generation failed: {status}")
        time.sleep(3)
    raise SeedanceError("Timed out waiting for video generation")


async def _submit_with_fallback(models: list, arguments: dict) -> dict:
    return await asyncio.to_thread(_run, models[0], arguments)


def _extract_video_url(result: dict) -> Optional[str]:
    """Handle the different result shapes fal returns."""
    if not result:
        return None
    # Common shape: {"video": {"url": "..."}}
    if isinstance(result.get("video"), dict) and result["video"].get("url"):
        return result["video"]["url"]
    if isinstance(result.get("video"), str):
        return result["video"]
    # Alternate shape: {"video_url": "..."} or {"output": [...]}
    if result.get("video_url"):
        return result["video_url"]
    if isinstance(result.get("output"), list) and result["output"]:
        first = result["output"][0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict) and first.get("url"):
            return first["url"]
    if isinstance(result.get("videos"), list) and result["videos"]:
        first = result["videos"][0]
        if isinstance(first, dict) and first.get("url"):
            return first["url"]
    return None


async def text_to_video(
    prompt: str,
    aspect_ratio: str = "9:16",
    duration_seconds: Optional[float] = 5,
) -> str:
    """Generate a cinematic video clip from a text prompt. Returns MP4 URL."""
    dur = _clamp_duration(duration_seconds)
    args = {
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": _resolution_for(aspect_ratio),
        "duration": str(dur),
    }
    result = await _submit_with_fallback([MODEL_T2V], args)
    url = _extract_video_url(result)
    if not url:
        raise SeedanceError(f"Seedance returned no video URL. Payload: {result}")
    return url


async def image_to_video(
    image_url: str,
    prompt: str = "",
    aspect_ratio: str = "9:16",
    duration_seconds: Optional[float] = 5,
) -> str:
    """Animate a still image into a natural-motion clip. Returns MP4 URL.

    `image_url` must be publicly reachable OR a data URI. If it's a `/api/files/...`
    relative path, the caller must upgrade it to an absolute URL first.
    """
    if not image_url:
        raise SeedanceError("image_url is required for image-to-video mode.")
    if image_url.startswith("http"):
        import base64
        try:
            b = await download_to_bytes(image_url, timeout=30)
        except Exception as e:
            raise SeedanceError(f"Scene image fetch failed: {e}") from e
        image_url = ("data:image/jpeg;base64," if b[:2] == b"\xff\xd8" else "data:image/png;base64,") + base64.b64encode(b).decode()
    dur = _clamp_duration(duration_seconds)
    args = {
        "image_url": image_url,
        "prompt": prompt or "cinematic subtle motion, natural camera movement",
        "aspect_ratio": aspect_ratio,
        "resolution": _resolution_for(aspect_ratio),
        "duration": str(dur),
    }
    result = await _submit_with_fallback([MODEL_I2V], args)
    url = _extract_video_url(result)
    if not url:
        raise SeedanceError(f"Seedance returned no video URL. Payload: {result}")
    return url


async def download_to_bytes(url: str, timeout: float = 60.0) -> bytes:
    """Download a fal-hosted MP4 so we can persist it into our own object store."""
    import httpx
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.content


# --- Sync wrapper for CLI / test ---
if __name__ == "__main__":  # pragma: no cover
    import sys
    from dotenv import load_dotenv
    load_dotenv()
    prompt = sys.argv[1] if len(sys.argv) > 1 else "A neon-lit Mumbai street at night, slow dolly forward"
    print("Generating…")
    out = asyncio.run(text_to_video(prompt))
    print("OK:", out)
