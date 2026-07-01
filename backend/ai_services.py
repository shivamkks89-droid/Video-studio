"""AI service wrappers: Claude script gen, Nano Banana scene images, ElevenLabs TTS."""
import asyncio
import base64
import json
import os
import re
from typing import List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage


EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
ELEVEN_KEY = os.environ.get("ELEVENLABS_API_KEY", "")


# ---------- Voice catalog ----------
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
    {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "Arjun", "gender": "male", "language": "hindi", "style": "motivational"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Priya", "gender": "female", "language": "hindi", "style": "friendly"},
    {"id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Rohan", "gender": "male", "language": "hinglish", "style": "natural"},
    {"id": "cgSgspJ2msm6clMCkdW9", "name": "Anaya", "gender": "female", "language": "hinglish", "style": "emotional"},
]


def list_voices(language: Optional[str] = None) -> List[dict]:
    if not language or language == "all":
        return INDIAN_VOICES
    return [v for v in INDIAN_VOICES if v["language"] == language]


# ---------- LLM helpers ----------
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
      "visual_prompt": "cinematic prompt to feed an image generator (subject, environment, mood). NEVER include a fake brand name, logo text, app-store badge or any made-up wordmark in the visual_prompt.",
      "camera": "wide shot / close-up / tracking / dolly-in / drone aerial / etc.",
      "lighting": "golden hour / neon noir / soft daylight / volumetric god rays / etc.",
      "motion": "zoom-in / parallax / static / slow pan / dynamic / etc.",
      "broll": "complementary B-roll suggestion"
    }
  ],
  "captions": ["short on-screen caption lines"],
  "music_mood": "string (e.g., uplifting cinematic, lo-fi, epic trailer)"
}

CRITICAL RULES — read carefully:
- If REAL APP / WEBSITE INFO is provided in the user message, use ONLY that brand name. Never alter it. Never invent additional product names.
- If NO real brand info is provided, you MUST NOT invent a brand name or app name. Use the token [BRAND] wherever a brand name would go (in hook, body, cta, voiceover_script, captions). Do NOT write "HeartLink", "FitWell", "QuickPay" or any other made-up wordmark. Use the placeholder [BRAND].
- visual_prompt MUST NOT contain any fake logos, fake wordmarks, fake app icons, app-store badges or fake brand text. Describe the SCENE only (people, environment, action, mood).
- Match the requested language exactly. Hinglish = mix Hindi/English casually.
- Scenes must total roughly the requested duration in seconds.
- Hooks must stop the scroll: question, bold claim, or contrarian idea.
- CTA must be specific and trackable."""


class AIServiceError(Exception):
    """Raised when an AI provider returns an error (so the API can refund credits)."""


async def _claude_send(system: str, user: str) -> str:
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"sess-{os.urandom(4).hex()}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    try:
        resp = await chat.send_message(UserMessage(text=user))
    except Exception as e:
        raise AIServiceError(f"LLM error: {e}") from e
    return resp if isinstance(resp, str) else str(resp)


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
    text = await _claude_send(SCRIPT_SYSTEM, user_prompt)
    return _safe_json(text)


async def generate_hooks(topic: str, language: str, count: int = 5) -> List[str]:
    text = await _claude_send(
        "You write scroll-stopping video hooks. Respond with a JSON array of strings only.",
        f"Give {count} viral hook lines in {language} for: {topic}. JSON array only.",
    )
    data = _safe_json(text)
    if isinstance(data, list):
        return data
    return data.get("hooks", []) if isinstance(data, dict) else []


async def generate_ctas(topic: str, language: str, count: int = 5) -> List[str]:
    text = await _claude_send(
        "You write high-converting call-to-action lines. Respond with a JSON array of strings only.",
        f"Give {count} powerful CTAs in {language} for: {topic}. JSON array only.",
    )
    data = _safe_json(text)
    if isinstance(data, list):
        return data
    return data.get("ctas", []) if isinstance(data, dict) else []


async def suggest_ad_ideas(query: str, language: str = "english") -> List[dict]:
    text = await _claude_send(
        ("You are an ad strategist. Given a brand, website URL, Play Store app ID, "
         "or product idea, output 6 distinct ad concepts. Respond JSON only as: "
         '{"ideas":[{"title":"","angle":"","hook":"","video_type":"cinematic_ad|product_ad|ig_reel|yt_short|tiktok|talking_avatar","duration_sec":15}]}'),
        f"Brand / input: {query}. Language: {language}.",
    )
    data = _safe_json(text)
    return data.get("ideas", []) if isinstance(data, dict) else []


def _safe_json(text: str):
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
    return {"raw": text}


# ---------- Gemini Nano Banana image generation ----------
async def generate_scene_image(prompt: str, aspect_ratio: str = "9:16") -> Optional[str]:
    """Returns a data: URL of a PNG image, or None on failure."""
    try:
        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"img-{os.urandom(4).hex()}",
            system_message="You generate cinematic still images.",
        ).with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        prompt_lower = prompt.lower()
        has_phone = any(k in prompt_lower for k in ("phone", "smartphone", "mobile", "device", "screen"))
        has_person = any(k in prompt_lower for k in ("person", "man", "woman", "hand", "user", "people", "people's"))
        orientation_hint = ""
        if has_phone:
            orientation_hint = (
                " The smartphone MUST be held upright in natural portrait orientation, "
                "screen facing directly toward the camera and clearly visible, "
                "fingers gripping the sides naturally (not inverted, not upside down, "
                "not rotated, screen not hidden). Realistic human hand anatomy."
            )
        elif has_person:
            orientation_hint = " Realistic human anatomy, hands and fingers correctly proportioned, natural pose."
        full_prompt = (
            f"Cinematic photograph, {aspect_ratio} vertical aspect ratio. {prompt}."
            f"{orientation_hint} "
            f"Ultra high detail, 8K quality, professional cinematography, sharp focus, "
            f"studio-grade lighting, magazine-quality composition. "
            f"Absolutely NO text, NO captions, NO logos, NO watermarks, NO subtitles anywhere in the image."
        )
        text, images = await chat.send_message_multimodal_response(UserMessage(text=full_prompt))
        if not images:
            print(f"[Image gen] no images returned; text={text[:120] if text else ''}")
            return None
        img = images[0]
        mime = img.get("mime_type", "image/png")
        data = img.get("data", "")
        if not data:
            return None
        return f"data:{mime};base64,{data}"
    except Exception as e:
        print(f"[Image gen error] {e}")
        return None


# ---------- ElevenLabs TTS ----------
async def synthesize_speech(text: str, voice_id: str, stability: float = 0.55,
                            similarity_boost: float = 0.75, style: float = 0.3) -> dict:
    """Returns {audio_url} on success or {error} on failure (so the route can refund credits)."""
    if not ELEVEN_KEY:
        return {"error": "ELEVENLABS_API_KEY missing"}
    try:
        from elevenlabs.client import ElevenLabs
        from elevenlabs.core.api_error import ApiError  # type: ignore

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
        if not audio:
            return {"error": "Empty audio"}
        return {"audio_url": "data:audio/mpeg;base64," + base64.b64encode(audio).decode()}
    except Exception as e:  # ApiError or generic
        msg = str(e)
        if "paid_plan_required" in msg or "Free users cannot use library voices" in msg:
            return {"error": "Your ElevenLabs plan does not allow this voice. Please upgrade ElevenLabs or clone a voice into your library."}
        return {"error": f"Voice service error: {msg[:160]}"}
