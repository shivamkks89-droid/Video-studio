"""Campaign Pack export — bundles project video(s) + copy + assets into a ZIP."""
import io
import json
import zipfile
from typing import Optional


async def build_campaign_zip(project: dict, campaign_variations: Optional[list] = None,
                              ad_copy: Optional[dict] = None,
                              extra_files: Optional[list] = None) -> bytes:
    """Return raw ZIP bytes containing:
      - project.json (script, scenes summary, meta)
      - video/main.mp4 (if available)
      - copy/ad_copy.json (platform-specific copy)
      - campaign/*.json (multi-platform variations)
      - README.txt (usage notes)
    Any external file bytes are passed in via `extra_files`:
       [{"path": "assets/logo.png", "bytes": b"..."}]
    """
    from asset_store import fetch_to_bytes

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        # 1) project metadata
        clean = {k: v for k, v in project.items()
                 if k in ("project_id", "title", "video_type", "language", "aspect_ratio",
                          "duration_sec", "status", "script", "created_at", "updated_at")}
        z.writestr("project.json", json.dumps(clean, indent=2, default=str))

        # 2) main video
        video_url = project.get("video_url")
        if video_url:
            data = await fetch_to_bytes(video_url)
            if data:
                z.writestr("video/main.mp4", data)

        # 3) ad copy
        if ad_copy:
            z.writestr("copy/ad_copy.json", json.dumps(ad_copy, indent=2, ensure_ascii=False))

        # 4) campaign variations
        if campaign_variations:
            for i, v in enumerate(campaign_variations):
                plat = v.get("platform", f"v{i}")
                z.writestr(f"campaign/{plat}.json", json.dumps(v, indent=2, ensure_ascii=False))

        # 5) audio
        audio_url = project.get("audio_url")
        if audio_url:
            data = await fetch_to_bytes(audio_url)
            if data:
                z.writestr("audio/voiceover.mp3", data)

        # 6) thumbnails / scene images
        scenes = project.get("scenes") or []
        for i, sc in enumerate(scenes):
            img = sc.get("image_url")
            if not img:
                continue
            data = await fetch_to_bytes(img)
            if data:
                ext = "jpg" if img.lower().endswith(("jpg", "jpeg")) else "png"
                z.writestr(f"scenes/scene_{i+1:02d}.{ext}", data)

        # 7) extras
        for f in extra_files or []:
            z.writestr(f["path"], f["bytes"])

        # 8) readme
        z.writestr(
            "README.txt",
            "CineReel AI · Campaign Pack\n"
            "===========================\n\n"
            "- video/main.mp4        : rendered video (if available)\n"
            "- audio/voiceover.mp3   : final voiceover track\n"
            "- scenes/*.png          : all scene stills\n"
            "- campaign/*.json       : per-platform ad copy + hook variations\n"
            "- copy/ad_copy.json     : long-form ad copy for Meta/Google/YouTube/TikTok/LinkedIn\n"
            "- project.json          : project metadata + script\n\n"
            "Verify commercial usage rights for third-party music/stock assets before publishing.\n",
        )
    return buf.getvalue()
