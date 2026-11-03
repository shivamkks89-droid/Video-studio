"""Uploaded-audio ↔ script matching and narration-driven scene timing (no TTS, audio never altered)."""
import difflib
import re
from typing import List, Optional

_WORD = re.compile(r"[\w']+", re.UNICODE)


def _words(text: str) -> List[str]:
    return _WORD.findall((text or "").lower())


def script_text(project: dict) -> str:
    scenes = project.get("scenes") or []
    txt = " ".join((s.get("voiceover") or "") for s in scenes).strip()
    if txt:
        return txt
    sc = project.get("script") or {}
    return " ".join(str(sc.get(k) or "") for k in ("hook", "body", "cta")).strip() if isinstance(sc, dict) else ""


def silences(segments: list, duration: float, gap: float = 0.7) -> list:
    out, prev = [], 0.0
    for s in segments or []:
        st = float(s.get("start") or 0)
        if st - prev >= gap:
            out.append({"start": round(prev, 2), "end": round(st, 2)})
        prev = max(prev, float(s.get("end") or st))
    if duration and duration - prev >= gap:
        out.append({"start": round(prev, 2), "end": round(duration, 2)})
    return out


def analyze(script: str, transcript: str, segments: list, duration: float, words: Optional[list]) -> dict:
    a, b = _words(script), _words(transcript)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    tokens, missing, extra = [], [], []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            tokens += [{"t": w, "op": "eq"} for w in a[i1:i2]]
        if op in ("delete", "replace"):
            missing += a[i1:i2]
            tokens += [{"t": w, "op": "del"} for w in a[i1:i2]]
        if op in ("insert", "replace"):
            extra += b[j1:j2]
            tokens += [{"t": w, "op": "ins"} for w in b[j1:j2]]
    pct = round(sm.ratio() * 100, 1) if (a and b) else 0.0
    case = "exact" if pct >= 90 else ("partial" if pct >= 55 else "different")
    if not a:
        case = "different"
    return {
        "match_pct": pct, "case": case, "missing": missing[:80], "extra": extra[:80],
        "tokens": tokens[:600], "script_words": len(a), "transcript_words": len(b),
        "silences": silences(segments, duration), "duration": duration,
        "precision": "word" if words else ("phrase" if segments else "estimated"),
    }


def _word_times(segments: list, words: Optional[list]) -> List[float]:
    """End-time of every spoken word (real word timestamps if present, else spread within each phrase)."""
    if words:
        return [float(w.get("end") or 0) for w in words]
    out = []
    for s in segments or []:
        ws = _words(s.get("text") or "")
        st, et = float(s.get("start") or 0), float(s.get("end") or 0)
        for k in range(len(ws)):
            out.append(st + (et - st) * (k + 1) / max(1, len(ws)))
    return out


def scene_timings(scene_texts: List[str], segments: list, duration: float, words: Optional[list]) -> List[dict]:
    """Split the real narration across scenes by word share, snapping cuts to phrase ends (no mid-sentence cuts)."""
    n = len(scene_texts)
    if not n:
        return []
    ends = _word_times(segments, words)
    seg_ends = sorted(float(s.get("end") or 0) for s in segments or [])
    total_w = sum(max(1, len(_words(t))) for t in scene_texts)
    cuts, acc, used = [], 0, set()
    for t in scene_texts[:-1]:
        acc += max(1, len(_words(t)))
        if ends:
            raw = ends[min(len(ends) - 1, int(round(acc / total_w * len(ends))) - 1)]
        else:
            raw = duration * acc / total_w
        snap = min(seg_ends, key=lambda e: abs(e - raw)) if seg_ends else raw
        if snap in used or (cuts and snap <= cuts[-1] + 1.0):
            snap = raw
        used.add(snap)
        cuts.append(snap)
    bounds = [0.0] + cuts + [duration]
    out = []
    for i in range(n):
        st, et = bounds[i], max(bounds[i + 1], bounds[i] + 1.0)
        out.append({"start": round(st, 2), "end": round(et, 2), "duration": round(et - st, 2)})
    return out


def aligned_timings(scene_texts: List[str], words: list, duration: float) -> List[dict]:
    """Cut scenes exactly where each scene's own words start in the spoken audio (content match, not word share)."""
    n = len(scene_texts)
    sw, owner = [], []
    for i, t in enumerate(scene_texts):
        ws = _words(t)
        sw += ws
        owner += [i] * len(ws)
    aw = [(_words(w.get("word") or "") or [""])[0] for w in words]
    m = {}
    for a, b, size in difflib.SequenceMatcher(None, sw, aw, autojunk=False).get_matching_blocks():
        for k in range(size):
            m[a + k] = b + k
    if n < 2 or len(m) < max(3, len(sw) * 0.3):
        return []
    cuts = []
    for i in range(1, n):
        idx = [k for k in range(len(sw)) if owner[k] == i and k in m]
        if idx:
            j = m[idx[0]]
            prev_end = float(words[j - 1]["end"]) if j > 0 else 0.0
            c = (prev_end + float(words[j]["start"])) / 2
        else:
            first = owner.index(i) if i in owner else len(sw)
            c = duration * first / max(1, len(sw))
        cuts.append(c)
    bounds, out = [0.0], []
    for c in cuts:
        bounds.append(max(c, bounds[-1] + 1.5))
    bounds.append(max(duration, bounds[-1] + 1.5))
    for i in range(n):
        out.append({"start": round(bounds[i], 2), "end": round(bounds[i + 1], 2), "duration": round(bounds[i + 1] - bounds[i], 2)})
    return out
