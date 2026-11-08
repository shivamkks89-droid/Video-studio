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
FONT_DIR = str(Path(__file__).parent / "fonts")
XFADE_T = 0.4
XFADE_TYPES = ["fade", "slideleft", "smoothup", "circleopen", "wipeleft", "dissolve"]


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
    if aspect == "4:5":
        return 1080, 1350
    return 1080, 1920  # default 9:16


def _safe_filter(text: str) -> str:
    """Make text safe for ffmpeg drawtext."""
    if not text:
        return ""
    text = text.replace("'", "").replace(":", " ").replace("\\", "")
    text = re.sub(r"[^\w\s.,!?-]", "", text)
    return text[:120]


def _ass_escape(text: str) -> str:
    """Escape text for ASS subtitle content."""
    return (text or "").replace("{", "").replace("}", "").replace("\n", " ")


def _motion_text_ass(texts: List[str], durs: List[float], width: int, height: int):
    """Animated per-scene headline (slide-up + fade, volt box) as ASS events timed to scene starts."""
    if not any(t.strip() for t in texts):
        return None
    fs = int(min(width, height) * 0.065)

    def ft(sec):
        cs = int(round(max(0.0, sec) * 100))
        return f"{cs // 360000:d}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"

    style = (f"Style: Motion,FreeSans,{fs},&H000B0A0A,&H000B0A0A,&H003DFFE2,&H003DFFE2,"
             f"1,0,0,0,100,100,1,0,3,{int(fs * 0.3)},0,8,60,60,0,1")
    x, y = width // 2, int(height * 0.13)
    events, start = [], 0.0
    for t, d in zip(texts, durs):
        t = _ass_escape(t.strip().upper()[:40])
        if t:
            st, en = start + 0.15, start + max(0.8, d - 0.1)
            events.append(f"Dialogue: 1,{ft(st)},{ft(en)},Motion,,0,0,0,,"
                          f"{{\\fad(250,250)\\move({x},{y + 70},{x},{y},0,450)\\an8}}{t}")
        start += d
    return style, "\n".join(events)


def _build_ass_captions(words: List[dict], width: int, height: int,
                         style: dict) -> str:
    """Build an ASS subtitle file with 2-3 word chunks + karaoke-style word
    highlighting. Placed in the bottom safe zone."""
    font = style.get("font", "Arial")
    font_size = int(style.get("font_size", max(36, height // 22)))
    prim_color = "&H00FFFFFF"      # white text (ASS uses AABBGGRR)
    highlight = "&H003DFFE2"       # #E2FF3D-ish yellow (BGR)
    outline = "&H00000000"         # black outline
    margin_v = int(style.get("margin_v", max(60, height // 8)))
    max_words = int(style.get("group_size", 3))

    def _fmt_time(sec: float) -> str:
        sec = max(0.0, sec)
        h = int(sec // 3600); sec -= h * 3600
        m = int(sec // 60); sec -= m * 60
        cs = int(round(sec * 100))
        return f"{h:d}:{m:02d}:{cs//100:02d}.{cs%100:02d}"

    # Group words into chunks
    chunks = []
    for i in range(0, len(words), max_words):
        chunk = words[i:i + max_words]
        if chunk:
            chunks.append({
                "start": float(chunk[0].get("start", 0)),
                "end": float(chunk[-1].get("end", 0)),
                "words": chunk,
            })

    dialogues = []
    for ch in chunks:
        parts = []
        for wobj in ch["words"]:
            wtext = _ass_escape(str(wobj.get("word", "")).strip())
            wdur = max(1, int(round((float(wobj.get("end", 0)) - float(wobj.get("start", 0))) * 100)))
            parts.append(f"{{\\kf{wdur}}}{wtext} ")
        line = "".join(parts).strip()
        dialogues.append(
            f"Dialogue: 0,{_fmt_time(ch['start'])},{_fmt_time(ch['end'])},"
            f"Default,,0,0,0,,{line}"
        )

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font},{font_size},{prim_color},{highlight},{outline},&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    return header + "\n".join(dialogues) + "\n"


async def render_video(scenes: List[dict], audio_data_uri: Optional[str],
                       aspect_ratio: str = "9:16", fps: int = 30,
                       default_scene_seconds: float = 3.5,
                       caption_words: Optional[List[dict]] = None,
                       caption_style: Optional[dict] = None,
                       talking_avatar_url: Optional[str] = None,
                       talking_avatar_mode: str = "off",
                       motion_text: bool = True,
                       transitions: bool = True,
                       progress_cb=None,
                       watermark: bool = False,
                       music_url: Optional[str] = None,
                       music_volume: float = 0.2,
                       greeting: Optional[str] = None,
                       greeting_pos: str = "center",
                       trending: bool = False) -> Optional[str]:
    """Render an MP4 from a list of scenes.

    Each scene can carry either a still `image_url` (rendered with ken-burns) or
    a `video_clip_url` (a Seedance MP4 that is preferred over the image).

    If `caption_words` is provided (list of {start, end, word} in seconds), the
    words are grouped into 2-3 word chunks and burned into the final video as
    karaoke-style captions (auto-safe-zone, bottom-third for 9:16, bottom for 16:9).

    If `talking_avatar_url` is provided and `talking_avatar_mode != "off"`:
      - "fullscreen" — the talking-head MP4 replaces the storyboard entirely.
      - "pip_br/pip_bl/pip_tr/pip_tl" — the talking-head is overlaid as a
        circular picture-in-picture on the storyboard render (30% width).
    """

    async def _fetch(url: str) -> Optional[bytes]:
        if not url:
            return None
        if url.startswith("data:"):
            return _data_uri_to_bytes(url)
        from asset_store import fetch_to_bytes as _f
        return await _f(url)

    items, carry = [], 0.0
    for sc in scenes:
        dur = float(sc.get("duration") or default_scene_seconds) + carry
        carry = 0.0
        clip_url = sc.get("video_clip_url")
        if clip_url:
            b = await _fetch(clip_url)
            if b:
                items.append({"type": "clip", "bytes": b, "text": (sc.get("on_screen_text") or "").strip(),
                              "duration": dur,
                              "caption": sc.get("voiceover") or ""})
                continue
            # fall through to image if clip fetch fails
        img_url = sc.get("image_url") or ""
        b = await _fetch(img_url) if img_url else None
        if b:
            phone = sc.get("phone_screen_url")
            items.append({"type": "image", "bytes": b, "text": (sc.get("on_screen_text") or "").strip(),
                          "duration": dur, "caption": sc.get("voiceover") or "",
                          "source": sc.get("source"), "phone": await _fetch(phone) if phone else None,
                          "phone_pos": sc.get("phone_pos") or "right"})
        elif items:
            items[-1]["duration"] += dur  # keep timeline: missing visual extends previous scene
        else:
            carry = dur
    if not items:
        return None

    w, h = _aspect_dims(aspect_ratio)
    job_id = uuid.uuid4().hex[:12]

    # Pre-fetch audio bytes (async) before entering the sync render thread.
    music_bytes: Optional[bytes] = None
    if music_url:
        try:
            from asset_store import fetch_to_bytes as _fetch_music
            music_bytes = _data_uri_to_bytes(music_url) if music_url.startswith("data:") else await _fetch_music(music_url)
        except Exception as e:
            print(f"[render] music fetch failed (rendering without music): {e}")
    audio_bytes: Optional[bytes] = None
    if audio_data_uri:
        if audio_data_uri.startswith("data:"):
            audio_bytes = _data_uri_to_bytes(audio_data_uri)
        else:
            from asset_store import fetch_to_bytes as _fetch2
            audio_bytes = await _fetch2(audio_data_uri)

    # Pre-fetch talking avatar bytes (fal.ai returns a public https URL).
    talking_bytes: Optional[bytes] = None
    if talking_avatar_url and talking_avatar_mode in (
        "fullscreen", "pip_br", "pip_bl", "pip_tr", "pip_tl"
    ):
        try:
            if talking_avatar_url.startswith("data:"):
                talking_bytes = _data_uri_to_bytes(talking_avatar_url)
            else:
                from asset_store import fetch_to_bytes as _fetch3
                talking_bytes = await _fetch3(talking_avatar_url)
        except Exception as e:
            print(f"[render] talking-avatar fetch failed: {e}")
            talking_bytes = None

    total_s = sum(float(it["duration"]) for it in items)
    run_t = int(120 + total_s * 6)

    done_s = [0.0]

    def _report(extra_s=0.0):
        # scenes ≈ 55% of work, final pass ≈ 45% (both proportional to video seconds)
        if progress_cb and total_s > 0:
            try:
                progress_cb(min(99, int((done_s[0] + extra_s) / (total_s * 2) * 100 * 0.98)))
            except Exception:
                pass

    def _run(cmd, capture_output=True, timeout=None, track=False):
        limit = max(timeout or 0, run_t)
        if not (track and progress_cb):
            try:
                return subprocess.run(cmd, capture_output=True, timeout=limit)
            except subprocess.TimeoutExpired:
                print(f"[render] ffmpeg timeout after {limit}s: {' '.join(map(str, cmd[:6]))}")
                return subprocess.CompletedProcess(cmd, 124, b"", b"timeout")
        import threading, time as _t
        full = [cmd[0], "-progress", "pipe:1", "-nostats", *cmd[1:]]
        pr = subprocess.Popen(full, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        err = []
        threading.Thread(target=lambda: err.append(pr.stderr.read()), daemon=True).start()
        start, last = _t.time(), 0.0
        for line in iter(pr.stdout.readline, b""):
            if line.startswith(b"out_time_us=") or line.startswith(b"out_time_ms="):
                try:
                    sec = int(line.split(b"=")[1]) / 1e6
                    if sec - last >= 1:
                        last = sec; _report(sec)
                except ValueError:
                    pass
            if _t.time() - start > limit:
                pr.kill(); print(f"[render] ffmpeg timeout after {limit}s (final)")
                break
        rc = pr.wait()
        _t.sleep(0.05)
        return subprocess.CompletedProcess(full, rc, b"", err[0] if err else b"")

    def _single_pass(cmd, xf_graph, scene_videos):
        """Rewrite a final cmd (input 0 = combined video) to read scene clips + xfade directly."""
        graph, last = xf_graph
        n = len(scene_videos)
        rest = cmd[cmd.index("-i", cmd.index("-i") + 1):] if cmd.count("-i") > 1 else cmd[cmd.index("-i") + 2:]
        extra_inputs, tail = [], rest
        if cmd.count("-i") > 1:
            extra_inputs, tail = rest[:2], rest[2:]
        vf = None
        if "-vf" in tail:
            j = tail.index("-vf"); vf = tail[j + 1]; tail = tail[:j] + tail[j + 2:]
        tail = [t for t in tail]
        # drop existing maps / video codec copy; we re-map below
        out, k = [], 0
        while k < len(tail):
            if tail[k] == "-map" or (tail[k] in ("-c:v", "-c") and tail[k + 1] == "copy"):
                k += 2; continue
            out.append(tail[k]); k += 1
        fc = graph + f";[{last}]" + (vf + "," if vf else "") + "format=yuv420p[vout]"
        new = [FFMPEG_BIN, "-y", "-threads", "2"]
        for v in scene_videos:
            new += ["-i", str(v)]
        new += extra_inputs + ["-filter_complex", fc, "-map", "[vout]"]
        if extra_inputs:
            new += ["-map", f"{n}:a:0"]
        if "-c:v" not in out:
            new += ["-c:v", "libx264", "-x264-params", "rc-lookahead=8:threads=2:sliced-threads=1", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p"]
        return new + out

    def _work() -> Optional[str]:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            # Transitions are baked into each scene clip (2-input xfade from the previous clip's last
            # frame), so scenes join with a stream-copy concat — low memory, timeline-neutral.
            in_clip_trans = transitions and len(items) > 1
            use_xfade = False
            base_durs = []

            def _extra(i):
                return 0.0

            def _text_vf(i, dur):
                return ""  # headlines are burned later via ASS (bundled ffmpeg has no drawtext)

            scene_videos = []
            for i, item in enumerate(items):
                out = tmp_path / f"scn_{i:03d}.mp4"
                if item["type"] == "clip":
                    src = tmp_path / f"scn_{i:03d}_src.mp4"
                    src.write_bytes(item["bytes"])
                    dur = max(1.0, float(item["duration"]))
                    base_durs.append(dur)
                    total = dur + _extra(i)
                    # Normalise the Seedance MP4 into our target canvas + codec so
                    # concat -c copy can splice it seamlessly with ken-burns scenes.
                    vf = (
                        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
                        f"crop={w}:{h},tpad=stop_mode=clone:stop_duration=90,format=yuv420p"
                        + _text_vf(i, total)
                    )
                    cmd = [
                        FFMPEG_BIN, "-y", "-threads", "2", "-i", str(src),
                        "-t", f"{total:.2f}", "-r", str(fps),
                        "-vf", vf,
                        "-c:v", "libx264", "-x264-params", "rc-lookahead=8:threads=2:sliced-threads=1", "-preset", "ultrafast",
                        "-crf", "20", "-pix_fmt", "yuv420p",
                        "-an", "-threads", "1",
                        str(out),
                    ]
                    r = _run(cmd, capture_output=True, timeout=120)
                    if r.returncode != 0:
                        print("[render] clip normalise fail:", r.stderr.decode(errors="ignore")[-1500:])
                        return None
                    scene_videos.append(out)
                    done_s[0] += float(item["duration"]); _report()
                    continue

                # --- Still image → ken-burns ---
                p = tmp_path / f"scn_{i:03d}.png"
                img_bytes = item["bytes"]
                try:
                    from phone_mockup import overlay_phone, screenshot_scene
                    if item.get("source") == "real":
                        img_bytes = screenshot_scene(img_bytes, w, h)
                    elif item.get("phone"):
                        img_bytes = overlay_phone(img_bytes, item["phone"], w, h, item.get("phone_pos"))
                except Exception as e:
                    print(f"[render] phone mockup skipped scene {i}: {e}")
                p.write_bytes(img_bytes)
                # Support long-form scenes for 40-60s ads — cap at 12s per still to
                # keep viewer attention (movement helps). Below 1.5s looks jumpy.
                dur = max(1.5, min(90.0, item["duration"]))
                base_durs.append(dur)
                dur = dur + _extra(i)
                dur_frames = max(45, int(dur * fps))
                cw, ch = int(w * 1.1) // 2 * 2, int(h * 1.1) // 2 * 2
                pan_y = f"(ih-oh)*n/{dur_frames}" if i % 2 == 0 else f"(ih-oh)*(1-n/{dur_frames})"
                vf = (
                    f"[0:v]split=2[fg][bg];"
                    f"[bg]scale={w}:{h}:force_original_aspect_ratio=increase,"
                    f"crop={w}:{h},boxblur=luma_radius=30:luma_power=1,"
                    f"eq=brightness=-0.15[bgb];"
                    f"[fg]scale={w}:{h}:force_original_aspect_ratio=decrease:flags=lanczos[fgs];"
                    f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2,"
                    f"scale={cw}:{ch}:flags=lanczos,loop=loop={dur_frames - 1}:size=1:start=0,setpts=N/{fps}/TB,"
                    + (f"crop={w}:{h}:x='(iw-ow)/2+if(lt(t,0.35),14*sin(n*2.7),0)':y='min(ih-oh,{pan_y}+if(lt(t,0.35),5+5*cos(n*3.1),0))',"
                       f"eq=contrast=1.07:saturation=1.22,vignette=PI/5," if trending else
                       f"crop={w}:{h}:x='(iw-ow)/2':y='{pan_y}',")
                    + f"format=yuv420p" + _text_vf(i, dur)
                )
                trans_in = []
                if in_clip_trans:
                    # Dip-through-black between scenes: single-input fades, ~zero extra memory/CPU.
                    fades = []
                    if i > 0:
                        fades.append(f"fade=t=in:st=0:d={XFADE_T / 2:.2f}" + (":color=white" if trending else ""))
                    if i < len(items) - 1:
                        fades.append(f"fade=t=out:st={max(0.0, dur - XFADE_T / 2):.2f}:d={XFADE_T / 2:.2f}")
                    if fades:
                        vf += "," + ",".join(fades)
                # Single input frame: blur/scale run once, zoompan emits all frames (CPU-light on small pods).
                cmd = [
                    FFMPEG_BIN, "-y", "-threads", "2", "-i", str(p), *trans_in,
                    "-frames:v", str(dur_frames), "-r", str(fps),
                    "-filter_complex", vf,
                    "-c:v", "libx264", "-x264-params", "rc-lookahead=8:threads=2:sliced-threads=1", "-preset", "ultrafast", "-tune", "stillimage",
                    "-crf", "16", "-pix_fmt", "yuv420p", "-threads", "2",
                    str(out),
                ]
                r = _run(cmd, capture_output=True, timeout=120)
                if r.returncode != 0:
                    print("[render] scene fail:", r.stderr.decode(errors="ignore")[-1500:])
                    return None
                scene_videos.append(out)
                done_s[0] += float(item["duration"]); _report()

            # 3) join scenes — cross-fade transitions (timeline-neutral) or plain concat
            combined = tmp_path / "combined.mp4"
            joined = False
            # Fast path: build the xfade graph now but encode it together with captions + audio
            # in the final pass (one full-length encode instead of two).
            xf_graph = None
            if use_xfade and not talking_bytes:
                parts, prev, offset = [], "0:v", 0.0
                for k in range(1, len(scene_videos)):
                    offset += base_durs[k - 1]
                    parts.append(f"[{prev}][{k}:v]xfade=transition={XFADE_TYPES[(k - 1) % len(XFADE_TYPES)]}"
                                 f":duration={XFADE_T}:offset={offset:.2f}[x{k}]")
                    prev = f"x{k}"
                xf_graph = (";".join(parts), prev)
                joined = True
            elif use_xfade:
                cmd = [FFMPEG_BIN, "-y", "-threads", "2"]
                for v in scene_videos:
                    cmd += ["-i", str(v)]
                parts, prev, offset = [], "0:v", 0.0
                for k in range(1, len(scene_videos)):
                    offset += base_durs[k - 1]
                    parts.append(f"[{prev}][{k}:v]xfade=transition={XFADE_TYPES[(k - 1) % len(XFADE_TYPES)]}"
                                 f":duration={XFADE_T}:offset={offset:.2f}[x{k}]")
                    prev = f"x{k}"
                cmd += ["-filter_complex", ";".join(parts), "-map", f"[{prev}]",
                        "-c:v", "libx264", "-x264-params", "rc-lookahead=8:threads=2:sliced-threads=1", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", str(combined)]
                r = _run(cmd, capture_output=True, timeout=240)
                joined = r.returncode == 0
                if not joined:
                    print("[render] xfade fail, falling back to concat:", r.stderr.decode(errors="ignore")[-1500:])
            concat_list = tmp_path / "concat.txt"
            concat_list.write_text("\n".join(f"file '{v}'" for v in scene_videos))
            r = _run(
                [FFMPEG_BIN, "-y", "-threads", "2", "-f", "concat", "-safe", "0", "-i", str(concat_list),
                 "-c", "copy", str(combined)],
                capture_output=True, timeout=120,
            ) if not joined else None
            if r is not None and r.returncode != 0:
                print("[render] concat fail:", r.stderr.decode(errors="ignore")[-1500:])
                return None

            # 3b) Talking-avatar composition (fullscreen replace OR PiP overlay).
            #     Loops the talking clip when it is shorter than the storyboard
            #     via `-stream_loop -1` so the avatar keeps moving to the end.
            if talking_bytes:
                tsrc = tmp_path / "talking_src.mp4"
                tsrc.write_bytes(talking_bytes)
                if talking_avatar_mode == "fullscreen":
                    tout = tmp_path / "combined_talking.mp4"
                    vf = (
                        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
                        f"crop={w}:{h},setsar=1,fps={fps},format=yuv420p"
                    )
                    cmd = [FFMPEG_BIN, "-y", "-threads", "2",
                           "-i", str(tsrc), "-vf", vf,
                           "-c:v", "libx264", "-x264-params", "rc-lookahead=8:threads=2:sliced-threads=1", "-preset", "ultrafast", "-crf", "20",
                           "-pix_fmt", "yuv420p", "-an", str(tout)]
                    r = _run(cmd, capture_output=True, timeout=180)
                    if r.returncode == 0:
                        combined = tout
                    else:
                        print("[render] talking fullscreen fail:", r.stderr.decode(errors="ignore")[-1500:])
                elif talking_avatar_mode in ("pip_br", "pip_bl", "pip_tr", "pip_tl"):
                    # PiP: 30% of canvas width, safe-zone margin, lime border.
                    pip_w = max(200, int(w * 0.30))
                    pip_h = pip_w
                    margin = max(24, int(w * 0.03))
                    corner = {
                        "pip_br": (f"W-w-{margin}", f"H-h-{margin}"),
                        "pip_bl": (f"{margin}",     f"H-h-{margin}"),
                        "pip_tr": (f"W-w-{margin}", f"{margin}"),
                        "pip_tl": (f"{margin}",     f"{margin}"),
                    }[talking_avatar_mode]
                    x_expr, y_expr = corner
                    tout = tmp_path / "combined_pip.mp4"
                    # Loop talking clip if it's shorter than storyboard.
                    fc = (
                        f"[1:v]scale={pip_w}:{pip_h}:force_original_aspect_ratio=increase,"
                        f"crop={pip_w}:{pip_h},setsar=1,fps={fps},"
                        f"pad={pip_w + 8}:{pip_h + 8}:4:4:color=0xE2FF3D@0.9[pip];"
                        f"[0:v][pip]overlay={x_expr}:{y_expr}:shortest=1,format=yuv420p"
                    )
                    cmd = [FFMPEG_BIN, "-y", "-threads", "2",
                           "-i", str(combined),
                           "-stream_loop", "-1", "-i", str(tsrc),
                           "-filter_complex", fc,
                           "-c:v", "libx264", "-x264-params", "rc-lookahead=8:threads=2:sliced-threads=1", "-preset", "ultrafast", "-crf", "20",
                           "-pix_fmt", "yuv420p", "-an", str(tout)]
                    r = _run(cmd, capture_output=True, timeout=240)
                    if r.returncode == 0:
                        combined = tout
                    else:
                        print("[render] talking pip fail:", r.stderr.decode(errors="ignore")[-1500:])

            # 4) add audio if available. Auto-tighten voiceover pacing when it
            # exceeds the total video length (else `-shortest` would cut off the
            # last CTA scene). We use ffmpeg's atempo filter with a safety cap of
            # 1.35× so the voice never sounds robotic.
            final = STATIC_DIR / f"{job_id}.mp4"

            # 4a) Build caption ASS subtitle file if word-level timing provided.
            subs_path: Optional[Path] = None
            if caption_words:
                subs_path = tmp_path / "captions.ass"
                subs_path.write_text(_build_ass_captions(
                    caption_words, w, h, caption_style or {}
                ), encoding="utf-8")
            motion = _motion_text_ass([it.get("text") or "" for it in items], base_durs, w, h) if motion_text else None
            if motion:
                style_line, events = motion
                if subs_path:
                    txt = subs_path.read_text(encoding="utf-8").replace("\n\n[Events]", f"\n{style_line}\n\n[Events]", 1)
                    subs_path.write_text(txt.rstrip("\n") + "\n" + events + "\n", encoding="utf-8")
                else:
                    subs_path = tmp_path / "motion.ass"
                    subs_path.write_text(_build_ass_captions([], w, h, {}).replace(
                        "\n\n[Events]", f"\n{style_line}\n\n[Events]", 1).rstrip("\n") + "\n" + events + "\n",
                        encoding="utf-8")

            if greeting and base_durs:
                st = max(0.0, sum(base_durs) - base_durs[-1] + 0.3)
                gfs = max(48, w // 12)
                g_style = (f"Style: GR,Arial,{gfs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,"
                           f"-1,0,0,0,100,100,2,0,1,4,3,{ {'top': 8, 'bottom': 2}.get(greeting_pos, 5)},60,60,{h // 9},1")
                g_t = f"{int(st // 3600)}:{int(st % 3600 // 60):02d}:{st % 60:05.2f}"
                g_event = (f"Dialogue: 3,{g_t},9:59:59.00,GR,,0,0,0,,"
                           f"{{\\fad(500,0)\\c&H3DFFE2&}}{_ass_escape(greeting.split(chr(92) + 'N')[0])}"
                           + (f"\\N{{\\c&HFFFFFF&\\fs{gfs * 2 // 3}}}{_ass_escape(greeting.split(chr(92) + 'N', 1)[1])}"
                              if chr(92) + "N" in greeting else ""))
                base = subs_path.read_text(encoding="utf-8") if subs_path else _build_ass_captions([], w, h, {})
                subs_path = tmp_path / "greet.ass"
                subs_path.write_text(base.replace("\n\n[Events]", f"\n{g_style}\n\n[Events]", 1).rstrip("\n")
                                     + "\n" + g_event + "\n", encoding="utf-8")

            if watermark:
                fs = max(26, w // 30)
                wm_style = (f"Style: WM,Arial,{fs},&H55FFFFFF,&H55FFFFFF,&H99000000,&H00000000,"
                            f"-1,0,0,0,100,100,1,0,1,2,0,9,{w // 28},{w // 28},{h // 40},1")
                wm_event = "Dialogue: 2,0:00:00.00,9:59:59.00,WM,,0,0,0,,Made with CineReel AI"
                base = subs_path.read_text(encoding="utf-8") if subs_path else _build_ass_captions([], w, h, {})
                subs_path = tmp_path / "final.ass"
                subs_path.write_text(base.replace("\n\n[Events]", f"\n{wm_style}\n\n[Events]", 1).rstrip("\n")
                                     + "\n" + wm_event + "\n", encoding="utf-8")

            def _probe(path: Path) -> float:
                try:
                    pr = _run([FFMPEG_BIN, "-i", str(path)], capture_output=True, timeout=15)
                    for line in pr.stderr.decode(errors="ignore").splitlines():
                        if "Duration:" in line:
                            hh, mm, ss = line.split("Duration:")[1].split(",")[0].strip().split(":")
                            return int(hh) * 3600 + int(mm) * 60 + float(ss)
                except Exception:
                    return 0.0
                return 0.0

            voice_path = music_path = None
            if audio_bytes:
                voice_path = tmp_path / "voice.mp3"
                voice_path.write_bytes(audio_bytes)
            if music_bytes:
                music_path = tmp_path / "music.mp3"
                music_path.write_bytes(music_bytes)
            video_dur = _probe(combined)
            voice_dur = _probe(voice_path) if voice_path else 0.0
            # Final length == voice length (voice never sped up); music-only == visuals length.
            total = voice_dur if voice_dur > 0 else video_dur
            vf = []
            if subs_path and subs_path.exists():
                vf.append(f"subtitles={subs_path}:fontsdir={FONT_DIR}")
            pad = total - video_dur if video_dur > 0 else 0
            if pad > 0.05:
                vf.append(f"tpad=stop_mode=clone:stop_duration={pad + 0.2:.2f}")
            print(f"[render] voice {voice_dur:.2f}s, video {video_dur:.2f}s, music {bool(music_path)}, pad {max(pad, 0):.2f}s")
            inputs, fc, amap = ["-i", str(combined)], [], None
            if voice_path:
                inputs += ["-i", str(voice_path)]
                amap = "1:a:0"
            if music_path:
                mi = 2 if voice_path else 1
                inputs += ["-stream_loop", "-1", "-i", str(music_path)]
                vol = max(0.0, min(1.0, music_volume)) if voice_path else 0.85
                fc.append(f"[{mi}:a]volume={vol:.2f},afade=t=in:st=0:d=0.6,"
                          f"afade=t=out:st={max(0.0, total - 1.5):.2f}:d=1.5[m]")
                if voice_path:
                    fc.append("[1:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]")
                    amap = "[a]"
                else:
                    amap = "[m]"
            if vf:
                fc.append(f"[0:v]{','.join(vf)}[v]")
                venc = ["-map", "[v]", "-c:v", "libx264", "-x264-params", "rc-lookahead=8:threads=2:sliced-threads=1",
                        "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p"]
            else:
                venc = ["-map", "0:v:0", "-c:v", "copy"]
            cmd = [FFMPEG_BIN, "-y", "-threads", "2", *inputs, *(["-filter_complex", ";".join(fc)] if fc else []),
                   *venc, *(["-map", amap, "-c:a", "aac", "-b:a", "192k"] if amap else []),
                   *(["-t", f"{total:.3f}"] if total > 0 else []), "-movflags", "+faststart", str(final)]
            if xf_graph:
                cmd = _single_pass(cmd, xf_graph, scene_videos)
            r = _run(cmd, capture_output=True, timeout=120, track=True)
            if r.returncode != 0:
                print("[render] mux fail:", r.stderr.decode(errors="ignore")[-1500:])
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
