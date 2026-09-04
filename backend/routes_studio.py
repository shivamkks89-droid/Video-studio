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
)
from ai_services import (
    check_compliance, generate_ad_copy, generate_campaign, generate_multi_creatives,
    refine_script, score_creative,
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
                url = await render_video(scenes=scenes, audio_data_uri=proj.get("audio_url"),
                                          aspect_ratio=ar, fps=int(proj.get("fps", 30)))
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
