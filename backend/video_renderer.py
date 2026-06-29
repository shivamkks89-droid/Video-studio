"""Video renderer — combines storyboard images + voiceover into an MP4 via ffmpeg."""
import asyncio
import base64
import os
import re
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional


STATIC_DIR = Path(__file__).parent / "static" / "videos"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
IMG_DIR = Path(__file__).parent / "static" / "images"
AUD_DIR = Path(__file__).parent / "static" / "audio"


def _data_uri_to_bytes(data_uri: str) -> Optional[bytes]:
    if not data_uri or "," not in data_uri:
        return None
    try:
        return base64.b64decode(data_uri.split(",", 1)[1])
    except Exception:
        return None


def _audio_to_bytes(url: str) -> Optional[bytes]:
    if not url:
        return None
    if url.startswith("data:"):
        return _data_uri_to_bytes(url)
    if url.startswith("/api/files/audio/"):
        name = url.rsplit("/", 1)[-1]
        p = AUD_DIR / name
        if p.exists():
            try:
                return p.read_bytes()
            except Exception:
                return None
    return None


def _image_to_bytes(image_url: str) -> Optional[bytes]:
    """Accept either a data: URI or /api/files/images/<file> reference."""
    if not image_url:
        return None
    if image_url.startswith("data:"):
        return _data_uri_to_bytes(image_url)
    if image_url.startswith("/api/files/images/"):
        name = image_url.rsplit("/", 1)[-1]
        p = IMG_DIR / name
        if p.exists():
            try:
                return p.read_bytes()
            except Exception:
                return None
    return None


def _aspect_dims(aspect: str) -> tuple:
    if aspect == "16:9":
        return 1920, 1080
    if aspect == "1:1":
        return 1080, 1080
    return 1080, 1920  # default 9:16


def _safe_filter(text: str) -> str:
    """Make text safe for ffmpeg drawtext."""
    if not text:
        return ""
    text = text.replace("'", "").replace(":", " ").replace("\\", "")
    text = re.sub(r"[^\w\s.,!?-]", "", text)
    return text[:120]


async def render_video(scenes: List[dict], audio_data_uri: Optional[str],
                       aspect_ratio: str = "9:16", fps: int = 30,
                       default_scene_seconds: float = 3.5) -> Optional[str]:
    """Render an MP4 from a list of scenes (each with image_url + voiceover/duration).
    Returns the relative path under static/videos/<uuid>.mp4 on success, else None."""

    images = []
    for sc in scenes:
        url = sc.get("image_url") or ""
        b = _image_to_bytes(url)
        if b:
            images.append({"bytes": b,
                           "duration": float(sc.get("duration") or default_scene_seconds),
                           "caption": sc.get("voiceover") or ""})
    if not images:
        return None

    w, h = _aspect_dims(aspect_ratio)
    job_id = uuid.uuid4().hex[:12]

    def _work() -> Optional[str]:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            # 1) write images
            img_paths = []
            for i, img in enumerate(images):
                p = tmp_path / f"scn_{i:03d}.png"
                p.write_bytes(img["bytes"])
                img_paths.append(p)

            # 2) write each scene as a short MP4 with zoom+pan
            scene_videos = []
            for i, (p, meta) in enumerate(zip(img_paths, images)):
                out = tmp_path / f"scn_{i:03d}.mp4"
                dur = max(1.5, min(6.0, meta["duration"]))
                # Cover-scale to a 2x canvas, then zoompan to target.
                dur_frames = max(45, int(dur * fps))
                vf = (
                    f"scale={w*2}:{h*2}:force_original_aspect_ratio=increase,"
                    f"crop={w*2}:{h*2},"
                    f"zoompan=z='min(zoom+0.0015,1.15)':d={dur_frames}:s={w}x{h}:fps={fps},"
                    f"format=yuv420p"
                )
                cmd = [
                    "ffmpeg", "-y", "-loop", "1", "-i", str(p),
                    "-t", f"{dur:.2f}", "-r", str(fps),
                    "-vf", vf,
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                    str(out),
                ]
                r = subprocess.run(cmd, capture_output=True, timeout=60)
                if r.returncode != 0:
                    print("[render] scene fail:", r.stderr.decode()[-300:])
                    return None
                scene_videos.append(out)

            # 3) concat list
            concat_list = tmp_path / "concat.txt"
            concat_list.write_text("\n".join(f"file '{v}'" for v in scene_videos))
            combined = tmp_path / "combined.mp4"
            r = subprocess.run(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list),
                 "-c", "copy", str(combined)],
                capture_output=True, timeout=120,
            )
            if r.returncode != 0:
                print("[render] concat fail:", r.stderr.decode()[-300:])
                return None

            # 4) add audio if available
            final = STATIC_DIR / f"{job_id}.mp4"
            audio_bytes = _audio_to_bytes(audio_data_uri) if audio_data_uri else None
            if audio_bytes:
                audio_path = tmp_path / "voice.mp3"
                audio_path.write_bytes(audio_bytes)
                cmd = [
                    "ffmpeg", "-y", "-i", str(combined), "-i", str(audio_path),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                    "-shortest", str(final),
                ]
            else:
                cmd = ["ffmpeg", "-y", "-i", str(combined), "-c", "copy", str(final)]
            r = subprocess.run(cmd, capture_output=True, timeout=120)
            if r.returncode != 0:
                print("[render] mux fail:", r.stderr.decode()[-300:])
                return None

            return f"/api/files/videos/{job_id}.mp4"

    return await asyncio.to_thread(_work)
