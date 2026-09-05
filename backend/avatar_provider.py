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


# ---------- fal.ai Lip-sync (pay-per-use, uses existing FAL_KEY) ----------
class FalLipSyncProvider(AvatarProvider):
    id = "fal"
    name = "fal.ai (Sync-1.6)"
    supports_generate = False
    supports_lipsync = True

    async def create_talking_video(self, avatar_url: str, audio_url: str,
                                    words: Optional[list] = None) -> dict:
        if not os.environ.get("FAL_KEY"):
            return {"error": "fal.ai not configured. Add FAL_KEY to backend .env "
                             "(same key as Seedance)."}
        try:
            import fal_client  # type: ignore
            # Public URLs required — the frontend's asset URLs work because our
            # /api/files/* routes serve them publicly.
            handler = fal_client.submit(
                "fal-ai/sync-lipsync",
                arguments={
                    "video_url": avatar_url,   # can be an image too — sync-lipsync accepts still portraits
                    "audio_url": audio_url,
                    "sync_mode": "cut_off",
                    "model": "lipsync-1.9.0-beta",
                },
            )
            result = handler.get()
            video_url = (result or {}).get("video", {}).get("url") if isinstance(result, dict) else None
            if not video_url:
                return {"error": f"fal.ai lipsync returned no video. Raw: {str(result)[:200]}"}
            return {"video_url": video_url, "provider": self.id}
        except Exception as e:
            return {"error": f"fal.ai lipsync failed: {str(e)[:200]}"}


# ---------- Sync.so (has free API tier) ----------
class SyncLipSyncProvider(AvatarProvider):
    id = "sync"
    name = "Sync.so (Free tier)"
    supports_generate = False
    supports_lipsync = True

    async def create_talking_video(self, avatar_url: str, audio_url: str,
                                    words: Optional[list] = None) -> dict:
        if not os.environ.get("SYNC_API_KEY"):
            return {"error": ("Sync.so not configured. Add SYNC_API_KEY to backend .env. "
                              "Sign up at sync.so — they include API access in their free tier.")}
        return {"error": "Sync.so SDK adapter available on request — send us your API key."}


# ---------- registry ----------
PROVIDERS = {
    "nano_banana": NanoBananaAvatarProvider(),
    "fal": FalLipSyncProvider(),
    "sync": SyncLipSyncProvider(),
    "heygen": HeyGenLipSyncProvider(),
    "did": DIDLipSyncProvider(),
}


def get_generator() -> AvatarProvider:
    """Return the first configured provider that supports avatar image generation."""
    return PROVIDERS["nano_banana"]  # always available


def get_lipsync() -> Optional[AvatarProvider]:
    """Return the first CONFIGURED lipsync provider or None.
    Priority: fal (uses existing FAL_KEY) > sync > heygen > did."""
    for p_id in ("fal", "sync", "heygen", "did"):
        p = PROVIDERS.get(p_id)
        if not p or not p.supports_lipsync:
            continue
        env_key = "FAL_KEY" if p_id == "fal" else f"{p_id.upper()}_API_KEY"
        if os.environ.get(env_key):
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
             "configured": bool(os.environ.get(
                 "FAL_KEY" if p.id == "fal" else f"{p.id.upper()}_API_KEY"
             )),
             "supports": ["talking_video"]}
            for p in PROVIDERS.values() if p.supports_lipsync
        ],
    }
