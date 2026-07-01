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


# Use a bundled-static ffmpeg binary so the renderer works on any deployment without
# requiring `apt-get install ffmpeg`.
try:
    import imageio_ffmpeg
    FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_BIN = "ffmpeg"  # fall back to system binary

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
    """Render an MP4 from a list of scenes.

    Each scene can carry either a still `image_url` (rendered with ken-burns) or
    a `video_clip_url` (a Seedance MP4 that is preferred over the image).
    """

    async def _fetch(url: str) -> Optional[bytes]:
        if not url:
            return None
        if url.startswith("data:"):
            return _data_uri_to_bytes(url)
        from asset_store import fetch_to_bytes as _f
        return await _f(url)

    items = []
    for sc in scenes:
        dur = float(sc.get("duration") or default_scene_seconds)
        clip_url = sc.get("video_clip_url")
        if clip_url:
            b = await _fetch(clip_url)
            if b:
                items.append({"type": "clip", "bytes": b,
                              "duration": float(sc.get("video_clip_duration") or dur),
                              "caption": sc.get("voiceover") or ""})
                continue
            # fall through to image if clip fetch fails
        img_url = sc.get("image_url") or ""
        if not img_url:
            continue
        b = await _fetch(img_url)
        if b:
            items.append({"type": "image", "bytes": b,
                          "duration": dur, "caption": sc.get("voiceover") or ""})
    if not items:
        return None

    w, h = _aspect_dims(aspect_ratio)
    job_id = uuid.uuid4().hex[:12]

    # Pre-fetch audio bytes (async) before entering the sync render thread.
    audio_bytes: Optional[bytes] = None
    if audio_data_uri:
        if audio_data_uri.startswith("data:"):
            audio_bytes = _data_uri_to_bytes(audio_data_uri)
        else:
            from asset_store import fetch_to_bytes as _fetch2
            audio_bytes = await _fetch2(audio_data_uri)

    def _work() -> Optional[str]:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)

            scene_videos = []
            for i, item in enumerate(items):
                out = tmp_path / f"scn_{i:03d}.mp4"
                if item["type"] == "clip":
                    src = tmp_path / f"scn_{i:03d}_src.mp4"
                    src.write_bytes(item["bytes"])
                    dur = max(1.0, float(item["duration"]))
                    # Normalise the Seedance MP4 into our target canvas + codec so
                    # concat -c copy can splice it seamlessly with ken-burns scenes.
                    vf = (
                        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
                        f"crop={w}:{h},format=yuv420p"
                    )
                    cmd = [
                        FFMPEG_BIN, "-y", "-threads", "1", "-i", str(src),
                        "-t", f"{dur:.2f}", "-r", str(fps),
                        "-vf", vf,
                        "-c:v", "libx264", "-preset", "ultrafast",
                        "-crf", "20", "-pix_fmt", "yuv420p",
                        "-an", "-threads", "1",
                        str(out),
                    ]
                    r = subprocess.run(cmd, capture_output=True, timeout=120)
                    if r.returncode != 0:
                        print("[render] clip normalise fail:", r.stderr.decode()[-400:])
                        return None
                    scene_videos.append(out)
                    continue

                # --- Still image → ken-burns ---
                p = tmp_path / f"scn_{i:03d}.png"
                p.write_bytes(item["bytes"])
                dur = max(1.5, min(6.0, item["duration"]))
                dur_frames = max(45, int(dur * fps))
                cw, ch = int(w * 1.3), int(h * 1.3)
                vf = (
                    f"[0:v]split=2[fg][bg];"
                    f"[bg]scale={w}:{h}:force_original_aspect_ratio=increase,"
                    f"crop={w}:{h},boxblur=luma_radius=30:luma_power=1,"
                    f"eq=brightness=-0.15[bgb];"
                    f"[fg]scale={w}:{h}:force_original_aspect_ratio=decrease[fgs];"
                    f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2,"
                    f"scale={cw}:{ch},"
                    f"zoompan=z='min(zoom+0.0010,1.10)':d={dur_frames}:s={w}x{h}:fps={fps},"
                    f"format=yuv420p"
                )
                cmd = [
                    FFMPEG_BIN, "-y", "-threads", "1", "-loop", "1", "-i", str(p),
                    "-t", f"{dur:.2f}", "-r", str(fps),
                    "-filter_complex", vf,
                    "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
                    "-crf", "20", "-pix_fmt", "yuv420p", "-threads", "1",
                    str(out),
                ]
                r = subprocess.run(cmd, capture_output=True, timeout=120)
                if r.returncode != 0:
                    print("[render] scene fail:", r.stderr.decode()[-400:])
                    return None
                scene_videos.append(out)

            # 3) concat list
            concat_list = tmp_path / "concat.txt"
            concat_list.write_text("\n".join(f"file '{v}'" for v in scene_videos))
            combined = tmp_path / "combined.mp4"
            r = subprocess.run(
                [FFMPEG_BIN, "-y", "-threads", "1", "-f", "concat", "-safe", "0", "-i", str(concat_list),
                 "-c", "copy", str(combined)],
                capture_output=True, timeout=120,
            )
            if r.returncode != 0:
                print("[render] concat fail:", r.stderr.decode()[-300:])
                return None

            # 4) add audio if available
            final = STATIC_DIR / f"{job_id}.mp4"
            if audio_bytes:
                audio_path = tmp_path / "voice.mp3"
                audio_path.write_bytes(audio_bytes)
                cmd = [
                    FFMPEG_BIN, "-y", "-threads", "1", "-i", str(combined), "-i", str(audio_path),
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                    "-shortest", str(final),
                ]
            else:
                cmd = [FFMPEG_BIN, "-y", "-threads", "1", "-i", str(combined), "-c", "copy", str(final)]
            r = subprocess.run(cmd, capture_output=True, timeout=120)
            if r.returncode != 0:
                print("[render] mux fail:", r.stderr.decode()[-300:])
                return None

            return f"/api/files/videos/{job_id}.mp4"

    out_path = await asyncio.to_thread(_work)
    if not out_path:
        return None
    # Mirror the rendered MP4 to object storage so it survives pod restarts.
    try:
        from asset_store import save_video_bytes
        final_disk = STATIC_DIR / f"{job_id}.mp4"
        if final_disk.exists():
            url = await save_video_bytes(final_disk.read_bytes())
            if url:
                return url
    except Exception as e:
        print(f"[render] objstore mirror failed: {e}")
    return out_path
