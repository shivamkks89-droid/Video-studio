"""Android adaptive launcher icon builder (foreground + background + monochrome layers)."""
import io
import zipfile
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw

# 108dp canvas; the mark sits inside the 66dp safe-zone circle so no launcher mask clips it.
_MARK = (
    '<g transform="translate(54 52) scale(0.135) translate(-110 -148)">'
    '<path d="M0 40 L90 40 L170 156 L90 272 L0 272 L80 156 Z" fill="{back}" opacity="{back_op}"/>'
    '<path d="M40 0 L130 0 L220 148 L130 296 L40 296 L130 148 Z" fill="{front}"/>'
    '<circle cx="242" cy="302" r="26" fill="{dot}" opacity="{halo_op}"/>'
    '<circle cx="242" cy="302" r="18" fill="{dot}"/>'
    '</g>'
)

FG_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">'
    '<defs><linearGradient id="v" x1="0%" y1="0%" x2="100%" y2="100%">'
    '<stop offset="0%" stop-color="#F0FF66"/><stop offset="55%" stop-color="#E2FF3D"/>'
    '<stop offset="100%" stop-color="#BFDD22"/></linearGradient></defs>'
    + _MARK.format(back="#BFDD22", back_op="0.55", front="url(#v)", dot="#E2FF3D", halo_op="0.18")
    + '</svg>'
)

BG_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">'
    '<defs><radialGradient id="h" cx="50%" cy="44%" r="58%">'
    '<stop offset="0%" stop-color="#E2FF3D" stop-opacity="0.26"/>'
    '<stop offset="55%" stop-color="#E2FF3D" stop-opacity="0.05"/>'
    '<stop offset="100%" stop-color="#E2FF3D" stop-opacity="0"/></radialGradient>'
    '<linearGradient id="s" x1="0%" y1="0%" x2="0%" y2="100%">'
    '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>'
    '<stop offset="50%" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>'
    '<rect width="108" height="108" fill="#0A0A0B"/>'
    '<rect width="108" height="108" fill="url(#h)"/>'
    '<rect width="108" height="54" fill="url(#s)"/>'
    '<g opacity="0.05" stroke="#ffffff" stroke-width="0.3">'
    '<line x1="-8" y1="26" x2="42" y2="-8"/><line x1="-8" y1="46" x2="64" y2="-8"/>'
    '<line x1="42" y1="116" x2="116" y2="42"/></g>'
    '</svg>'
)

MONO_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">'
    + _MARK.format(back="#FFFFFF", back_op="0.55", front="#FFFFFF", dot="#FFFFFF", halo_op="0")
    + '</svg>'
)

ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_bg" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
"""

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

README = """CineReel AI - Android Adaptive Icon
====================================
Copy the `res/` folder into  android/app/src/main/  (merge + replace).

Layers (108dp canvas, mark kept inside the 66dp safe zone):
  mipmap-*/ic_launcher_foreground.png  - lime Volt-Play mark (transparent)
  mipmap-*/ic_launcher_bg.png          - near-black + lime halo background
  mipmap-*/ic_launcher_monochrome.png  - Android 13+ themed icon layer
  mipmap-*/ic_launcher.png / _round    - legacy icons for Android 7 and below
  mipmap-anydpi-v26/*.xml              - adaptive icon definitions

Important: make sure ic_launcher_background is defined only ONCE in res/values
(delete res/values/ic_launcher_background.xml if colors.xml already has it).
"""


def _png(svg: str, px: int) -> Image.Image:
    raw = cairosvg.svg2png(bytestring=svg.encode(), output_width=px, output_height=px)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def composite(px: int, shape: str = "squircle") -> Image.Image:
    """Full icon (bg + fg) masked to a launcher shape — used for legacy + preview."""
    img = _png(BG_SVG, px)
    img.alpha_composite(_png(FG_SVG, px))
    # Legacy icons use a 48dp canvas showing the 72dp centre of the 108dp layer.
    inset = round(px * 18 / 108)
    img = img.crop((inset, inset, px - inset, px - inset)).resize((px, px), Image.LANCZOS)
    mask = Image.new("L", (px * 4, px * 4), 0)
    d = ImageDraw.Draw(mask)
    if shape == "circle":
        d.ellipse((0, 0, px * 4 - 1, px * 4 - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, px * 4 - 1, px * 4 - 1), radius=int(px * 4 * 0.22), fill=255)
    img.putalpha(mask.resize((px, px), Image.LANCZOS))
    return img


def layer_png(name: str, px: int = 432) -> bytes:
    src = {"foreground": lambda: _png(FG_SVG, px), "background": lambda: _png(BG_SVG, px),
           "monochrome": lambda: _png(MONO_SVG, px),
           "squircle": lambda: composite(px, "squircle"), "circle": lambda: composite(px, "circle")}
    buf = io.BytesIO()
    src[name]().save(buf, "PNG")
    return buf.getvalue()


def build_files() -> dict:
    files = {}
    for dens, k in DENSITIES.items():
        layer_px, legacy_px = int(108 * k), int(48 * k)
        for name, svg in (("ic_launcher_foreground", FG_SVG), ("ic_launcher_bg", BG_SVG),
                          ("ic_launcher_monochrome", MONO_SVG)):
            buf = io.BytesIO(); _png(svg, layer_px).save(buf, "PNG")
            files[f"res/mipmap-{dens}/{name}.png"] = buf.getvalue()
        for name, shape in (("ic_launcher", "squircle"), ("ic_launcher_round", "circle")):
            buf = io.BytesIO(); composite(legacy_px, shape).save(buf, "PNG")
            files[f"res/mipmap-{dens}/{name}.png"] = buf.getvalue()
    files["res/mipmap-anydpi-v26/ic_launcher.xml"] = ADAPTIVE_XML.encode()
    files["res/mipmap-anydpi-v26/ic_launcher_round.xml"] = ADAPTIVE_XML.encode()
    files["source/foreground.svg"] = FG_SVG.encode()
    files["source/background.svg"] = BG_SVG.encode()
    files["source/monochrome.svg"] = MONO_SVG.encode()
    buf = io.BytesIO(); composite(512, "squircle").save(buf, "PNG")
    files["playstore-icon-512.png"] = buf.getvalue()
    files["README.txt"] = README.encode()
    return files


def build_zip() -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path, data in build_files().items():
            z.writestr(f"cinereel-adaptive-icon/{path}", data)
    return out.getvalue()


def install_into(android_main: Path) -> int:
    """Write the res/ layers straight into an Android project's src/main folder."""
    count = 0
    for path, data in build_files().items():
        if not path.startswith("res/"):
            continue
        dest = android_main / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        count += 1
    dup = android_main / "res/values/ic_launcher_background.xml"
    if dup.exists():
        dup.unlink()
    return count
