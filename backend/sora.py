"""OpenAI Sora 2 video generation via the Emergent Universal LLM Key.

Only text-to-video is exposed today (image-to-video is not in the current
`emergentintegrations` playbook). Sora 2 supports 4/8/12s clips at fixed sizes
listed below — the caller must map arbitrary aspect ratios onto these.
"""
from __future__ import annotations

import asyncio
import os
from typing import Optional

from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration


class SoraError(RuntimeError):
    pass


# Sora 2 supported sizes → mapped from our aspect ratios
_ASPECT_TO_SIZE = {
    "9:16": "1024x1792",
    "16:9": "1792x1024",
    "1:1": "1024x1024",
}


def _clamp_duration(seconds: Optional[float]) -> int:
    """Sora 2 accepts 4, 8, or 12 seconds only."""
    if not seconds:
        return 4
    s = int(seconds)
    if s <= 4:
        return 4
    if s <= 8:
        return 8
    return 12


async def text_to_video(
    prompt: str,
    aspect_ratio: str = "9:16",
    duration_seconds: Optional[float] = 4,
    model: str = "sora-2",
) -> bytes:
    """Generate a Sora 2 video and return the raw MP4 bytes.

    Runs the blocking SDK call in a worker thread so the FastAPI event loop
    stays responsive during the 2-5 minute generation window.
    """
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise SoraError("EMERGENT_LLM_KEY is not configured on the server.")
    size = _ASPECT_TO_SIZE.get(aspect_ratio, "1024x1792")
    duration = _clamp_duration(duration_seconds)

    def _run() -> bytes:
        try:
            gen = OpenAIVideoGeneration(api_key=key)
            data = gen.text_to_video(
                prompt=prompt,
                model=model,
                size=size,
                duration=duration,
                max_wait_time=900,
            )
        except Exception as e:  # noqa: BLE001
            raise SoraError(f"Sora 2 error: {e}") from e
        if not data:
            raise SoraError("Sora 2 returned no video bytes.")
        return data

    return await asyncio.to_thread(_run)
