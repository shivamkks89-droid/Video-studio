"""OpenAI TTS fallback via Emergent LLM key."""
import base64
import os
from typing import Optional


EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


# Map our voice "personality" to OpenAI TTS voices
OPENAI_VOICE_MAP = {
    "professional": "onyx",
    "motivational": "fable",
    "friendly": "nova",
    "emotional": "shimmer",
    "natural": "alloy",
    "warm": "coral",
    "calm": "echo",
    "default": "nova",
}


async def synthesize_openai_tts(text: str, style: str = "default", model: str = "tts-1") -> dict:
    """Returns {audio_url} on success, {error} on failure."""
    if not EMERGENT_KEY:
        return {"error": "EMERGENT_LLM_KEY missing"}
    voice = OPENAI_VOICE_MAP.get(style, "nova")
    # Truncate to 4096 char limit
    text = (text or "").strip()[:4090]
    if not text:
        return {"error": "Empty text"}
    try:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
        tts = OpenAITextToSpeech(api_key=EMERGENT_KEY)
        audio_bytes = await tts.generate_speech(text=text, model=model, voice=voice)
        if not audio_bytes:
            return {"error": "Empty audio"}
        return {"audio_url": "data:audio/mpeg;base64," + base64.b64encode(audio_bytes).decode(),
                "provider": "openai", "voice": voice}
    except Exception as e:
        return {"error": f"OpenAI TTS error: {str(e)[:160]}"}
