"""Play Store kit: captures real CineReel screens (phone / 7" / 10" tablet) and composes framed, headlined PNGs + icon + feature graphic into a ZIP."""
import asyncio, io, json, os, sys, zipfile, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, "/app/backend")
from playstore_shots import _gradient, _fit, _wrap, _fonts, _round_mask, _place, _mix, compose_feature  # noqa: E402

BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("REACT_APP_BACKEND_URL=")][0]
OUT = Path("/app/backend/static/kit")
ACC = (226, 255, 61)

SCREENS = [
    ("/", "Script se Video, 1 tap me", "AI reels aur ads minutes me", "Script to video in one tap", "AI reels & ads in minutes"),
    ("/dashboard", "Aapka poora studio, ek jagah", "Projects, credits aur quick actions", "Your whole studio in one place", "Projects, credits & quick actions"),
    ("PROJECT", "Har scene AI se taiyaar", "Storyboard, images aur voiceover", "Every scene, made by AI", "Storyboard, visuals & voiceover"),
    ("/dashboard/script", "Viral script likho seconds me", "Hook, body aur CTA — Hinglish me bhi", "Write viral scripts in seconds", "Hook, body & CTA in any language"),
    ("/dashboard/voice", "Apni awaaz, perfect sync", "AI voice ya apna audio upload karo", "Your voice, perfectly synced", "AI voices or upload your own audio"),
    ("/dashboard/ad-studio", "Product ad banao bina editor ke", "Website ya app link se ad concept", "Product ads without an editor", "Turn any link into ad concepts"),
    ("/dashboard/kinetic", "Kinetic text jo dhyan kheeche", "Word-by-word animated captions", "Kinetic text that grabs attention", "Word-by-word animated captions"),
    ("/pricing", "Free shuru karo, jab chaho upgrade", "UPI aur cards se plans", "Start free, upgrade anytime", "Simple plans with UPI & cards"),
]
DEVICES = {  # name: (viewport w, h, dpr, canvas w, h, frame radius factor)
    "phone": (412, 732, 2.625, 1080, 1920, 0.13),
    "tablet-7in": (600, 960, 2, 1200, 1920, 0.06),
    "tablet-10in": (800, 1280, 2, 1600, 2560, 0.05),
}


def frame(content, fw, fh, rf):
    layer = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    r = int(fw * rf)
    layer.paste(Image.new("RGBA", (fw, fh), (18, 18, 20, 255)), (0, 0), _round_mask(fw, fh, r))
    ImageDraw.Draw(layer).rounded_rectangle((1, 1, fw - 2, fh - 2), radius=r, outline=(62, 62, 68, 255), width=4)
    bez = max(14, fw // 34)
    sw, sh = fw - 2 * bez, fh - 2 * bez
    scr = content.convert("RGB").resize((sw, int(content.height * sw / content.width)))
    scr = scr.crop((0, 0, sw, sh)) if scr.height >= sh else scr
    layer.paste(scr, (bez, bez), _round_mask(scr.width, scr.height, int(r * 0.85)))
    return layer


def compose(content, cw, ch, rf, idx, head, sub):
    s = cw / 1080
    canvas = _gradient((10, 10, 11), _mix((0, 0, 0), ACC, 0.13), cw, ch)
    glow = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(glow).ellipse((cw // 2 - int(520 * s), int(ch * 0.47), cw // 2 + int(520 * s), ch), fill=60)
    canvas.paste(Image.new("RGB", (cw, ch), ACC), (0, 0), glow.filter(ImageFilter.GaussianBlur(int(160 * s))))
    d = ImageDraw.Draw(canvas)
    bold, reg = _fonts({})
    pf = ImageFont.truetype(bold, int(30 * s))
    label = f"{idx + 1:02d}  ·  CINEREEL AI"
    x0, y0 = int(80 * s), int(96 * s)
    d.rounded_rectangle((x0, y0, x0 + int(d.textlength(label, font=pf)) + int(48 * s), y0 + int(54 * s)), radius=int(27 * s), outline=ACC, width=3)
    d.text((x0 + int(24 * s), y0 + int(10 * s)), label, font=pf, fill=ACC)
    font, lines = _fit(d, head, bold, cw - 2 * x0, tuple(int(v * s) for v in (96, 88, 80, 72, 64)), 2)
    y = int(190 * s)
    for ln in lines:
        d.text((x0, y), ln, font=font, fill=(255, 255, 255)); y += int(font.size * 1.08)
    sf = ImageFont.truetype(reg, int(40 * s))
    for ln in _wrap(d, sub, sf, cw - 2 * x0)[:2]:
        d.text((x0, y + int(14 * s)), ln, font=sf, fill=(190, 190, 196)); y += int(50 * s)
    top = y + int(70 * s)
    fh = ch - top + int(160 * s)
    fw = min(int(cw * 0.78), int(fh * content.width / content.height))
    _place(canvas, frame(content, fw, int(fw * content.height / content.width), rf), cw // 2, top)
    buf = io.BytesIO(); canvas.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def feature(a, b):
    W2, H2 = 1024, 500
    c = _gradient((10, 10, 11), _mix((0, 0, 0), ACC, 0.18), W2, H2)
    g = Image.new("L", (W2, H2), 0); ImageDraw.Draw(g).ellipse((560, 60, 1100, 640), fill=70)
    c.paste(Image.new("RGB", (W2, H2), ACC), (0, 0), g.filter(ImageFilter.GaussianBlur(90)))
    d = ImageDraw.Draw(c); bold, reg = _fonts({})
    d.text((56, 120), "CineReel AI", font=ImageFont.truetype(bold, 74), fill=(255, 255, 255))
    d.rounded_rectangle((58, 214, 150, 222), radius=4, fill=ACC)
    d.text((56, 246), "Script se video, 1 tap me", font=ImageFont.truetype(reg, 34), fill=(210, 210, 214))
    d.text((56, 300), "AI reels · ads · voiceover · captions", font=ImageFont.truetype(reg, 24), fill=(150, 150, 156))
    for img, cx, y, ang in ((b, 760, 70, 8), (a, 900, 40, -6)):
        _place(c, frame(img, 210, int(210 * img.height / img.width), 0.13), cx, y, ang)
    buf = io.BytesIO(); c.save(buf, "PNG"); return buf.getvalue()


def api(path, body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", **({"Authorization": f"Bearer {token}"} if token else {})})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


async def capture():
    from playwright.async_api import async_playwright
    email, pw = sys.argv[1], sys.argv[2]
    tok = api("/auth/login", {"email": email, "password": pw})["token"]
    projs = api("/projects", token=tok)
    projs = projs if isinstance(projs, list) else projs.get("projects", [])
    imgs = lambda q: sum(1 for s in api(f"/projects/{q['project_id']}", token=tok).get("scenes") or [] if s.get("image_url"))
    pid = max(projs[:25], key=imgs)["project_id"]
    shots = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for dev, (vw, vh, dpr, *_r) in DEVICES.items():
            ctx = await b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=dpr, is_mobile=True, has_touch=True)
            page = await ctx.new_page()
            await page.goto(BASE + "/login"); await page.evaluate(f"localStorage.setItem('cinereel_token','{tok}');localStorage.removeItem('cinereel_welcome')")
            for i, sc in enumerate(SCREENS):
                path = f"/dashboard/projects/{pid}" if sc[0] == "PROJECT" else sc[0]
                await page.goto(BASE + path); await page.wait_for_timeout(4500)
                if "kinetic" in sc[0]:
                    await page.evaluate("document.querySelector('[data-testid=cinematic-canvas]').scrollIntoView({block: 'start'}); window.scrollBy(0, -90)")
                    await page.wait_for_timeout(800)
                if sc[0] == "PROJECT":
                    await page.evaluate("(() => { const i = [...document.querySelectorAll('main img')].find(x => x.naturalWidth > 0); if (i) { i.scrollIntoView({block: 'start'}); window.scrollBy(0, -140); } })()")
                    await page.wait_for_timeout(800)
                await page.add_style_tag(content="[data-sonner-toaster],iframe,#emergent-badge,a[href*='emergent']{display:none!important}")
                shots[(dev, i)] = Image.open(io.BytesIO(await page.screenshot()))
            await ctx.close()
        icon = await b.new_page(viewport={"width": 512, "height": 512})
        await icon.set_content(f"<body style='margin:0;background:#0A0A0B'><img src='{BASE}/app-icon.svg' style='width:512px;height:512px'></body>")
        await icon.wait_for_timeout(1500)
        shots["icon"] = await icon.screenshot()
        await b.close()
    return shots


def main():
    shots = asyncio.run(capture())
    OUT.mkdir(parents=True, exist_ok=True)
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("icon-512.png", shots["icon"])
        land = io.BytesIO(); shots[("phone", 0)].convert("RGB").save(land, "PNG")
        z.writestr("feature-graphic-1024x500.png", feature(shots[("phone", 1)], shots[("phone", 2)]))
        for dev, (_vw, _vh, _d, cw, ch, rf) in DEVICES.items():
            for i, (_p, hh, hs, eh, es) in enumerate(SCREENS):
                for lang, h, s in (("hinglish", hh, hs), ("english", eh, es)):
                    z.writestr(f"{lang}/{dev}/{i + 1:02d}.png", compose(shots[(dev, i)], cw, ch, rf, i, h, s))
                raw = io.BytesIO(); shots[(dev, i)].save(raw, "PNG"); z.writestr(f"raw/{dev}/{i + 1:02d}.png", raw.getvalue())
    (OUT / "cinereel-playstore-kit.zip").write_bytes(zbuf.getvalue())
    print("ZIP", len(zbuf.getvalue()) // 1024, "KB")


if __name__ == "__main__":
    main()
