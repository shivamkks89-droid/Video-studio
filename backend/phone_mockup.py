"""Composite REAL app screenshots inside a clean phone frame (no AI-hallucinated screen UI)."""
import io
from PIL import Image, ImageDraw, ImageFilter, ImageOps


def _phone(shot: Image.Image, phone_h: int) -> Image.Image:
    sw, sh = shot.size
    phone_w = int(phone_h * 0.49)
    bez = max(6, phone_w // 28)
    r = phone_w // 7
    scr_w, scr_h = phone_w - 2 * bez, phone_h - 2 * bez
    shot = shot.convert("RGB")
    if abs(sw / sh - scr_w / scr_h) < 0.08:
        screen = ImageOps.fit(shot, (scr_w, scr_h), Image.LANCZOS, centering=(0.5, 0.0))
    else:  # never crop app UI: letterbox inside the screen
        screen = Image.new("RGB", (scr_w, scr_h), (10, 10, 11))
        fit = ImageOps.contain(shot, (scr_w, scr_h), Image.LANCZOS)
        screen.paste(fit, ((scr_w - fit.width) // 2, (scr_h - fit.height) // 2))
    frame = Image.new("RGBA", (phone_w, phone_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([0, 0, phone_w - 1, phone_h - 1], radius=r, fill=(12, 12, 14, 255),
                        outline=(70, 70, 76, 255), width=max(2, bez // 4))
    mask = Image.new("L", (scr_w, scr_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, scr_w - 1, scr_h - 1], radius=max(4, r - bez), fill=255)
    frame.paste(screen, (bez, bez), mask)
    cam = max(4, bez // 2)
    cx = phone_w // 2
    d.ellipse([cx - cam, bez + cam, cx + cam, bez + 3 * cam], fill=(0, 0, 0, 255))
    return frame


def _with_shadow(canvas: Image.Image, phone: Image.Image, x: int, y: int):
    pad = phone.width // 10
    sh = Image.new("RGBA", (phone.width + 2 * pad, phone.height + 2 * pad), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 150), (pad, pad + pad // 3), phone.split()[3])
    sh = sh.filter(ImageFilter.GaussianBlur(pad // 2))
    canvas.alpha_composite(sh, (x - pad, y - pad))
    canvas.alpha_composite(phone, (x, y))


def screenshot_scene(shot_bytes: bytes, w: int, h: int) -> bytes:
    """Full scene: blurred backdrop + real screenshot in a centred phone frame."""
    shot = Image.open(io.BytesIO(shot_bytes)).convert("RGB")
    bg = ImageOps.fit(shot, (w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(w // 25))
    bg = Image.blend(bg, Image.new("RGB", (w, h), (10, 10, 11)), 0.45).convert("RGBA")
    phone_h = int(min(h * 0.78, w * 0.9 / 0.49))
    phone = _phone(shot, phone_h)
    _with_shadow(bg, phone, (w - phone.width) // 2, (h - phone.height) // 2)
    out = io.BytesIO()
    bg.convert("RGB").save(out, "PNG")
    return out.getvalue()


def overlay_phone(scene_bytes: bytes, shot_bytes: bytes, w: int, h: int) -> bytes:
    """AI scene + real screenshot phone composited in the lower-right safe area."""
    scene = ImageOps.fit(Image.open(io.BytesIO(scene_bytes)).convert("RGB"), (w, h), Image.LANCZOS).convert("RGBA")
    shot = Image.open(io.BytesIO(shot_bytes))
    phone_h = int(min(h * 0.46, w * 0.42 / 0.49))
    phone = _phone(shot, phone_h)
    m = int(w * 0.06)
    _with_shadow(scene, phone, w - phone.width - m, int(h * 0.62) - phone.height // 2)
    out = io.BytesIO()
    scene.convert("RGB").save(out, "PNG")
    return out.getvalue()
