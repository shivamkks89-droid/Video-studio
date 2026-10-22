"""Play Store screenshot composer — 1080x1920 hero shots with a phone frame + headline."""
import io
import re
import subprocess
import tempfile
from pathlib import Path
from typing import List, Optional

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from video_renderer import FFMPEG_BIN

W, H = 1080, 1920
FONT_DIR = Path(__file__).parent / "fonts"
BOLD = str(FONT_DIR / "FreeSansBold.ttf")
REG = str(FONT_DIR / "FreeSans.ttf")
VOLT = (226, 255, 61)

BRAND_BG = [("#0A0A0B", "#1C2406")] * 6
MULTI_BG = [("#E2FF3D", "#7F9400"), ("#FF5E3A", "#7A1800"), ("#3A86FF", "#0A2260"),
            ("#FF3D9A", "#5E0030"), ("#00C2A8", "#00413A"), ("#FFB800", "#6E4200")]


def _hex(c: str):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _is_light(rgb) -> bool:
    r, g, b = rgb
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170


def extract_frames(video_bytes: bytes, n: int = 6) -> List[Image.Image]:
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "in.mp4"
        src.write_bytes(video_bytes)
        probe = subprocess.run([FFMPEG_BIN, "-i", str(src)], capture_output=True, text=True)
        m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", probe.stderr)
        dur = (int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))) if m else 10.0
        frames = []
        for i in range(n):
            out = Path(td) / f"f{i}.png"
            t = dur * (i + 0.5) / n
            subprocess.run([FFMPEG_BIN, "-y", "-ss", f"{t:.2f}", "-i", str(src), "-frames:v", "1",
                            str(out)], capture_output=True)
            if out.exists():
                frames.append(Image.open(out).convert("RGB"))
        return frames


def _gradient(top, bottom) -> Image.Image:
    base = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        base.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return base.resize((W, H))


def _wrap(draw, text, font, max_w):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def _fit_headline(draw, text, max_w, max_lines=3):
    for size in (96, 88, 80, 72, 64, 56):
        font = ImageFont.truetype(BOLD, size)
        lines = _wrap(draw, text, font, max_w)
        if len(lines) <= max_lines:
            return font, lines
    return font, lines[:max_lines]


def _screen_fill(content: Image.Image, sw: int, sh: int) -> Image.Image:
    """Blurred cover backdrop + contain-fit content so any aspect ratio looks native."""
    c = content.convert("RGB")
    cover = max(sw / c.width, sh / c.height)
    bg = c.resize((int(c.width * cover) + 1, int(c.height * cover) + 1))
    bg = bg.crop(((bg.width - sw) // 2, (bg.height - sh) // 2,
                  (bg.width - sw) // 2 + sw, (bg.height - sh) // 2 + sh))
    bg = bg.filter(ImageFilter.GaussianBlur(40)).point(lambda p: int(p * 0.55))
    contain = min(sw / c.width, sh / c.height)
    fg = c.resize((int(c.width * contain), int(c.height * contain)), Image.LANCZOS)
    bg.paste(fg, ((sw - fg.width) // 2, (sh - fg.height) // 2))
    return bg


def _phone(canvas: Image.Image, content: Image.Image, x: int, y: int, pw: int, ph: int):
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((x + 10, y + 40, x + pw + 10, y + ph + 40),
                                             radius=96, fill=170)
    shadow = shadow.filter(ImageFilter.GaussianBlur(38))
    canvas.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), shadow)
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((x, y, x + pw, y + ph), radius=96, fill=(18, 18, 20),
                        outline=(62, 62, 68), width=4)
    bez = 22
    sw, sh = pw - bez * 2, ph - bez * 2
    screen = _screen_fill(content, sw, sh)
    mask = Image.new("L", (sw * 2, sh * 2), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw * 2 - 1, sh * 2 - 1), radius=150, fill=255)
    canvas.paste(screen, (x + bez, y + bez), mask.resize((sw, sh), Image.LANCZOS))
    cx = x + pw // 2
    d.ellipse((cx - 16, y + bez + 26, cx + 16, y + bez + 58), fill=(8, 8, 10))
    d.rounded_rectangle((x + pw - 2, y + 300, x + pw + 6, y + 420), radius=4, fill=(40, 40, 44))


def compose_one(content: Image.Image, headline: str, sub: str, idx: int,
                bg_style: str, brand_name: str) -> bytes:
    top, bottom = (MULTI_BG if bg_style == "multi" else BRAND_BG)[idx % 6]
    top_rgb, bot_rgb = _hex(top), _hex(bottom)
    canvas = _gradient(top_rgb, bot_rgb)
    if bg_style != "multi":
        glow = Image.new("L", (W, H), 0)
        ImageDraw.Draw(glow).ellipse((W // 2 - 520, 900, W // 2 + 520, 1900), fill=60)
        canvas.paste(Image.new("RGB", (W, H), VOLT), (0, 0), glow.filter(ImageFilter.GaussianBlur(160)))
    light = _is_light(top_rgb)
    ink = (10, 10, 11) if light else (255, 255, 255)
    soft = (40, 40, 40) if light else (190, 190, 196)
    accent = (10, 10, 11) if light else VOLT
    d = ImageDraw.Draw(canvas)
    pill_font = ImageFont.truetype(BOLD, 30)
    label = f"{idx + 1:02d}  ·  {brand_name.upper()}"[:40]
    lw = int(d.textlength(label, font=pill_font))
    d.rounded_rectangle((80, 96, 80 + lw + 48, 150), radius=27, outline=accent, width=3)
    d.text((104, 106), label, font=pill_font, fill=accent)
    font, lines = _fit_headline(d, headline.strip() or brand_name, W - 160)
    y = 190
    for line in lines:
        d.text((80, y), line, font=font, fill=ink)
        y += int(font.size * 1.08)
    if sub:
        sfont = ImageFont.truetype(REG, 40)
        for line in _wrap(d, sub.strip(), sfont, W - 160)[:2]:
            d.text((80, y + 14), line, font=sfont, fill=soft)
            y += 50
    py = max(y + 70, 560)
    ph = H - py + 160
    pw = int(ph * 0.49)
    if pw > 760:
        pw = 760
    _phone(canvas, content, (W - pw) // 2, py, pw, ph)
    buf = io.BytesIO()
    canvas.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def compose_all(contents: List[Image.Image], items: List[dict], bg_style: str,
                brand_name: str) -> List[bytes]:
    out = []
    for i, it in enumerate(items[:6]):
        img = contents[i % len(contents)]
        out.append(compose_one(img, it.get("headline", ""), it.get("sub", ""), i, bg_style, brand_name))
    return out


def open_upload(raw: bytes) -> Optional[Image.Image]:
    try:
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        return None
