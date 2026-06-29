"""AI service wrappers: Claude script gen, Nano Banana scene images, ElevenLabs TTS."""
import asyncio
import base64
import io
import json
import os
import re
from typing import List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage


EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
ELEVEN_KEY = os.environ.get("ELEVENLABS_API_KEY", "")


# ---------- Indian / Multilingual voice catalog (ElevenLabs voice IDs) ----------
INDIAN_VOICES = [
    {"id": "9BWtsMINqrJLrRacOk9x", "name": "Aria", "gender": "female", "language": "english", "style": "professional"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "gender": "female", "language": "english", "style": "friendly"},
    {"id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Liam", "gender": "male", "language": "english", "style": "professional"},
    {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "George", "gender": "male", "language": "english", "style": "motivational"},
    {"id": "cgSgspJ2msm6clMCkdW9", "name": "Jessica", "gender": "female", "language": "english", "style": "emotional"},
    {"id": "iP95p4xoKVk53GoZ742B", "name": "Chris", "gender": "male", "language": "english", "style": "natural"},
    {"id": "nPczCjzI2devNBz1zQrb", "name": "Brian", "gender": "male", "language": "english", "style": "professional"},
    {"id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "gender": "female", "language": "english", "style": "natural"},
    {"id": "pFZP5JQG7iQjIQuC4Bku", "name": "Lily", "gender": "female", "language": "english", "style": "friendly"},
    {"id": "Xb7hH8MSUJpSbSDYk0k2", "name": "Alice", "gender": "female", "language": "english", "style": "professional"},
    # Tag a few for Hindi/Hinglish — multilingual_v2 supports all
    {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "Arjun", "gender": "male", "language": "hindi", "style": "motivational"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Priya", "gender": "female", "language": "hindi", "style": "friendly"},
    {"id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Rohan", "gender": "male", "language": "hinglish", "style": "natural"},
    {"id": "cgSgspJ2msm6clMCkdW9", "name": "Anaya", "gender": "female", "language": "hinglish", "style": "emotional"},
]


def list_voices(language: Optional[str] = None) -> List[dict]:
    if not language or language == "all":
        return INDIAN_VOICES
    return [v for v in INDIAN_VOICES if v["language"] == language]


# ---------- Claude script generation ----------
SCRIPT_SYSTEM = """You are CineReel, a world-class scriptwriter for cinematic ads, social media reels and AI avatar videos.
You write punchy, viral, conversion-driven scripts.

You ALWAYS respond with valid JSON only (no markdown, no commentary), in this exact schema:
{
  "hook": "string (first 3-5 seconds, scroll-stopping)",
  "body": "string (main narrative)",
  "cta": "string (clear call-to-action)",
  "voiceover_script": "string (the full clean spoken text, language-appropriate)",
  "scenes": [
    {
      "index": 1,
      "duration": 5,
      "voiceover": "what is spoken in this scene",
      "visual_prompt": "cinematic prompt to feed an image generator (subject, environment, mood)",
      "camera": "wide shot / close-up / tracking / dolly-in / drone aerial / etc.",
      "lighting": "golden hour / neon noir / soft daylight / volumetric god rays / etc.",
      "motion": "zoom-in / parallax / static / slow pan / dynamic / etc.",
      "broll": "complementary B-roll suggestion"
    }
  ],
  "captions": ["short on-screen caption lines"],
  "music_mood": "string (e.g., uplifting cinematic, lo-fi, epic trailer)"
}

Rules:
- Match the requested language exactly. Hinglish = mix Hindi-Devanagari/transliterated with English casually.
- Scenes must total roughly the requested duration in seconds.
- Hooks must stop the scroll: question, bold claim, or contrarian idea.
- CTA must be specific and trackable."""


async def generate_script(payload: dict) -> dict:
    topic = payload["topic"]
    video_type = payload.get("video_type", "cinematic_ad")
    language = payload.get("language", "english")
    tone = payload.get("tone", "professional")
    duration = payload.get("duration_sec", 30)
    audience = payload.get("target_audience") or "general audience"
    cta = payload.get("cta") or "Sign up / Visit website"
    notes = payload.get("extra_notes") or ""

    user_prompt = f"""Write a {duration}-second {video_type.replace('_', ' ')} script.
Topic: {topic}
Language: {language}
Tone: {tone}
Target audience: {audience}
Desired CTA: {cta}
Notes: {notes}

Break into {max(3, min(8, duration // 5))} scenes. Return JSON only."""

    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"script-{os.urandom(4).hex()}",
        system_message=SCRIPT_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    resp = await chat.send_message(UserMessage(text=user_prompt))
    text = resp if isinstance(resp, str) else str(resp)
    return _safe_json(text)


async def generate_hooks(topic: str, language: str, count: int = 5) -> List[str]:
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"hooks-{os.urandom(4).hex()}",
        system_message="You write scroll-stopping video hooks. Respond with a JSON array of strings only.",
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    resp = await chat.send_message(
        UserMessage(text=f"Give {count} viral hook lines in {language} for: {topic}. JSON array only.")
    )
    text = resp if isinstance(resp, str) else str(resp)
    data = _safe_json(text)
    if isinstance(data, list):
        return data
    return data.get("hooks", []) if isinstance(data, dict) else []


async def generate_ctas(topic: str, language: str, count: int = 5) -> List[str]:
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"ctas-{os.urandom(4).hex()}",
        system_message="You write high-converting call-to-action lines. Respond with a JSON array of strings only.",
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    resp = await chat.send_message(
        UserMessage(text=f"Give {count} powerful CTAs in {language} for: {topic}. JSON array only.")
    )
    text = resp if isinstance(resp, str) else str(resp)
    data = _safe_json(text)
    if isinstance(data, list):
        return data
    return data.get("ctas", []) if isinstance(data, dict) else []


async def suggest_ad_ideas(query: str, language: str = "english") -> List[dict]:
    """Auto-suggest ad ideas from a website URL, Play Store app ID, or topic keyword."""
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"ideas-{os.urandom(4).hex()}",
        system_message=(
            "You are an ad strategist. Given a brand, website URL, Play Store app ID, "
            "or product idea, output 6 distinct ad concepts. Respond JSON only as: "
            '{"ideas":[{"title":"","angle":"","hook":"","video_type":"cinematic_ad|product_ad|ig_reel|yt_short|tiktok|talking_avatar","duration_sec":15}]}'
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    resp = await chat.send_message(
        UserMessage(text=f"Brand / input: {query}. Language: {language}.")
    )
    text = resp if isinstance(resp, str) else str(resp)
    data = _safe_json(text)
    return data.get("ideas", []) if isinstance(data, dict) else []


def _safe_json(text: str):
    """Robustly parse JSON from LLM text output."""
    text = text.strip()
    # strip markdown fences
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        # try to find first {...} or [...] block
        m = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
    return {"raw": text}


# ---------- Gemini Nano Banana image generation ----------
async def generate_scene_image(prompt: str, aspect_ratio: str = "9:16") -> Optional[str]:
    """Returns base64 data URL of the generated image, or None on failure."""
    try:
        from emergentintegrations.llm.chat import LlmChat as _Chat, UserMessage as _Msg
        chat = _Chat(
            api_key=EMERGENT_KEY,
            session_id=f"img-{os.urandom(4).hex()}",
            system_message="You generate cinematic still images.",
        ).with_model("gemini", "gemini-2.5-flash-image-preview")
        full_prompt = f"Cinematic photo, {aspect_ratio} aspect ratio. {prompt}. High detail, professional lighting, no text overlays."
        resp = await chat.send_message(_Msg(text=full_prompt))
        # emergentintegrations image-capable models may return a dict / bytes / string
        if isinstance(resp, dict):
            for k in ("image", "image_b64", "data", "url"):
                v = resp.get(k)
                if isinstance(v, str) and v.startswith("data:"):
                    return v
                if isinstance(v, str) and len(v) > 200:
                    return f"data:image/png;base64,{v}"
        if isinstance(resp, (bytes, bytearray)):
            return "data:image/png;base64," + base64.b64encode(resp).decode()
        if isinstance(resp, str) and resp.startswith("data:image"):
            return resp
    except Exception as e:
        print(f"[Image gen error] {e}")
    return None


# ---------- ElevenLabs TTS ----------
async def synthesize_speech(text: str, voice_id: str, stability: float = 0.55,
                            similarity_boost: float = 0.75, style: float = 0.3) -> Optional[str]:
    """Returns a data: URL containing the MP3."""
    if not ELEVEN_KEY:
        return None
    try:
        from elevenlabs.client import ElevenLabs
        # Run blocking SDK in thread
        def _call():
            client = ElevenLabs(api_key=ELEVEN_KEY)
            audio_iter = client.text_to_speech.convert(
                text=text,
                voice_id=voice_id,
                model_id="eleven_multilingual_v2",
                voice_settings={
                    "stability": stability,
                    "similarity_boost": similarity_boost,
                    "style": style,
                    "use_speaker_boost": True,
                },
            )
            buf = b""
            for chunk in audio_iter:
                if chunk:
                    buf += chunk
            return buf
        audio = await asyncio.to_thread(_call)
        return "data:audio/mpeg;base64," + base64.b64encode(audio).decode()
    except Exception as e:
        print(f"[TTS error] {e}")
        return None
