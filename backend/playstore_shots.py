"""Play Store composer — hero screenshots (4 layouts), feature-graphic text, 30s promo video."""
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
FONTS = {"sans": ("FreeSansBold.ttf", "FreeSans.ttf"), "serif": ("FreeSerifBold.ttf", "FreeSerif.ttf"),
         "mono": ("FreeMonoBold.ttf", "FreeMono.ttf")}
MULTI_BG = [("#E2FF3D", "#7F9400"), ("#FF5E3A", "#7A1800"), ("#3A86FF", "#0A2260"),
            ("#FF3D9A", "#5E0030"), ("#00C2A8", "#00413A"), ("#FFB800", "#6E4200")]
LAYOUTS = ("classic", "tilted", "duo", "callout")


def _hex(c: str):
    c = (c or "#E2FF3D").lstrip("#")
    try:
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return (226, 255, 61)


def _is_light(rgb) -> bool:
    r, g, b = rgb
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170


def _mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _fonts(kit: dict):
    b, r = FONTS.get((kit or {}).get("font"), FONTS["sans"])
    return str(FONT_DIR / b), str(FONT_DIR / r)


def open_upload(raw: bytes, rgba: bool = False) -> Optional[Image.Image]:
    try:
        return Image.open(io.BytesIO(raw)).convert("RGBA" if rgba else "RGB")
    except Exception:
        return None


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
            subprocess.run([FFMPEG_BIN, "-y", "-ss", f"{dur * (i + 0.5) / n:.2f}", "-i", str(src),
                            "-frames:v", "1", str(out)], capture_output=True)
            if out.exists():
                frames.append(Image.open(out).convert("RGB"))
        return frames


def _gradient(top, bottom, w=W, h=H) -> Image.Image:
    base = Image.new("RGB", (1, h))
    for y in range(h):
        base.putpixel((0, y), _mix(top, bottom, y / (h - 1)))
    return base.resize((w, h))


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


def _fit(draw, text, path, max_w, sizes, max_lines):
    for size in sizes:
        font = ImageFont.truetype(path, size)
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
    fg = c.resize((max(1, int(c.width * contain)), max(1, int(c.height * contain))), Image.LANCZOS)
    bg.paste(fg, ((sw - fg.width) // 2, (sh - fg.height) // 2))
    return bg


def _round_mask(w, h, r):
    m = Image.new("L", (w * 2, h * 2), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), radius=r * 2, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def _phone_layer(content: Image.Image, pw: int, ph: int) -> Image.Image:
    layer = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    body = Image.new("RGBA", (pw, ph), (18, 18, 20, 255))
    layer.paste(body, (0, 0), _round_mask(pw, ph, int(pw * 0.13)))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((1, 1, pw - 2, ph - 2), radius=int(pw * 0.13), outline=(62, 62, 68, 255), width=4)
    bez = max(14, pw // 33)
    sw, sh = pw - bez * 2, ph - bez * 2
    layer.paste(_screen_fill(content, sw, sh), (bez, bez), _round_mask(sw, sh, int(pw * 0.11)))
    cx, cr = pw // 2, max(10, pw // 46)
    d.ellipse((cx - cr, bez + cr + 10, cx + cr, bez + 3 * cr + 10), fill=(8, 8, 10, 255))
    return layer


def _place(canvas: Image.Image, layer: Image.Image, cx: int, y: int, angle: float = 0):
    if angle:
        layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
    x = cx - layer.width // 2
    shadow = Image.new("L", canvas.size, 0)
    shadow.paste(layer.split()[3].point(lambda a: int(a * 0.65)), (x + 10, y + 40))
    canvas.paste(Image.new("RGB", canvas.size, (0, 0, 0)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(38)))
    canvas.paste(layer, (x, y), layer)


def _header(canvas, d, idx, headline, sub, brand_name, ink, soft, accent, kit):
    bold, reg = _fonts(kit)
    pill_font = ImageFont.truetype(bold, 30)
    label = f"{idx + 1:02d}  ·  {brand_name.upper()}"[:40]
    lw = int(d.textlength(label, font=pill_font))
    d.rounded_rectangle((80, 96, 80 + lw + 48, 150), radius=27, outline=accent, width=3)
    d.text((104, 106), label, font=pill_font, fill=accent)
    logo = kit.get("logo")
    if logo:
        lg = logo.copy(); lg.thumbnail((84, 84))
        canvas.paste(lg, (W - 80 - lg.width, 82), lg)
    font, lines = _fit(d, headline.strip() or brand_name, bold, W - 160, (96, 88, 80, 72, 64, 56), 3)
    y = 190
    for line in lines:
        d.text((80, y), line, font=font, fill=ink)
        y += int(font.size * 1.08)
    if sub:
        sfont = ImageFont.truetype(reg, 40)
        for line in _wrap(d, sub.strip(), sfont, W - 160)[:2]:
            d.text((80, y + 14), line, font=sfont, fill=soft)
            y += 50
    return max(y + 70, 560)


def _callouts(d, points, x, y, w, ink, accent, card, kit):
    bold, _ = _fonts(kit)
    font = ImageFont.truetype(bold, 40)
    nfont = ImageFont.truetype(bold, 30)
    for n, p in enumerate(points[:3]):
        lines = _wrap(d, p, font, w - 130)[:3]
        h = 60 + len(lines) * 48
        d.rounded_rectangle((x, y, x + w, y + h), radius=32, fill=card)
        d.ellipse((x + 28, y + 30, x + 88, y + 90), fill=accent)
        d.text((x + 58, y + 60), str(n + 1), font=nfont, fill=(10, 10, 11), anchor="mm")
        for k, line in enumerate(lines):
            d.text((x + 110, y + 34 + k * 48), line, font=font, fill=ink)
        y += h + 34


def compose_one(contents: List[Image.Image], item: dict, idx: int, bg_style: str,
                brand_name: str, layout: str = "classic", kit: Optional[dict] = None) -> bytes:
    kit = kit or {}
    primary = _hex(kit.get("primary") or "#E2FF3D")
    if bg_style == "multi":
        top_rgb, bot_rgb = (_hex(c) for c in MULTI_BG[idx % 6])
    else:
        top_rgb, bot_rgb = (10, 10, 11), _mix((0, 0, 0), _hex(kit.get("secondary") or kit.get("primary") or "#E2FF3D"), 0.13)
    canvas = _gradient(top_rgb, bot_rgb)
    if bg_style != "multi":
        glow = Image.new("L", (W, H), 0)
        ImageDraw.Draw(glow).ellipse((W // 2 - 520, 900, W // 2 + 520, 1900), fill=60)
        canvas.paste(Image.new("RGB", (W, H), primary), (0, 0), glow.filter(ImageFilter.GaussianBlur(160)))
    light = _is_light(top_rgb)
    ink = (10, 10, 11) if light else (255, 255, 255)
    soft = (40, 40, 40) if light else (190, 190, 196)
    accent = (10, 10, 11) if light and bg_style == "multi" else primary
    if _is_light(top_rgb) and accent == primary and _is_light(primary):
        accent = (10, 10, 11)
    d = ImageDraw.Draw(canvas)
    py = _header(canvas, d, idx, item.get("headline", ""), item.get("sub", ""), brand_name,
                 ink, soft, accent, kit)
    first = contents[idx % len(contents)]
    if layout == "tilted":
        ph = H - py + 120
        pw = min(700, int(ph * 0.49))
        _place(canvas, _phone_layer(first, pw, ph), W // 2 + 30, py - 30, angle=-9)
    elif layout == "duo":
        pw = 470; ph = int(pw / 0.49)
        second = contents[(idx + 1) % len(contents)]
        _place(canvas, _phone_layer(first, pw, ph), 70 + pw // 2, py + 30)
        _place(canvas, _phone_layer(second, pw, ph), W - 70 - pw // 2, py + 200)
    elif layout == "callout":
        pw = 520; ph = int(pw / 0.49)
        _place(canvas, _phone_layer(first, pw, ph), W - 60 - pw // 2, py + 40)
        pts = [p.strip() for p in re.split(r"[,|\n]", item.get("points") or "") if p.strip()]
        pts = pts or ["Made in minutes", "Studio quality", "One-tap export"]
        d = ImageDraw.Draw(canvas)
        _callouts(d, pts, 70, py + 140, W - pw - 60 - 70 - 36, ink, accent if not light else (10, 10, 11),
                  _mix(top_rgb, ink, 0.1), kit)
    else:
        ph = H - py + 160
        pw = min(760, int(ph * 0.49))
        _place(canvas, _phone_layer(first, pw, ph), W // 2, py)
    buf = io.BytesIO()
    canvas.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def compose_all(contents: List[Image.Image], items: List[dict], bg_style: str, brand_name: str,
                layout: str = "classic", kit: Optional[dict] = None) -> List[bytes]:
    layout = layout if layout in LAYOUTS else "classic"
    return [compose_one(contents, it, i, bg_style, brand_name, layout, kit) for i, it in enumerate(items[:6])]


def compose_feature(img_bytes: bytes, brand_name: str, tagline: str, kit: Optional[dict] = None) -> bytes:
    """Overlay app name + tagline on the right (clean) half of a 1024x500 feature graphic."""
    kit = kit or {}
    FW, FH = 1024, 500
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    s = max(FW / img.width, FH / img.height)
    img = img.resize((int(img.width * s) + 1, int(img.height * s) + 1), Image.LANCZOS)
    img = img.crop(((img.width - FW) // 2, (img.height - FH) // 2, (img.width - FW) // 2 + FW, (img.height - FH) // 2 + FH))
    shade = Image.new("L", (FW, 1))
    for x in range(FW):
        shade.putpixel((x, 0), int(max(0, min(1, (x - 380) / 320)) * 225))
    img.paste(Image.new("RGB", (FW, FH), (8, 8, 10)), (0, 0), shade.resize((FW, FH)))
    d = ImageDraw.Draw(img)
    bold, reg = _fonts(kit)
    x0, tw = 560, 420
    nfont, nlines = _fit(d, brand_name.strip() or "App", bold, tw, (84, 76, 68, 60, 52, 44), 2)
    tfont = ImageFont.truetype(reg, 30)
    tlines = _wrap(d, (tagline or "").strip(), tfont, tw)[:2]
    logo = kit.get("logo")
    block = (84 if logo else 0) + len(nlines) * int(nfont.size * 1.05) + 30 + len(tlines) * 40
    y = (FH - block) // 2
    if logo:
        lg = logo.copy(); lg.thumbnail((68, 68))
        img.paste(lg, (x0, y), lg)
        y += 84
    for line in nlines:
        d.text((x0, y), line, font=nfont, fill=(255, 255, 255))
        y += int(nfont.size * 1.05)
    d.rounded_rectangle((x0, y + 8, x0 + 70, y + 16), radius=4, fill=_hex(kit.get("primary") or "#E2FF3D"))
    y += 30
    for line in tlines:
        d.text((x0, y), line, font=tfont, fill=(215, 215, 222))
        y += 40
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


TRANSITIONS = ["slideleft", "fade", "smoothup", "slideleft", "circleopen"]


def build_promo(pngs: List[bytes], music: Optional[bytes] = None, seg: float = 5.0) -> bytes:
    """6 screenshots → ~30s 1080x1920 MP4 with xfade transitions + optional music bed."""
    with tempfile.TemporaryDirectory() as td:
        cmd = [FFMPEG_BIN, "-y"]
        for i, p in enumerate(pngs):
            fp = Path(td) / f"s{i}.png"; fp.write_bytes(p)
            cmd += ["-loop", "1", "-t", f"{seg + 0.5}", "-framerate", "30", "-i", str(fp)]
        n = len(pngs)
        if music:
            mp = Path(td) / "m.mp3"; mp.write_bytes(music)
            cmd += ["-stream_loop", "-1", "-i", str(mp)]
        parts = [f"[{i}:v]scale=1080:1920,setsar=1,format=yuv420p[v{i}]" for i in range(n)]
        prev = "v0"
        for k in range(1, n):
            parts.append(f"[{prev}][v{k}]xfade=transition={TRANSITIONS[(k - 1) % 5]}:duration=0.5:offset={seg * k}[x{k}]")
            prev = f"x{k}"
        total = seg * n
        cmd += ["-filter_complex", ";".join(parts), "-map", f"[{prev}]"]
        if music:
            cmd += ["-map", f"{n}:a", "-af", f"afade=t=in:d=1,afade=t=out:st={total - 2.5}:d=2.5",
                    "-c:a", "aac", "-b:a", "128k"]
        out = Path(td) / "promo.mp4"
        cmd += ["-t", f"{total}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", "30",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=280)
        if not out.exists():
            raise RuntimeError(r.stderr[-400:])
        return out.read_bytes()
