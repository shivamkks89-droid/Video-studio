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
    # Hindi lineup — multilingual_v2 model reads Devanagari in any voice
    {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "Arjun",   "gender": "male",   "language": "hindi", "style": "motivational"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Priya",   "gender": "female", "language": "hindi", "style": "friendly"},
    {"id": "nPczCjzI2devNBz1zQrb", "name": "Karan",   "gender": "male",   "language": "hindi", "style": "professional"},
    {"id": "pFZP5JQG7iQjIQuC4Bku", "name": "Meera",   "gender": "female", "language": "hindi", "style": "warm"},
    {"id": "iP95p4xoKVk53GoZ742B", "name": "Devraj",  "gender": "male",   "language": "hindi", "style": "narrator"},
    {"id": "Xb7hH8MSUJpSbSDYk0k2", "name": "Kaveri",  "gender": "female", "language": "hindi", "style": "calm"},
    # Hinglish lineup — expanded 2 → 6 for richer variety
    {"id": "TX3LPaxmHKxFdv7VOQHJ", "name": "Rohan",   "gender": "male",   "language": "hinglish", "style": "natural"},
    {"id": "cgSgspJ2msm6clMCkdW9", "name": "Anaya",   "gender": "female", "language": "hinglish", "style": "emotional"},
    {"id": "9BWtsMINqrJLrRacOk9x", "name": "Sanya",   "gender": "female", "language": "hinglish", "style": "energetic"},
    {"id": "iP95p4xoKVk53GoZ742B", "name": "Aditya",  "gender": "male",   "language": "hinglish", "style": "friendly"},
    {"id": "XB0fDUnXU5powFXDhCwa", "name": "Ishita",  "gender": "female", "language": "hinglish", "style": "professional"},
    {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "Vikram",  "gender": "male",   "language": "hinglish", "style": "motivational"},
]


def list_voices(language: Optional[str] = None) -> List[dict]:
    if not language or language == "all":
        return INDIAN_VOICES
    return [v for v in INDIAN_VOICES if v["language"] == language]


# In-memory cache for the merged (static + ElevenLabs live) voice catalog.
_LIVE_VOICE_CACHE: dict = {"ts": 0, "voices": None}


async def list_voices_async(force: bool = False) -> List[dict]:
    """Return static + live-fetched ElevenLabs voices, tagged & deduped.

    Live-fetched voices are inspected for Hindi / Hinglish / Indian-English
    accent metadata (from labels + description) and merged into the catalog so
    users of paid ElevenLabs plans automatically see all their available Indian
    voices in the dropdown. Cached for 1 hour.
    """
    import time as _t
    if not force and _LIVE_VOICE_CACHE["voices"] and (_t.time() - _LIVE_VOICE_CACHE["ts"] < 3600):
        return _LIVE_VOICE_CACHE["voices"]
    merged = list(INDIAN_VOICES)  # start from static
    if not ELEVEN_KEY:
        return merged
    try:
        from elevenlabs.client import ElevenLabs
        def _fetch():
            c = ElevenLabs(api_key=ELEVEN_KEY)
            res = c.voices.get_all()
            return getattr(res, "voices", []) or []
        voices = await asyncio.to_thread(_fetch)
        seen_ids = {v["id"] for v in merged}
        for v in voices:
            vid = getattr(v, "voice_id", None)
            if not vid or vid in seen_ids:
                continue
            name = getattr(v, "name", "") or "Voice"
            labels = getattr(v, "labels", {}) or {}
            desc = (getattr(v, "description", "") or "").lower()
            accent = (labels.get("accent") or "").lower()
            lang_meta = (labels.get("language") or "").lower()
            gender = (labels.get("gender") or "").lower() or "male"
            # Classify by accent / language hints
            hay = f"{name.lower()} {desc} {accent} {lang_meta}"
            if "hinglish" in hay:
                lang = "hinglish"
            elif "hindi" in hay or "indian" in accent:
                lang = "hindi"
            elif "indian" in hay:
                lang = "indian_english"
            else:
                continue  # skip non-Indian voices from live catalog
            style = (labels.get("use case") or labels.get("description") or "natural").lower()[:20]
            merged.append({
                "id": vid, "name": name, "gender": gender,
                "language": lang, "style": style, "_source": "elevenlabs_live",
            })
            seen_ids.add(vid)
    except Exception as e:
        print(f"[voices] live fetch failed, using static only: {e}")
    _LIVE_VOICE_CACHE["voices"] = merged
    _LIVE_VOICE_CACHE["ts"] = _t.time()
    return merged


async def clone_voice(name: str, audio_bytes: bytes, description: str = "") -> dict:
    """Clone a voice via ElevenLabs Voice Lab. Returns {voice_id, name} or {error}."""
    if not ELEVEN_KEY:
        return {"error": "ELEVENLABS_API_KEY missing"}
    if not audio_bytes:
        return {"error": "Audio sample required"}
    try:
        import io as _io
        from elevenlabs.client import ElevenLabs
        def _call():
            c = ElevenLabs(api_key=ELEVEN_KEY)
            # New SDK signature: files=[<file-like>]
            f = _io.BytesIO(audio_bytes); f.name = "sample.mp3"
            v = c.voices.ivc.create(name=name, files=[f],
                                    description=description or f"User-cloned voice: {name}")
            return v
        v = await asyncio.to_thread(_call)
        vid = getattr(v, "voice_id", None) or getattr(v, "id", None)
        if not vid:
            return {"error": "Voice clone returned no id"}
        # Invalidate cache so the new voice appears in the catalog immediately.
        _LIVE_VOICE_CACHE["ts"] = 0
        return {"voice_id": vid, "name": name}
    except Exception as e:
        return {"error": f"Voice clone failed: {str(e)[:200]}"}


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
    # Cap at 60s — beyond that Reels/Shorts algorithms deprioritise. Below 5s is not usable.
    duration = min(60, max(5, int(payload.get("duration_sec", 30))))
    audience = payload.get("target_audience") or "general audience"
    cta = payload.get("cta") or "Sign up / Visit website"
    notes = payload.get("extra_notes") or ""
    # Fixed 6-scene structure — matches the storyboard mixer which allocates
    # exactly 4 real product screenshots + 2 AI-rendered scenes.
    scene_count = 6
    per_scene = round(duration / scene_count, 1)
    user_prompt = f"""Write a {duration}-second {video_type.replace('_', ' ')} script.
Topic: {topic}
Language: {language}
Tone: {tone}
Target audience: {audience}
Desired CTA: {cta}
Notes: {notes}

STRUCTURE (STRICT):
- Break into EXACTLY {scene_count} scenes (no more, no less).
- Each scene's `duration` field MUST be a number close to {per_scene} (use decimals if needed).
- The sum of all six `duration` values MUST equal {duration}.
- Scene 1 = hook (grab attention in first {per_scene}s).
- Scenes 2-3 = show real product features (assume product screenshots
  will appear here — write voiceover that names the specific feature being shown).
- Scenes 4-5 = show more real product/UI screenshots (feature deep-dive or benefit).
- Scene 6 = strong CTA scene (voiceover ends on the CTA).

Return JSON only."""
    text = await _claude_send(SCRIPT_SYSTEM, user_prompt)
    parsed = _safe_json(text) or {}
    # Backend guard: if the LLM ignores per-scene duration, distribute the target
    # duration evenly. Also ensure the array has exactly `scene_count` entries.
    scenes = parsed.get("scenes") or []
    if scenes:
        total = sum(float(s.get("duration") or 0) for s in scenes)
        # If durations are missing (sum=0) or way below target, redistribute.
        if total < duration * 0.8 or total > duration * 1.25:
            per = round(duration / len(scenes), 2)
            for s in scenes:
                s["duration"] = per
        parsed["scenes"] = scenes
    parsed["_duration_sec"] = duration
    return parsed


SCORE_SYSTEM = """You are an expert digital marketing performance analyst who has run $50M+ in ad spend across Google Ads, YouTube Ads, Instagram Reels, TikTok, and Meta Ads for the Indian market. Your job is to grade multiple ad script variants side-by-side and predict which will perform best on each channel.

Scoring rubric (0-100 for each metric):
1. hook_strength   - How likely is the first 3 seconds to stop the scroll?
2. retention       - Will viewers watch to the end?
3. cta_strength    - How clear and compelling is the call-to-action?
4. organic_virality - Shareability on Reels/TikTok/Shorts (relatability, emotion, meme potential).
5. google_ads_score - Suitability for Google Ads / YouTube Ads specifically. Deduct heavily for:
     - Policy risks (misleading claims, exaggerated promises, sensational hooks, "guaranteed" language,
       negative emotion baiting, personal attacks, competitor bashing, before/after claims).
     - Lack of clear value proposition in first 5 seconds.
     - No visible product/service in scene descriptions.
   Reward clear benefit, honest promise, and specific CTA.
6. ads_policy_risk - Direct risk of Google/Meta Ads rejection (0=safe, 100=very risky).

Overall composite scores (weighted formula, 0-100):
- organic_composite = 0.30*hook + 0.30*retention + 0.20*cta + 0.20*organic_virality
- google_ads_composite = 0.20*hook + 0.30*retention + 0.30*cta + 0.20*google_ads_score - 0.5*ads_policy_risk (floor 0, cap 100)

Also produce:
- best_for: which channel/audience this variant is optimally suited for (one short phrase).
- top_improvement: single most impactful edit to raise the composite by 10+ points.

Return JSON only. No prose. Schema:
{
  "variants": [
     { "audience": "...", "hook_strength": n, "retention": n, "cta_strength": n,
       "organic_virality": n, "google_ads_score": n, "ads_policy_risk": n,
       "organic_composite": n, "google_ads_composite": n,
       "best_for": "...", "top_improvement": "..." }
  ],
  "winner_organic": "<audience label of the highest organic_composite>",
  "winner_google_ads": "<audience label of the highest google_ads_composite>",
  "reasoning": "One-sentence explanation of why the winners were picked."
}"""


async def score_variants(variants: List[dict], video_type: str, language: str) -> dict:
    """Grade a list of script variants and return performance predictions.

    `variants` is a list of `{audience, label, script}` dicts (as produced by
    the /ai/script/variants endpoint). Skipped variants (with errors) are
    ignored during scoring.
    """
    scorable = [v for v in variants if v.get("script")]
    if not scorable:
        return {"variants": [], "winner_organic": None, "winner_google_ads": None,
                "reasoning": "No variants to score."}

    payload_lines = []
    for i, v in enumerate(scorable):
        s = v["script"]
        payload_lines.append(
            f"### VARIANT {i+1} — {v.get('label')} (audience key: {v.get('audience')})\n"
            f"HOOK: {s.get('hook', '')}\n"
            f"BODY: {s.get('body') or s.get('voiceover_script') or ''}\n"
            f"CTA: {s.get('cta', '')}"
        )
    user_prompt = (
        f"Video type: {video_type}. Language: {language}. Indian market.\n\n"
        f"Grade the following {len(scorable)} ad-script variants using the exact rubric. "
        f"When identifying the winner_organic/winner_google_ads, use the exact `label` string "
        f"from each variant.\n\n" + "\n\n".join(payload_lines)
    )
    text = await _claude_send(SCORE_SYSTEM, user_prompt)
    parsed = _safe_json(text)
    if not isinstance(parsed, dict) or "variants" not in parsed:
        # LLM returned an unexpected shape — degrade gracefully so the caller
        # still gets *something* useful.
        return {"variants": [], "winner_organic": None, "winner_google_ads": None,
                "reasoning": "Scorer returned an unexpected format."}
    return parsed


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
    lang = (language or "english").lower()
    if lang == "hindi":
        lang_instruction = (
            "Language: pure Hindi (Devanagari script). ALL of title, angle, hook "
            "MUST be in Hindi (Devanagari). No English words except product/brand "
            "names. Example title: 'तीन बजे की भूख'. Example hook: "
            "'रात के 3 बजे... क्या खाओगे?'"
        )
    elif lang == "hinglish":
        lang_instruction = (
            "Language: Hinglish (romanized Hindi + English mix, exactly like how "
            "young Indians actually chat on WhatsApp). Use Roman script (no "
            "Devanagari). Example title: 'Bhookh ka scene hai'. Example hook: "
            "'Yaar, 3AM aur pet phir se khali...'"
        )
    else:
        lang_instruction = "Language: clean English suitable for Indian urban audience."

    text = await _claude_send(
        ("You are an ad strategist. Given a brand, website URL, Play Store app ID, "
         "or product idea, output 6 distinct ad concepts. Every idea's `title`, "
         "`angle`, and `hook` MUST be written in the requested language — do NOT "
         "translate to English. "
         "Duration guidelines — pick from 20 / 30 / 45 seconds based on the story's "
         "natural length. Do NOT default to 15s — 15s is too short to deliver a "
         "meaningful hook + body + CTA. Prefer 30s for most ideas. Talking-avatar "
         "and educational concepts should be 45s. Only very simple product highlights "
         "can be 20s. Never suggest 10s or less. "
         "Respond JSON only as: "
         '{"ideas":[{"title":"","angle":"","hook":"","video_type":"cinematic_ad|product_ad|ig_reel|yt_short|tiktok|talking_avatar","duration_sec":30}]}'),
        f"Brand / input: {query}.\n{lang_instruction}",
    )
    data = _safe_json(text)
    ideas = data.get("ideas", []) if isinstance(data, dict) else []
    # Guardrail: enforce a minimum 20s even if the LLM went below.
    for it in ideas:
        d = int(it.get("duration_sec") or 30)
        it["duration_sec"] = max(20, min(60, d))
    return ideas


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
