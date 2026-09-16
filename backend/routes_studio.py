"""Studio routes — Ad Studio, Workspaces, Voice Upload, STT, Multi-Creative,
Campaign, Compliance, Creative Score, Music library, Version history,
Format Resizer, Credit-estimate.

All routes are prefixed with the shared `/api` prefix (mounted from server.py).
Every LLM/asset-heavy endpoint charges credits up-front and refunds on failure.
"""
import asyncio
import base64
import io
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel

from models import (
    AdCopyRequest, CampaignRequest, ComplianceRequest, CreativeScoreRequest,
    CreditsEstimateRequest, MultiCreativeRequest, MultiPlatformResizeRequest,
    ProjectVersion, STTRequest, ScriptRefineRequest, Workspace, WorkspaceCreate,
    Project, new_id, utc_now, CreditTransaction,
    PronunciationCheckRequest, FeedbackRequest, CommercialCheckRequest,
    Avatar, AvatarGenerateRequest, LipSyncRequest,
    PlayStoreAssetsRequest, CampaignQuickRequest, LipSyncRenderModeRequest,
)
from ai_services import (
    check_compliance, generate_ad_copy, generate_campaign, generate_multi_creatives,
    refine_script, score_creative, check_pronunciation, analyse_feedback,
    commercial_check as commercial_qa, generate_scene_image,
)
from stt_service import transcribe_audio
from music_library import MUSIC_TRACKS, SFX_LIBRARY
from campaign_pack import build_campaign_zip
from asset_store import save_audio_data_uri as save_audio_persistent, fetch_to_bytes
from video_renderer import render_video


log = logging.getLogger(__name__)


def build_studio_router(db, current_user_dep, charge_credits, refund):
    """Factory that binds routes to the same db/auth helpers as server.py."""
    router = APIRouter()

    # ---------- CREDIT ESTIMATE ----------
    COSTS = {
        "script": 5, "variants": 15, "tts": 2, "scene_image": 3,
        "storyboard": 18, "render": 10, "multi_creative": 6, "ad_copy": 4,
        "campaign": 8, "video_clip": 20, "seedance_clip": 60, "sora_clip": 40,
        "creative_score": 2, "compliance": 2, "stt": 4, "refine": 2,
        "resize": 8, "campaign_pack": 3, "voice_clone": 25,
    }

    @router.post("/ai/estimate")
    async def estimate_credits(body: CreditsEstimateRequest, request: Request):
        user = await current_user_dep(request)
        base = COSTS.get(body.action, 5)
        # Per-scene cost applies to storyboard/render/seedance
        total = base * max(1, body.count)
        breakdown = [{"item": body.action, "unit": base, "count": max(1, body.count), "total": total}]
        return {
            "estimate": total, "credits_left": user.credits, "breakdown": breakdown,
            "can_afford": user.credits >= total,
        }

    # ---------- SCRIPT REFINEMENT ----------
    @router.post("/ai/script/refine")
    async def script_refine(body: ScriptRefineRequest, request: Request):
        user = await current_user_dep(request)
        if not body.script_text.strip():
            raise HTTPException(status_code=400, detail="Empty script")
        user = await charge_credits(user, COSTS["refine"], f"refine_{body.action}")
        try:
            out = await refine_script(
                text=body.script_text, action=body.action, language=body.language,
                tone=body.tone, target_duration_sec=body.target_duration_sec,
                target_language=body.target_language,
            )
        except Exception as e:
            await refund(user, COSTS["refine"], f"refine_{body.action}")
            raise HTTPException(status_code=500, detail=f"Refine failed: {str(e)[:160]}")
        # Estimate word count + duration (avg 2.5 words/sec of ad voiceover)
        word_count = len(out.split())
        est_dur = max(5, round(word_count / 2.5))
        return {
            "text": out, "word_count": word_count, "char_count": len(out),
            "estimated_duration_sec": est_dur, "credits_left": user.credits,
        }

    # ---------- MULTI-CREATIVE ----------
    @router.post("/ai/multi-creative")
    async def multi_creative(body: MultiCreativeRequest, request: Request):
        user = await current_user_dep(request)
        cost = COSTS["multi_creative"] * body.count
        user = await charge_credits(user, cost, f"multi_creative_{body.count}")
        try:
            variants = await generate_multi_creatives(
                topic=body.topic, count=body.count, language=body.language,
                tone=body.tone, brand_name=body.brand_name,
            )
        except Exception as e:
            await refund(user, cost, "multi_creative_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        if not variants:
            await refund(user, cost, "multi_creative_empty")
            return {"variants": [], "credits_left": user.credits, "error": "No variants generated"}
        if body.project_id:
            await db.projects.update_one(
                {"project_id": body.project_id, "user_id": user.user_id},
                {"$set": {"multi_creative": variants, "updated_at": utc_now().isoformat()}},
            )
        return {"variants": variants, "credits_left": user.credits}

    # ---------- AD COPY GENERATOR ----------
    @router.post("/ai/ad-copy")
    async def ad_copy(body: AdCopyRequest, request: Request):
        user = await current_user_dep(request)
        cost = COSTS["ad_copy"] + max(0, len(body.platforms) - 1) * 2
        user = await charge_credits(user, cost, "ad_copy")
        try:
            out = await generate_ad_copy(
                topic=body.topic, hook=body.hook, body=body.body, cta=body.cta,
                platforms=body.platforms, language=body.language, tone=body.tone,
                length=body.length, brand_name=body.brand_name,
            )
        except Exception as e:
            await refund(user, cost, "ad_copy_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        return {"platforms": out, "credits_left": user.credits}

    # ---------- CAMPAIGN (one project → all platforms) ----------
    @router.post("/ai/campaign")
    async def ai_campaign(body: CampaignRequest, request: Request):
        user = await current_user_dep(request)
        cost = COSTS["campaign"] + max(0, len(body.platforms) - 4)
        user = await charge_credits(user, cost, "campaign")
        try:
            campaign = await generate_campaign(
                topic=body.topic, platforms=body.platforms, hook=body.hook,
                body=body.body, cta=body.cta, language=body.language,
            )
        except Exception as e:
            await refund(user, cost, "campaign_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        if body.project_id:
            await db.projects.update_one(
                {"project_id": body.project_id, "user_id": user.user_id},
                {"$set": {"campaign": campaign, "updated_at": utc_now().isoformat()}},
            )
        return {"campaign": campaign, "credits_left": user.credits}

    # ---------- CREATIVE SCORE ----------
    @router.post("/ai/creative-score")
    async def creative_score(body: CreativeScoreRequest, request: Request):
        user = await current_user_dep(request)
        user = await charge_credits(user, COSTS["creative_score"], "creative_score")
        try:
            out = await score_creative(hook=body.hook, body=body.body, cta=body.cta,
                                        platform=body.platform, language=body.language)
        except Exception as e:
            await refund(user, COSTS["creative_score"], "creative_score_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        return {**out, "credits_left": user.credits}

    # ---------- COMPLIANCE ----------
    @router.post("/ai/compliance")
    async def compliance(body: ComplianceRequest, request: Request):
        user = await current_user_dep(request)
        user = await charge_credits(user, COSTS["compliance"], "compliance")
        try:
            out = await check_compliance(body.text, body.platform, body.language)
        except Exception as e:
            await refund(user, COSTS["compliance"], "compliance_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        return {**out, "credits_left": user.credits}

    # ---------- UNIVERSAL VOICE-QUALITY: PRONUNCIATION CHECK ----------
    @router.post("/ai/pronunciation-check")
    async def pronunciation_check(body: PronunciationCheckRequest, request: Request):
        user = await current_user_dep(request)
        if not body.text.strip():
            raise HTTPException(status_code=400, detail="Empty text")
        user = await charge_credits(user, 3, "pronunciation_check")
        try:
            out = await check_pronunciation(body.text, body.language, body.known_names)
        except Exception as e:
            await refund(user, 3, "pronunciation_check_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        return {**out, "credits_left": user.credits}

    # ---------- UNIVERSAL VOICE-QUALITY: FEEDBACK + AUTO-FIX ----------
    @router.post("/ai/feedback")
    async def feedback(body: FeedbackRequest, request: Request):
        user = await current_user_dep(request)
        proj = await db.projects.find_one(
            {"project_id": body.project_id, "user_id": user.user_id}, {"_id": 0},
        )
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        user = await charge_credits(user, 4, "feedback_analyse")
        try:
            plan = await analyse_feedback(
                tags=body.tags, free_text=body.free_text, context=body.context,
                project_summary=proj,
            )
        except Exception as e:
            await refund(user, 4, "feedback_analyse_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        # Persist feedback for analytics + append to project
        record = {
            "project_id": body.project_id,
            "user_id": user.user_id,
            "tags": body.tags, "free_text": body.free_text,
            "context": body.context, "plan": plan,
            "created_at": utc_now().isoformat(),
        }
        await db.feedback.insert_one(dict(record))
        # Build an "apply patch" the frontend can send to /projects/{id} PUT
        patch = _build_apply_patch(plan, proj)
        return {**plan, "apply_patch": patch, "credits_left": user.credits}

    # ---------- UNIVERSAL VOICE-QUALITY: COMMERCIAL CHECK ----------
    @router.post("/ai/commercial-check")
    async def commercial_check_ep(body: CommercialCheckRequest, request: Request):
        user = await current_user_dep(request)
        proj = await db.projects.find_one(
            {"project_id": body.project_id, "user_id": user.user_id}, {"_id": 0},
        )
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        user = await charge_credits(user, 3, "commercial_check")
        try:
            out = await commercial_qa(proj)
        except Exception as e:
            await refund(user, 3, "commercial_check_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        return {**out, "credits_left": user.credits}

    # ---------- BURN CAPTIONS: transcribe + save word-level timing ----------
    class CaptionsGenReq(BaseModel):
        project_id: str
        style: Optional[dict] = None  # {font, font_size, margin_v, group_size}

    @router.post("/projects/captions/generate")
    async def generate_captions(body: CaptionsGenReq, request: Request):
        user = await current_user_dep(request)
        proj = await db.projects.find_one(
            {"project_id": body.project_id, "user_id": user.user_id}, {"_id": 0},
        )
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        audio_url = proj.get("audio_url")
        if not audio_url:
            raise HTTPException(status_code=400, detail="Generate voiceover first")
        audio_bytes = await fetch_to_bytes(audio_url)
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Could not read audio")
        user = await charge_credits(user, 4, "captions_generate")
        result = await transcribe_audio(audio_bytes, "auto")
        if result.get("error"):
            await refund(user, 4, "captions_error")
            raise HTTPException(status_code=500, detail=result["error"])
        # Build word-level list. Whisper may return `words` OR only segments.
        words = result.get("words") or []
        if not words:
            # Fallback: split each segment's text uniformly across its duration
            for seg in (result.get("segments") or []):
                txt = (seg.get("text") or "").strip().split()
                if not txt:
                    continue
                s = float(seg.get("start", 0))
                e = float(seg.get("end", s + 1))
                dur = max(0.1, (e - s) / max(1, len(txt)))
                for i, w in enumerate(txt):
                    words.append({"word": w, "start": s + i * dur, "end": s + (i + 1) * dur})
        # Normalize keys
        words = [{"word": w.get("word") or w.get("text") or "",
                   "start": float(w.get("start", 0)),
                   "end": float(w.get("end", 0))} for w in words if (w.get("word") or w.get("text"))]
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {
                "caption_words": words,
                "caption_style": body.style or {},
                "captions_enabled": True,
                "updated_at": utc_now().isoformat(),
            }},
        )
        return {"count": len(words), "captions_enabled": True, "credits_left": user.credits}

    class CaptionsToggleReq(BaseModel):
        project_id: str
        enabled: bool

    @router.post("/projects/captions/toggle")
    async def toggle_captions(body: CaptionsToggleReq, request: Request):
        user = await current_user_dep(request)
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {"captions_enabled": body.enabled, "updated_at": utc_now().isoformat()}},
        )
        return {"ok": True, "captions_enabled": body.enabled}

    # ---------- AVATAR STUDIO ----------
    @router.get("/avatars/status")
    async def avatars_status():
        from avatar_provider import provider_status
        return provider_status()

    @router.get("/avatars")
    async def list_avatars(request: Request):
        user = await current_user_dep(request)
        return await db.avatars.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.post("/avatars/generate")
    async def gen_avatar(body: AvatarGenerateRequest, request: Request):
        user = await current_user_dep(request)
        user = await charge_credits(user, 15, "avatar_generate")
        from avatar_provider import get_generator
        gen = get_generator()
        result = await gen.generate_avatar_image(body.prompt, body.style)
        if result.get("error"):
            await refund(user, 15, "avatar_generate_error")
            raise HTTPException(status_code=500, detail=result["error"])
        av = Avatar(
            user_id=user.user_id, name=body.name, image_url=result["image_url"],
            source="generated", prompt=body.prompt, style=body.style,
            gender=body.gender, age_range=body.age_range, provider=result["provider"],
        )
        d = av.model_dump(); d["created_at"] = d["created_at"].isoformat()
        await db.avatars.insert_one(dict(d))
        return {**d, "credits_left": user.credits}

    @router.post("/avatars/upload")
    async def upload_avatar(request: Request, file: UploadFile = File(...),
                             name: str = Form("My avatar"),
                             gender: Optional[str] = Form(None),
                             style: str = Form("presenter")):
        user = await current_user_dep(request)
        if file.content_type and "image" not in file.content_type:
            raise HTTPException(status_code=400, detail="Only image files")
        raw = await file.read()
        if len(raw) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Max 10 MB")
        mime = file.content_type or "image/png"
        b64 = base64.b64encode(raw).decode()
        data_uri = f"data:{mime};base64,{b64}"
        # Reuse the image asset store
        from image_store import save_data_uri
        url = save_data_uri(data_uri) or data_uri
        av = Avatar(user_id=user.user_id, name=name, image_url=url,
                    source="uploaded", style=style, gender=gender, provider="upload")
        d = av.model_dump(); d["created_at"] = d["created_at"].isoformat()
        await db.avatars.insert_one(dict(d))
        return d

    @router.delete("/avatars/{avatar_id}")
    async def delete_avatar(avatar_id: str, request: Request):
        user = await current_user_dep(request)
        await db.avatars.delete_one({"avatar_id": avatar_id, "user_id": user.user_id})
        return {"ok": True}

    class AvatarAttachReq(BaseModel):
        project_id: str
        avatar_id: str

    @router.post("/projects/avatar/attach")
    async def attach_avatar(body: AvatarAttachReq, request: Request):
        user = await current_user_dep(request)
        av = await db.avatars.find_one(
            {"avatar_id": body.avatar_id, "user_id": user.user_id}, {"_id": 0},
        )
        if not av:
            raise HTTPException(status_code=404, detail="Avatar not found")
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {"avatar_id": av["avatar_id"], "avatar_image": av["image_url"],
                      "updated_at": utc_now().isoformat()}},
        )
        return {"ok": True, "avatar_id": av["avatar_id"], "image_url": av["image_url"]}

    @router.post("/avatars/lipsync")
    async def lipsync_avatar(body: LipSyncRequest, request: Request):
        user = await current_user_dep(request)
        proj = await db.projects.find_one(
            {"project_id": body.project_id, "user_id": user.user_id}, {"_id": 0},
        )
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        av = await db.avatars.find_one(
            {"avatar_id": body.avatar_id, "user_id": user.user_id}, {"_id": 0},
        )
        if not av:
            raise HTTPException(status_code=404, detail="Avatar not found")
        if not proj.get("audio_url"):
            raise HTTPException(status_code=400, detail="Generate voiceover first")
        from avatar_provider import get_lipsync
        provider = get_lipsync()
        if not provider:
            raise HTTPException(
                status_code=402,
                detail=("No lip-sync provider configured. Add HEYGEN_API_KEY or DID_API_KEY "
                        "to backend .env to enable talking-avatar rendering."),
            )
        # Charge before starting (lipsync is heavy). Refund on failure.
        user = await charge_credits(user, 20, "lipsync_generate")
        # Build absolute URLs so fal.ai can fetch them.
        import os as _os
        base = (_os.environ.get("PUBLIC_BACKEND_URL")
                or _os.environ.get("REACT_APP_BACKEND_URL")
                or "").rstrip("/")
        def _abs(u: str) -> str:
            if not u:
                return u
            if u.startswith("http://") or u.startswith("https://") or u.startswith("data:"):
                return u
            if u.startswith("/") and base:
                return f"{base}{u}"
            return u
        result = await provider.create_talking_video(
            _abs(av["image_url"]), _abs(proj["audio_url"]),
            proj.get("caption_words"),
        )
        if result.get("error"):
            await refund(user, 20, "lipsync_error")
            raise HTTPException(status_code=400, detail=result["error"])
        # Save the lipsynced MP4 to project so the renderer can mux it in.
        vurl = result.get("video_url")
        default_mode = proj.get("talking_avatar_mode") or "pip_br"
        if default_mode == "off":
            default_mode = "pip_br"
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {
                "talking_avatar_url": vurl,
                "talking_avatar_mode": default_mode,
                "avatar_id": av["avatar_id"],
                "avatar_image": av["image_url"],
                "updated_at": utc_now().isoformat(),
            }},
        )
        return {**result, "avatar_id": av["avatar_id"],
                "talking_avatar_mode": default_mode,
                "credits_left": user.credits}

    @router.post("/projects/lipsync/mode")
    async def set_lipsync_mode(body: LipSyncRenderModeRequest, request: Request):
        user = await current_user_dep(request)
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {"talking_avatar_mode": body.mode,
                       "updated_at": utc_now().isoformat()}},
        )
        return {"ok": True, "talking_avatar_mode": body.mode}

    class LipSyncClearReq(BaseModel):
        project_id: str

    @router.post("/projects/lipsync/clear")
    async def clear_lipsync(body: LipSyncClearReq, request: Request):
        user = await current_user_dep(request)
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {"talking_avatar_url": None, "talking_avatar_mode": "off",
                       "updated_at": utc_now().isoformat()}},
        )
        return {"ok": True}

    # ---------- CAMPAIGN QUICK PACK (one-click 5 platforms) ----------
    @router.post("/ai/campaign-quick")
    async def campaign_quick(body: CampaignQuickRequest, request: Request):
        """One-click 5-platform ad pack: Meta (IG Reel + FB), Google (YouTube Ad),
        TikTok, YouTube Shorts, LinkedIn."""
        user = await current_user_dep(request)
        target_platforms = ["instagram_reel", "youtube_ad", "tiktok",
                            "youtube_short", "linkedin_ad"]
        cost = 12  # flat one-click bundle price
        user = await charge_credits(user, cost, "campaign_quick_5")
        try:
            campaign = await generate_campaign(
                topic=body.topic, platforms=target_platforms, hook=body.hook,
                body=body.body, cta=body.cta, language=body.language,
            )
        except Exception as e:
            await refund(user, cost, "campaign_quick_error")
            raise HTTPException(status_code=500, detail=str(e)[:160])
        # Filter to only our target platforms (AI sometimes adds extras).
        if isinstance(campaign, list):
            campaign = [c for c in campaign if c.get("platform") in target_platforms]
            # Ensure every target platform has at least a placeholder so the UI
            # renders 5 cards even if the model dropped one.
            existing = {c.get("platform") for c in campaign}
            for p in target_platforms:
                if p not in existing:
                    campaign.append({
                        "platform": p, "hook": body.hook or "", "script": body.body or "",
                        "cta": body.cta or "", "on_screen_text": "", "caption": "",
                    })
            # Preserve target order
            order = {p: i for i, p in enumerate(target_platforms)}
            campaign.sort(key=lambda c: order.get(c.get("platform"), 99))
        if body.project_id:
            await db.projects.update_one(
                {"project_id": body.project_id, "user_id": user.user_id},
                {"$set": {"campaign": campaign, "updated_at": utc_now().isoformat()}},
            )
        return {"campaign": campaign, "platforms": target_platforms,
                "credits_left": user.credits}

    # ---------- PLAY STORE ASSETS (App icon + Feature graphic) ----------
    @router.post("/studio/playstore-assets")
    async def playstore_assets(body: PlayStoreAssetsRequest, request: Request):
        """Generate Play Store app icon (512×512) + feature graphic (1024×500)."""
        user = await current_user_dep(request)
        if not body.brand_name.strip():
            raise HTTPException(status_code=400, detail="Brand name required")
        cost = 6 * ((1 if body.generate_icon else 0) + (1 if body.generate_feature else 0))
        if cost == 0:
            raise HTTPException(status_code=400, detail="Nothing to generate")
        user = await charge_credits(user, cost, "playstore_assets")

        style_hints = {
            "modern":  "modern flat design, bold geometry, high contrast",
            "minimal": "ultra minimal, single icon shape, generous negative space",
            "playful": "friendly rounded shapes, cheerful colours, playful vibe",
            "premium": "premium luxury feel, gold accents, deep dark background",
            "tech":    "futuristic, neon glow, tech grid, sharp edges",
        }
        style_line = style_hints.get(body.style, style_hints["modern"])
        icon_hint = body.icon_description or f"symbolic icon representing {body.brand_name}"
        color = body.primary_color or "#E2FF3D"

        icon_url = None
        feature_url = None

        try:
            if body.generate_icon:
                icon_prompt = (
                    f"Google Play Store app icon for '{body.brand_name}'. "
                    f"Square 1:1 aspect ratio, centred single glyph, {style_line}. "
                    f"Solid rich background using brand colour {color}. "
                    f"Bold, memorable, extremely simple, crisp edges, works at 48px thumbnail size. "
                    f"Element: {icon_hint}. "
                    f"Absolutely NO text, NO letters, NO logotype, NO UI, NO shadows outside the icon. "
                    f"Just the icon shape on the solid background."
                )
                icon_url = await generate_scene_image(icon_prompt, "1:1")

            if body.generate_feature:
                # Feature graphic is 1024×500 (~2:1) — closest supported aspect is 16:9.
                feature_prompt = (
                    f"Google Play Store feature graphic banner for '{body.brand_name}' — "
                    f"wide landscape 1024x500 aspect. {style_line}. "
                    f"Use brand colour {color} with complementary accents. "
                    f"Left side: bold hero visual showing the app's purpose ({icon_hint}). "
                    f"Right side: intentionally left CLEAN with breathing room "
                    f"(store overlays app name there). "
                    f"Cinematic depth, subtle gradient, premium finish. "
                    f"Absolutely NO text, NO logo, NO app screenshots inside the image."
                )
                if body.tagline:
                    feature_prompt += f" Overall mood: {body.tagline}."
                feature_url = await generate_scene_image(feature_prompt, "16:9")
        except Exception as e:
            await refund(user, cost, "playstore_error")
            raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)[:160]}")

        if body.generate_icon and not icon_url:
            await refund(user, 6, "playstore_icon_missing")
        if body.generate_feature and not feature_url:
            await refund(user, 6, "playstore_feature_missing")

        # Persist for later re-download
        record = {
            "id": new_id("psa"),
            "user_id": user.user_id,
            "brand_name": body.brand_name,
            "tagline": body.tagline,
            "style": body.style,
            "primary_color": color,
            "icon_url": icon_url,
            "feature_url": feature_url,
            "created_at": utc_now().isoformat(),
        }
        await db.playstore_assets.insert_one(dict(record))
        return {
            "icon_url": icon_url, "feature_url": feature_url,
            "icon_size": "512x512", "feature_size": "1024x500",
            "credits_left": user.credits,
        }

    @router.get("/studio/playstore-assets")
    async def list_playstore_assets(request: Request):
        user = await current_user_dep(request)
        return await db.playstore_assets.find(
            {"user_id": user.user_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)

    # ---------- STT / TRANSCRIPTION ----------
    @router.post("/ai/stt")
    async def stt(body: STTRequest, request: Request):
        user = await current_user_dep(request)
        # Pull audio bytes from our object-storage-backed asset store
        audio = await fetch_to_bytes(body.audio_url)
        if not audio:
            raise HTTPException(status_code=400, detail="Could not read audio at that URL.")
        user = await charge_credits(user, COSTS["stt"], "stt")
        result = await transcribe_audio(audio, body.language or "auto")
        if result.get("error"):
            await refund(user, COSTS["stt"], "stt_error")
            return {"error": result["error"], "credits_left": user.credits, "refunded": True}
        # Build a natural scene split from segments (every ~5s or sentence).
        segments = result.get("segments") or []
        scenes = _segments_to_scenes(segments, result.get("duration") or 0)
        return {
            "transcript": result.get("text", ""),
            "language": result.get("language"),
            "segments": segments, "words": result.get("words"),
            "duration": result.get("duration"),
            "auto_scenes": scenes,
            "credits_left": user.credits,
        }

    # ---------- VOICE UPLOAD ----------
    @router.post("/media/upload-voice")
    async def upload_voice(request: Request, file: UploadFile = File(...),
                            project_id: Optional[str] = Form(None)):
        user = await current_user_dep(request)
        # Guard-rails
        if file.content_type and not any(
                t in file.content_type for t in ("audio", "mpeg", "mp4", "aac", "wav", "ogg")):
            raise HTTPException(status_code=400, detail="Only audio files (mp3/wav/m4a/aac/ogg).")
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(raw) > 30 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Max 30 MB")
        mime = file.content_type or "audio/mpeg"
        b64 = base64.b64encode(raw).decode()
        data_uri = f"data:{mime};base64,{b64}"
        url = await save_audio_persistent(data_uri) or data_uri
        # Probe duration
        from server import _probe_audio_duration  # runtime import: server has ffprobe helper
        dur = await asyncio.to_thread(_probe_audio_duration, raw)
        if project_id:
            await db.projects.update_one(
                {"project_id": project_id, "user_id": user.user_id},
                {"$set": {"audio_url": url, "voice_stale": False,
                          "voice_source": "upload",
                          "duration_sec": max(int(dur), 5) if dur else None,
                          "updated_at": utc_now().isoformat()}},
            )
        return {"audio_url": url, "duration": dur, "source": "upload"}

    # ---------- MUSIC / SFX CATALOG ----------
    @router.get("/catalog/music")
    async def catalog_music():
        return {"music": MUSIC_TRACKS, "sfx": SFX_LIBRARY}

    class MusicPickReq(BaseModel):
        project_id: str
        music_id: Optional[str] = None
        music_url: Optional[str] = None
        music_volume: float = 0.2

    @router.post("/projects/music")
    async def set_project_music(body: MusicPickReq, request: Request):
        user = await current_user_dep(request)
        track = None
        if body.music_id:
            track = next((t for t in MUSIC_TRACKS if t["id"] == body.music_id), None)
        upd = {"music_url": (track["url"] if track else body.music_url),
               "music_id": body.music_id, "music_volume": max(0.0, min(1.0, body.music_volume)),
               "updated_at": utc_now().isoformat()}
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id}, {"$set": upd},
        )
        return {"ok": True, **upd}

    # ---------- WORKSPACES ----------
    @router.post("/workspaces")
    async def create_ws(body: WorkspaceCreate, request: Request):
        user = await current_user_dep(request)
        ws = Workspace(user_id=user.user_id, **body.model_dump())
        d = ws.model_dump()
        d["created_at"] = d["created_at"].isoformat()
        await db.workspaces.insert_one(dict(d))
        return d

    @router.get("/workspaces")
    async def list_ws(request: Request):
        user = await current_user_dep(request)
        return await db.workspaces.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.put("/workspaces/{workspace_id}")
    async def update_ws(workspace_id: str, request: Request):
        user = await current_user_dep(request)
        body = await request.json()
        body.pop("workspace_id", None); body.pop("user_id", None)
        await db.workspaces.update_one({"workspace_id": workspace_id, "user_id": user.user_id},
                                       {"$set": body})
        return await db.workspaces.find_one({"workspace_id": workspace_id, "user_id": user.user_id},
                                            {"_id": 0})

    @router.delete("/workspaces/{workspace_id}")
    async def delete_ws(workspace_id: str, request: Request):
        user = await current_user_dep(request)
        await db.workspaces.delete_one({"workspace_id": workspace_id, "user_id": user.user_id})
        # Detach from any projects
        await db.projects.update_many(
            {"user_id": user.user_id, "workspace_id": workspace_id},
            {"$unset": {"workspace_id": ""}},
        )
        return {"ok": True}

    class ProjectAssignReq(BaseModel):
        workspace_id: Optional[str] = None

    @router.put("/projects/{project_id}/workspace")
    async def assign_project_workspace(project_id: str, body: ProjectAssignReq, request: Request):
        user = await current_user_dep(request)
        ops = ({"$set": {"workspace_id": body.workspace_id, "updated_at": utc_now().isoformat()}}
               if body.workspace_id
               else {"$unset": {"workspace_id": ""}, "$set": {"updated_at": utc_now().isoformat()}})
        await db.projects.update_one({"project_id": project_id, "user_id": user.user_id}, ops)
        return {"ok": True}

    # ---------- PROJECT VERSION HISTORY ----------
    @router.post("/projects/{project_id}/versions")
    async def snapshot_version(project_id: str, request: Request):
        user = await current_user_dep(request)
        body = await request.json()
        proj = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        snap = {k: proj.get(k) for k in ("script", "scenes", "audio_url", "thumbnail",
                                          "duration_sec", "video_url", "voice_id")}
        v = ProjectVersion(project_id=project_id, user_id=user.user_id,
                            label=body.get("label", "Snapshot"), snapshot=snap)
        d = v.model_dump()
        d["created_at"] = d["created_at"].isoformat()
        await db.project_versions.insert_one(dict(d))
        return d

    @router.get("/projects/{project_id}/versions")
    async def list_versions(project_id: str, request: Request):
        user = await current_user_dep(request)
        return await db.project_versions.find(
            {"project_id": project_id, "user_id": user.user_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(50)

    @router.post("/projects/{project_id}/versions/{version_id}/restore")
    async def restore_version(project_id: str, version_id: str, request: Request):
        user = await current_user_dep(request)
        v = await db.project_versions.find_one(
            {"version_id": version_id, "project_id": project_id, "user_id": user.user_id},
            {"_id": 0},
        )
        if not v:
            raise HTTPException(status_code=404, detail="Version not found")
        await db.projects.update_one(
            {"project_id": project_id, "user_id": user.user_id},
            {"$set": {**v["snapshot"], "updated_at": utc_now().isoformat()}},
        )
        return {"ok": True}

    # ---------- FORMAT RESIZE (render alt aspect ratios) ----------
    @router.post("/projects/resize")
    async def resize_multi(body: MultiPlatformResizeRequest, request: Request):
        user = await current_user_dep(request)
        proj = await db.projects.find_one(
            {"project_id": body.project_id, "user_id": user.user_id}, {"_id": 0},
        )
        if not proj:
            raise HTTPException(status_code=404, detail="Not found")
        scenes = proj.get("scenes") or []
        if not scenes:
            raise HTTPException(status_code=400, detail="Generate storyboard first")
        cost = COSTS["resize"] * len(body.aspect_ratios)
        user = await charge_credits(user, cost, "resize_multi")
        results = []
        for ar in body.aspect_ratios:
            if ar == proj.get("aspect_ratio") and proj.get("video_url"):
                results.append({"aspect_ratio": ar, "video_url": proj["video_url"], "reused": True})
                continue
            try:
                url = await render_video(
                    scenes=scenes, audio_data_uri=proj.get("audio_url"),
                    aspect_ratio=ar, fps=int(proj.get("fps", 30)),
                    caption_words=proj.get("caption_words") if proj.get("captions_enabled") else None,
                    caption_style=proj.get("caption_style"),
                    talking_avatar_url=proj.get("talking_avatar_url"),
                    talking_avatar_mode=proj.get("talking_avatar_mode") or "off",
                )
                results.append({"aspect_ratio": ar, "video_url": url})
            except Exception as e:
                results.append({"aspect_ratio": ar, "video_url": None, "error": str(e)[:120]})
        # Cache alt renders on the project
        alt_map = {r["aspect_ratio"]: r.get("video_url") for r in results if r.get("video_url")}
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {"alt_renders": alt_map, "updated_at": utc_now().isoformat()}},
        )
        return {"renders": results, "credits_left": user.credits}

    # ---------- CAMPAIGN PACK EXPORT ----------
    @router.get("/projects/{project_id}/campaign-pack")
    async def campaign_pack(project_id: str, request: Request):
        user = await current_user_dep(request)
        proj = await db.projects.find_one(
            {"project_id": project_id, "user_id": user.user_id}, {"_id": 0},
        )
        if not proj:
            raise HTTPException(status_code=404, detail="Not found")
        data = await build_campaign_zip(
            project=proj,
            campaign_variations=proj.get("campaign"),
            ad_copy=proj.get("ad_copy"),
        )
        headers = {"Content-Disposition": f'attachment; filename="{project_id}_campaign.zip"'}
        return Response(content=data, media_type="application/zip", headers=headers)

    return router


# ---------- helpers ----------
def _build_apply_patch(plan: dict, project: dict) -> dict:
    """Convert an AI-feedback plan into a MongoDB update patch the frontend
    can PUT to /projects/{id} to apply the one-click fix."""
    patch = {}
    for action in plan.get("actions") or []:
        layer = action.get("layer")
        field = action.get("field")
        value = action.get("value")
        if not layer or field is None:
            continue
        if layer == "accent" and field == "accent":
            patch["accent"] = value
            patch["accent_locked"] = True
        elif layer == "voice":
            if field == "preset":
                patch["voice_preset"] = value
            elif field in ("speed", "stability", "style", "similarity_boost"):
                patch.setdefault("voice_tuning", {})[field] = value
        elif layer == "pronunciation" and field == "dictionary":
            existing = project.get("pronunciation") or {}
            if isinstance(value, list):
                for it in value:
                    if isinstance(it, dict):
                        w = (it.get("word") or "").strip()
                        s = (it.get("suggested") or "").strip()
                        if w and s: existing[w] = s
            elif isinstance(value, dict):
                existing.update(value)
            patch["pronunciation"] = existing
        elif layer == "caption" and field == "position":
            patch["caption_position"] = value
        elif layer == "music" and field == "volume":
            patch["music_volume"] = value
        elif layer == "cta" and field == "text":
            patch.setdefault("script", dict(project.get("script") or {}))["cta"] = value
    return patch


def _segments_to_scenes(segments: list, total_duration: float) -> list:
    """Group Whisper segments into ~5s scene chunks so the timeline builder
    can create scenes automatically from any uploaded voiceover."""
    if not segments:
        # Fallback: even split into 6 scenes if we somehow have no timestamps
        per = max(3.0, (total_duration or 30) / 6)
        return [{"index": i + 1, "duration": per, "voiceover": "", "visual_prompt": ""}
                for i in range(6)]
    scenes = []
    cur_text = []
    cur_start = float(segments[0].get("start") or 0.0)
    cur_end = cur_start
    target = 6.0  # target scene length
    for s in segments:
        st = float(s.get("start") or cur_end)
        et = float(s.get("end") or st + 3)
        cur_text.append((s.get("text") or "").strip())
        cur_end = et
        if (cur_end - cur_start) >= target:
            scenes.append({
                "index": len(scenes) + 1,
                "duration": round(cur_end - cur_start, 2),
                "voiceover": " ".join(cur_text).strip(),
                "visual_prompt": "",
                "camera": "cinematic close-up",
                "lighting": "natural daylight",
                "motion": "slow push-in",
            })
            cur_text = []
            cur_start = cur_end
    # Tail
    if cur_text:
        scenes.append({
            "index": len(scenes) + 1,
            "duration": round(cur_end - cur_start, 2),
            "voiceover": " ".join(cur_text).strip(),
            "visual_prompt": "",
            "camera": "wide shot",
            "lighting": "natural daylight",
            "motion": "static",
        })
    return scenes
