"""Speech-to-Text via emergentintegrations (OpenAI Whisper) — used for auto-timeline
and word-level captions."""
import io
import os
import tempfile
from pathlib import Path
from typing import Optional

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


async def transcribe_audio(audio_bytes: bytes, language: str = "auto") -> dict:
    """Return {text, segments:[{start,end,text}], language} or {error}."""
    if not EMERGENT_KEY:
        return {"error": "EMERGENT_LLM_KEY missing"}
    if not audio_bytes:
        return {"error": "Empty audio"}
    if len(audio_bytes) > 25 * 1024 * 1024:
        return {"error": "Audio must be <25MB for transcription"}
    try:
        from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText  # type: ignore
        stt = OpenAISpeechToText(api_key=EMERGENT_KEY)
        lang_kw = None if language in (None, "", "auto") else language[:2]
        # Whisper accepts a file-like object; give it a name so litellm infers the format.
        buf = io.BytesIO(audio_bytes)
        buf.name = "voice.mp3"
        try:
            resp = await stt.transcribe(
                file=buf,
                model="whisper-1",
                response_format="verbose_json",
                language=lang_kw,
                timestamp_granularities=["word", "segment"],
            )
        finally:
            try: buf.close()
            except Exception: pass
        # Response is a dict-like object with attributes text/segments/language/duration
        def _get(o, k, default=None):
            if isinstance(o, dict):
                return o.get(k, default)
            return getattr(o, k, default)
        text = _get(resp, "text", "")
        segments_raw = _get(resp, "segments") or []
        segments = []
        for s in segments_raw:
            segments.append({
                "start": float(_get(s, "start") or 0),
                "end": float(_get(s, "end") or 0),
                "text": (_get(s, "text") or "").strip(),
            })
        return {
            "text": text,
            "segments": segments,
            "words": [{"word": (_get(w, "word") or "").strip(), "start": float(_get(w, "start") or 0),
                       "end": float(_get(w, "end") or 0)} for w in (_get(resp, "words") or [])],
            "language": _get(resp, "language", lang_kw or "unknown"),
            "duration": _get(resp, "duration"),
        }
    except Exception as e:
        return {"error": f"STT error: {str(e)[:220]}"}


def stt_words(result: dict) -> list:
    words = result.get("words") or []
    if not words:
        for seg in (result.get("segments") or []):
            txt = (seg.get("text") or "").split()
            s, e = float(seg.get("start", 0)), float(seg.get("end", 0) or seg.get("start", 0) + 1)
            d = max(0.1, (e - s) / max(1, len(txt)))
            words += [{"word": w, "start": s + i * d, "end": s + (i + 1) * d} for i, w in enumerate(txt)]
    return [{"word": w.get("word") or w.get("text"), "start": float(w.get("start", 0)), "end": float(w.get("end", 0))}
            for w in words if (w.get("word") or w.get("text"))]
