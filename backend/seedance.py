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

import fal_client

# Model IDs on fal.ai (bytedance seedance family). Lite = cheaper/faster, Pro = higher quality.
MODEL_T2V = os.environ.get("SEEDANCE_T2V_MODEL", "fal-ai/bytedance/seedance/v1/lite/text-to-video")
MODEL_I2V = os.environ.get("SEEDANCE_I2V_MODEL", "fal-ai/bytedance/seedance/v1/lite/image-to-video")

# Fall-back model IDs if the primary route 404s (fal renames endpoints occasionally).
_T2V_FALLBACKS = [
    "fal-ai/bytedance/seedance/v1/pro/text-to-video",
]
_I2V_FALLBACKS = [
    "fal-ai/bytedance/seedance/v1/pro/image-to-video",
]


class SeedanceError(RuntimeError):
    pass


def _clamp_duration(d: Optional[float]) -> int:
    """Seedance supports 5s or 10s clips."""
    if not d:
        return 5
    return 10 if d >= 8 else 5


def _resolution_for(aspect_ratio: str) -> str:
    """Seedance supports 480p / 720p / 1080p."""
    return "720p"


async def _submit_with_fallback(models: list[str], arguments: dict) -> dict:
    """Submit to fal, trying fallback models on 404/unknown-model errors."""
    last_err: Optional[Exception] = None
    for m in models:
        try:
            handler = await fal_client.submit_async(m, arguments=arguments)
            return await handler.get()
        except Exception as e:  # noqa: BLE001
            last_err = e
            msg = str(e).lower()
            # Only try fallbacks for model-not-found style errors
            if "not found" in msg or "404" in msg or "no such" in msg or "unknown" in msg:
                continue
            # Any other error (bad input, quota, etc.) — abort immediately
            raise SeedanceError(f"{m}: {e}") from e
    raise SeedanceError(f"All Seedance model routes failed. Last error: {last_err}")


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
    if not os.environ.get("FAL_KEY"):
        raise SeedanceError("FAL_KEY is not configured on the server.")
    dur = _clamp_duration(duration_seconds)
    args = {
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": _resolution_for(aspect_ratio),
        "duration": str(dur),
    }
    result = await _submit_with_fallback([MODEL_T2V] + _T2V_FALLBACKS, args)
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
    if not os.environ.get("FAL_KEY"):
        raise SeedanceError("FAL_KEY is not configured on the server.")
    if not image_url:
        raise SeedanceError("image_url is required for image-to-video mode.")
    dur = _clamp_duration(duration_seconds)
    args = {
        "image_url": image_url,
        "prompt": prompt or "cinematic subtle motion, natural camera movement",
        "aspect_ratio": aspect_ratio,
        "resolution": _resolution_for(aspect_ratio),
        "duration": str(dur),
    }
    result = await _submit_with_fallback([MODEL_I2V] + _I2V_FALLBACKS, args)
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
