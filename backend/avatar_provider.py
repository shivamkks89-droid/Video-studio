"""Provider-agnostic Avatar layer.

Two adapters:
- NanoBananaAvatarProvider: generates avatar STILL images using Gemini Nano Banana
  (works today, no 3rd-party key required beyond EMERGENT_LLM_KEY).
- LipSyncProvider: stub interface — real talking-head lip-sync needs a paid API
  (HeyGen / D-ID / Sync). Stub returns a clear "not configured" error until user
  provides HEYGEN_API_KEY / DID_API_KEY / SYNC_API_KEY.

Adding a new provider = subclass + register in PROVIDERS dict below.
Nothing in the frontend touches provider APIs directly — everything routes
through the /api/avatars/* endpoints in routes_studio.py.
"""
import os
from typing import Optional


class AvatarProvider:
    id: str = "base"
    name: str = "Base"
    supports_generate: bool = False
    supports_lipsync: bool = False

    async def generate_avatar_image(self, prompt: str, style: str = "presenter") -> dict:
        raise NotImplementedError

    async def create_talking_video(self, avatar_url: str, audio_url: str,
                                    words: Optional[list] = None) -> dict:
        raise NotImplementedError


# ---------- Nano Banana adapter (image gen, works today) ----------
class NanoBananaAvatarProvider(AvatarProvider):
    id = "nano_banana"
    name = "Gemini Nano Banana"
    supports_generate = True
    supports_lipsync = False

    async def generate_avatar_image(self, prompt: str, style: str = "presenter") -> dict:
        # Use the same image generation helper as scene generation for consistency.
        from ai_services import generate_scene_image
        style_prompts = {
            "presenter": "professional Indian presenter head-and-shoulders portrait, "
                         "studio lighting, neutral background, direct-to-camera framing",
            "ugc": "casual Indian UGC creator selfie, natural warm home lighting, "
                    "slightly tilted phone angle, authentic",
            "corporate": "business-professional Indian executive, office background bokeh, "
                         "confident smile, sharp suit",
            "influencer": "young Indian lifestyle influencer, magazine-quality lighting, "
                          "trendy outfit, urban backdrop",
            "cinematic": "cinematic close-up portrait, dramatic rim lighting, film-grain, "
                         "shallow depth of field",
        }
        variant = style_prompts.get(style, style_prompts["presenter"])
        full = f"{variant}. {prompt}. 4k photo, no text, no watermark, natural skin, sharp focus"
        img_url = await generate_scene_image(full)
        if not img_url:
            return {"error": "Avatar generation failed"}
        return {"image_url": img_url, "provider": self.id}


# ---------- Lip-sync stub (needs paid 3rd party) ----------
class HeyGenLipSyncProvider(AvatarProvider):
    id = "heygen"
    name = "HeyGen"
    supports_generate = False
    supports_lipsync = True

    async def create_talking_video(self, avatar_url: str, audio_url: str,
                                    words: Optional[list] = None) -> dict:
        if not os.environ.get("HEYGEN_API_KEY"):
            return {"error": "HeyGen provider not configured. Add HEYGEN_API_KEY to backend .env."}
        # Real integration would POST to https://api.heygen.com/v2/video/generate
        # with the avatar image + audio file, poll the job, return the MP4 URL.
        return {"error": "HeyGen SDK adapter not yet implemented in this build."}


class DIDLipSyncProvider(AvatarProvider):
    id = "did"
    name = "D-ID"
    supports_generate = False
    supports_lipsync = True

    async def create_talking_video(self, avatar_url: str, audio_url: str,
                                    words: Optional[list] = None) -> dict:
        if not os.environ.get("DID_API_KEY"):
            return {"error": "D-ID provider not configured. Add DID_API_KEY to backend .env."}
        return {"error": "D-ID SDK adapter not yet implemented in this build."}


# ---------- registry ----------
PROVIDERS = {
    "nano_banana": NanoBananaAvatarProvider(),
    "heygen": HeyGenLipSyncProvider(),
    "did": DIDLipSyncProvider(),
}


def get_generator() -> AvatarProvider:
    """Return the first configured provider that supports avatar image generation."""
    return PROVIDERS["nano_banana"]  # always available


def get_lipsync() -> Optional[AvatarProvider]:
    """Return the first CONFIGURED lipsync provider or None."""
    for p_id in ("heygen", "did"):
        p = PROVIDERS.get(p_id)
        if p and p.supports_lipsync:
            if os.environ.get(f"{p_id.upper()}_API_KEY"):
                return p
    return None


def provider_status() -> dict:
    """Frontend-friendly capability listing."""
    return {
        "generators": [
            {"id": p.id, "name": p.name, "configured": True,
             "supports": ["image_generation"]}
            for p in PROVIDERS.values() if p.supports_generate
        ],
        "lipsync": [
            {"id": p.id, "name": p.name,
             "configured": bool(os.environ.get(f"{p.id.upper()}_API_KEY")),
             "supports": ["talking_video"]}
            for p in PROVIDERS.values() if p.supports_lipsync
        ],
    }
