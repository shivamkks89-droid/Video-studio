"""CineReel AI — FastAPI backend."""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Local imports
from models import (
    AdminUserUpdate, BrandKit, BrandKitCreate, CTARequest, CreditTransaction,
    HookRequest, LoginRequest, OTPRequest, OTPVerify, PlanPurchase, Project,
    ProjectCreate, SceneImageRequest, ScriptRequest, SignupRequest,
    StoryboardRequest, TTSRequest, User, UserPublic, new_id, utc_now,
)
from auth import (
    decode_jwt, gen_otp, gen_user_id, get_current_user, get_session_data_from_emergent,
    hash_password, issue_jwt, send_otp_email, verify_password,
)
from ai_services import (
    AIServiceError, clone_voice, generate_ctas, generate_hooks, generate_scene_image,
    generate_script, list_voices, list_voices_async, project_language_to_iso,
    score_variants, suggest_ad_ideas, synthesize_speech,
)
from asset_store import (
    save_image_data_uri as save_image_persistent,
    save_audio_data_uri as save_audio_persistent,
    save_video_bytes as save_video_persistent,
    fetch_to_bytes as fetch_asset_bytes,
)
from object_storage import init_storage as init_objstore
from openai_tts import synthesize_openai_tts
from scraper import scrape as scrape_query, to_script_context
from seedance import (
    SeedanceError,
    download_to_bytes as seedance_download,
    image_to_video as seedance_i2v,
    text_to_video as seedance_t2v,
)
from sora import SoraError, text_to_video as sora_t2v
from video_renderer import STATIC_DIR, render_video
from templates_seed import AVATARS, PLANS, STOCK_ASSETS, TEMPLATES, VIDEO_TYPES


# ---------- Mongo ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="CineReel AI")
api = APIRouter(prefix="/api")


# ---------- helpers ----------
def _doc(model: BaseModel) -> dict:
    d = model.model_dump()
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


def _public(u: User) -> UserPublic:
    return UserPublic(user_id=u.user_id, email=u.email, name=u.name,
                      picture=u.picture, role=u.role, credits=u.credits, plan=u.plan)


async def _current(request: Request) -> User:
    return await get_current_user(request, db)


async def _charge_credits(user: User, amount: int, reason: str, project_id: Optional[str] = None) -> User:
    if user.credits < amount:
        raise HTTPException(status_code=402, detail="Insufficient credits. Please upgrade your plan.")
    new_credits = user.credits - amount
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"credits": new_credits}})
    txn = CreditTransaction(user_id=user.user_id, delta=-amount, reason=reason, project_id=project_id)
    await db.credit_transactions.insert_one(_doc(txn))
    user.credits = new_credits
    return user


async def _refund(user: User, amount: int, reason: str, project_id: Optional[str] = None) -> User:
    new_credits = user.credits + amount
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"credits": new_credits}})
    txn = CreditTransaction(user_id=user.user_id, delta=amount, reason=f"refund_{reason}", project_id=project_id)
    await db.credit_transactions.insert_one(_doc(txn))
    user.credits = new_credits
    return user


# ---------- HEALTH ----------
@api.get("/")
async def root():
    return {"app": "CineReel AI", "status": "ok"}


# ---------- AUTH: signup / login / OTP / google-session ----------
@api.post("/auth/signup")
async def signup(body: SignupRequest):
    existing = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(user_id=gen_user_id(), email=body.email.lower(), name=body.name, auth_provider="email")
    doc = _doc(user)
    doc["password_hash"] = hash_password(body.password)
    await db.users.insert_one(doc)
    token = issue_jwt(user.user_id)
    return {"token": token, "user": _public(user).model_dump()}


@api.post("/auth/login")
async def login(body: LoginRequest):
    doc = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not doc or not verify_password(body.password, doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user = User(**{k: v for k, v in doc.items() if k != "password_hash"})
    token = issue_jwt(user.user_id)
    return {"token": token, "user": _public(user).model_dump()}


@api.post("/auth/otp/request")
async def otp_request(body: OTPRequest):
    code = gen_otp()
    await db.email_otps.update_one(
        {"email": body.email.lower()},
        {"$set": {
            "email": body.email.lower(),
            "code": code,
            "expires_at": (utc_now() + timedelta(minutes=10)).isoformat(),
            "attempts": 0,
        }},
        upsert=True,
    )
    sent = await send_otp_email(body.email, code)
    # In dev / if email key missing, return the code so users can still test
    payload = {"sent": sent}
    if not sent or os.environ.get("EXPOSE_OTP", "1") == "1":
        payload["dev_code"] = code
    return payload


@api.post("/auth/otp/verify")
async def otp_verify(body: OTPVerify):
    rec = await db.email_otps.find_one({"email": body.email.lower()}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="No OTP requested")
    expires_at = rec["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < utc_now():
        raise HTTPException(status_code=400, detail="OTP expired")
    if rec["code"] != body.code:
        raise HTTPException(status_code=400, detail="Invalid code")
    # find or create user
    udoc = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not udoc:
        user = User(user_id=gen_user_id(), email=body.email.lower(),
                    name=body.email.split("@")[0].title(), auth_provider="email")
        await db.users.insert_one(_doc(user))
    else:
        user = User(**{k: v for k, v in udoc.items() if k != "password_hash"})
    await db.email_otps.delete_one({"email": body.email.lower()})
    token = issue_jwt(user.user_id)
    return {"token": token, "user": _public(user).model_dump()}


@api.post("/auth/google/session")
async def google_session(request: Request, response: Response):
    """Exchange Emergent session_id for a session_token and create/refresh user."""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    data = await get_session_data_from_emergent(session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid session")

    email = data["email"].lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user = User(**{k: v for k, v in existing.items() if k != "password_hash"})
        # refresh picture/name
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {"name": data.get("name", user.name), "picture": data.get("picture")}}
        )
        user.name = data.get("name", user.name)
        user.picture = data.get("picture")
    else:
        user = User(user_id=gen_user_id(), email=email, name=data.get("name", "User"),
                    picture=data.get("picture"), auth_provider="google")
        await db.users.insert_one(_doc(user))

    session_token = data["session_token"]
    expires_at = utc_now() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user.user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": utc_now().isoformat(),
    })
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token", value=session_token, max_age=7 * 24 * 60 * 60,
        httponly=True, secure=True, samesite="none", path="/",
    )
    return {"user": _public(user).model_dump()}


@api.get("/auth/me")
async def me(request: Request):
    user = await _current(request)
    return _public(user).model_dump()


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- CATALOGS ----------
@api.get("/catalog/video-types")
async def get_video_types():
    return VIDEO_TYPES


@api.get("/catalog/templates")
async def get_templates(category: Optional[str] = None, video_type: Optional[str] = None):
    res = TEMPLATES
    if category:
        res = [t for t in res if t["category"].lower() == category.lower()]
    if video_type:
        res = [t for t in res if t["video_type"] == video_type]
    return res


@api.get("/catalog/avatars")
async def get_avatars():
    return AVATARS


@api.get("/catalog/voices")
async def get_voices(language: Optional[str] = None, refresh: bool = False):
    all_voices = await list_voices_async(force=refresh)
    if not language or language == "all":
        return all_voices
    return [v for v in all_voices if v.get("language") == language]


@api.post("/voices/clone")
async def voices_clone_route(request: Request, name: str = Form(...),
                              description: str = Form(""),
                              audio: UploadFile = File(...)):
    """Clone a user's voice via ElevenLabs Voice Lab. Costs 100 credits + requires
    ElevenLabs paid plan on the server key. Persists the resulting voice to the
    user's `custom_voices` list."""
    user = await _current(request)
    # Voice cloning charges 100 credits.
    user = await _charge_credits(user, 100, "voice_clone", None)
    audio_bytes = await audio.read()
    if len(audio_bytes) < 8_000:
        await _refund(user, 100, "voice_clone_refund", None)
        raise HTTPException(status_code=400, detail="Audio sample too short (need at least 10-30 sec of clean speech).")
    if len(audio_bytes) > 15 * 1024 * 1024:
        await _refund(user, 100, "voice_clone_refund", None)
        raise HTTPException(status_code=400, detail="Audio sample too large (max 15 MB).")

    result = await clone_voice(name=name, audio_bytes=audio_bytes, description=description)
    if result.get("error"):
        await _refund(user, 100, "voice_clone_refund", None)
        raise HTTPException(status_code=502, detail=result["error"])

    voice_entry = {
        "id": result["voice_id"],
        "name": result["name"],
        "gender": "custom", "language": "custom",
        "style": "cloned", "_source": "user_clone",
        "created_at": utc_now().isoformat(),
    }
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$push": {"custom_voices": voice_entry}},
    )
    return {"ok": True, "voice": voice_entry, "credits_left": user.credits}


@api.get("/catalog/assets")
async def get_assets():
    return STOCK_ASSETS


@api.get("/catalog/plans")
async def get_plans():
    return PLANS


# ---------- AI: script / hook / cta / ideas ----------
@api.post("/ai/script")
async def ai_script(body: ScriptRequest, request: Request):
    user = await _current(request)
    user = await _charge_credits(user, 5, "script_generation", body.project_id)
    payload = body.model_dump()
    # Resolve a real brand identity from any of: brand_url, brand_name, or the topic itself.
    scraped = {}
    for candidate in [body.brand_url, body.topic]:
        if not candidate:
            continue
        s = await scrape_query(candidate)
        if s.get("ok"):
            scraped = s
            break
    # If user provided a brand_name + logo but no URL/Play Store, still register it.
    if not scraped and body.brand_name:
        scraped = {
            "ok": True, "kind": "manual",
            "title": body.brand_name,
            "icon": body.brand_logo,
            "screenshots": [],
        }
    if scraped.get("ok"):
        ctx_lines = [f"App / Brand name: {scraped.get('title')}"]
        if scraped.get("developer"):
            ctx_lines.append(f"Developer / Company: {scraped['developer']}")
        if scraped.get("category"):
            ctx_lines.append(f"Category: {scraped['category']}")
        if scraped.get("description"):
            ctx_lines.append(f"Real description: {scraped['description'][:900]}")
        if scraped.get("installs"):
            ctx_lines.append(f"Installs: {scraped['installs']}")
        if scraped.get("score"):
            ctx_lines.append(f"Rating: {scraped['score']}")
        payload["extra_notes"] = (payload.get("extra_notes") or "") + (
            "\n\nUSE THE FOLLOWING REAL BRAND INFO. Use the ACTUAL brand name everywhere. "
            "Do NOT invent any other brand name.\n" + "\n".join(ctx_lines)
        )
    try:
        script = await generate_script(payload)
    except AIServiceError as e:
        await _refund(user, 5, "script_generation", body.project_id)
        return JSONResponse(status_code=422, content={"error": str(e), "refunded": True, "credits_left": user.credits})
    # If we still don't have a real brand, replace any [BRAND] placeholder with a friendly
    # generic so we never ship an invented wordmark.
    brand_label = (scraped.get("title") if scraped.get("ok") else body.brand_name) or None
    if brand_label:
        script = _replace_brand_token(script, brand_label)
    if body.project_id:
        update = {"script": script, "status": "scripting",
                  "voice_stale": True,  # new script → old voice is stale
                  "updated_at": utc_now().isoformat()}
        if scraped.get("ok"):
            update["source_assets"] = {
                "kind": scraped.get("kind"),
                "title": scraped.get("title"),
                "icon": scraped.get("icon"),
                "screenshots": scraped.get("screenshots", []),
                "url": scraped.get("url"),
            }
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": update, "$inc": {"script_version": 1}},
        )
    return {"script": script, "credits_left": user.credits,
            "source_assets": scraped if scraped.get("ok") else None,
            "warning": None if (scraped.get("ok") or brand_label) else
            "No real brand info provided — script uses the [BRAND] placeholder. Add a Play Store ID, website URL or brand name & logo for real assets."}


# ---------- Audience-targeted script variants ----------
# Three variant axes — each has 3 profiles.
VARIANT_AXES = {
    "gender": {
        "girls": {
            "label": "Girls / Women",
            "notes": ("Target audience: young women & girls (ages 16-32). Use an emotionally warm, "
                      "aspirational, self-love and empowerment-forward tone. Reference feelings, "
                      "friendship, glow-up, confidence, style, wellness and celebrations. Use "
                      "words girls actually use on Instagram Reels. Avoid tech-jargon. Hooks should "
                      "spark curiosity or FOMO."),
        },
        "boys": {
            "label": "Boys / Men",
            "notes": ("Target audience: young men & boys (ages 16-32). Use a punchy, action-driven, "
                      "high-energy and achievement-oriented tone. Reference hustle, results, gains, "
                      "gadgets, sports, gaming, adventure and status. Direct, no-fluff sentences. "
                      "Hooks should challenge or promise a payoff."),
        },
        "unisex": {
            "label": "Everyone (Unisex)",
            "notes": ("Target audience: universal — mixed genders 16-40. Use a neutral, benefit-first, "
                      "inclusive tone. Emphasise the outcome and value proposition without gender-coded "
                      "language. Hook should be a bold universal claim."),
        },
    },
    "age": {
        "genz": {
            "label": "Gen Z (16-26)",
            "notes": ("Target: Gen Z, ages 16-26. Use TikTok/Reels-native slang, mixed Hindi-English, "
                      "meme-adjacent phrasing, fast cuts implied. Reference short-form culture, "
                      "aesthetic vibes, main-character energy, hustle-lite. Hook must scroll-stop in "
                      "under 3 words. Avoid corporate voice completely."),
        },
        "millennial": {
            "label": "Millennial (27-40)",
            "notes": ("Target: Millennials, ages 27-40. Use a smart, slightly self-aware, "
                      "story-driven tone. Reference careers, EMIs, weekend brunches, side hustles, "
                      "life admin, saving-for-family. Values ROI and honesty. Hooks work as "
                      "relatable one-liners about 'adulting'."),
        },
        "parents": {
            "label": "Parents (32-55)",
            "notes": ("Target: parents with school-age kids, ages 32-55. Use a trustworthy, "
                      "protective, family-first tone. Reference kids' futures, safety, savings, "
                      "quality time, health, education. Avoid slang. Hooks should tap into "
                      "'ek smart decision aaj, family ka better kal.'"),
        },
    },
    "region": {
        "delhi_ncr": {
            "label": "Delhi NCR",
            "notes": ("Target: Delhi, Gurgaon, Noida audience. Confident, slightly bold, "
                      "value-conscious tone. Sprinkle Delhi Hindi phrases ('scene', 'setting', "
                      "'jugaad', 'bhai/behen', 'yaar'). Reference metro life, Connaught Place, "
                      "Cyber Hub, weekend Manali/Rishikesh trips. Fast-paced sentences."),
        },
        "mumbai": {
            "label": "Mumbai",
            "notes": ("Target: Mumbai audience. Fast-talking, hustler, aspirational tone. Mix "
                      "Bambaiya Hindi ('bindaas', 'apun', 'ekdum', 'scene set hai'). Reference "
                      "local trains, Bandra cafés, Marine Drive, ambition, side hustles. "
                      "Sentences short and punchy — Mumbai has no time."),
        },
        "south": {
            "label": "South India (BLR/HYD/CHN)",
            "notes": ("Target: Bengaluru / Hyderabad / Chennai urban audience. Warm, professional, "
                      "family-and-quality-first tone. Mostly English with subtle regional respect "
                      "cues ('anna/akka/uncle/madam'). Reference tech-work-life balance, "
                      "filter coffee, weekend Coorg/Pondi trips, savings mindset. Slightly slower "
                      "but content-dense sentences."),
        },
    },
}

# Keys in the order they are returned to the client.
VARIANT_ORDER = {
    "gender": ["girls", "boys", "unisex"],
    "age": ["genz", "millennial", "parents"],
    "region": ["delhi_ncr", "mumbai", "south"],
}


class VariantsReq(ScriptRequest):
    axis: Optional[str] = "gender"  # gender | age | region


@api.post("/ai/script/variants")
async def ai_script_variants(body: VariantsReq, request: Request):
    """Generate 3 script variants in parallel along a chosen axis (gender / age / region)."""
    axis = (body.axis or "gender").lower()
    if axis not in VARIANT_AXES:
        raise HTTPException(status_code=400, detail=f"axis must be one of: {list(VARIANT_AXES)}")
    profiles = VARIANT_AXES[axis]
    order = VARIANT_ORDER[axis]

    user = await _current(request)
    user = await _charge_credits(user, 15, f"script_variants_{axis}", body.project_id)

    # Resolve real brand identity once (shared across variants).
    scraped = {}
    for candidate in [body.brand_url, body.topic]:
        if not candidate:
            continue
        s = await scrape_query(candidate)
        if s.get("ok"):
            scraped = s
            break
    if not scraped and body.brand_name:
        scraped = {"ok": True, "kind": "manual", "title": body.brand_name,
                   "icon": body.brand_logo, "screenshots": []}
    brand_ctx = ""
    if scraped.get("ok"):
        ctx_lines = [f"App / Brand name: {scraped.get('title')}"]
        for k, label in [("developer", "Developer"), ("category", "Category"),
                         ("installs", "Installs"), ("score", "Rating")]:
            if scraped.get(k):
                ctx_lines.append(f"{label}: {scraped[k]}")
        if scraped.get("description"):
            ctx_lines.append(f"Real description: {scraped['description'][:900]}")
        brand_ctx = ("\n\nUSE THE FOLLOWING REAL BRAND INFO. Use the ACTUAL brand name everywhere. "
                     "Do NOT invent any other brand name.\n" + "\n".join(ctx_lines))

    async def _one(audience_key: str) -> dict:
        prof = profiles[audience_key]
        payload = body.model_dump()
        payload["target_audience"] = prof["label"]
        payload["extra_notes"] = ((payload.get("extra_notes") or "") + "\n\n" + prof["notes"] + brand_ctx).strip()
        try:
            script = await generate_script(payload)
        except AIServiceError as e:
            return {"audience": audience_key, "label": prof["label"], "error": str(e), "script": None}
        brand_label = (scraped.get("title") if scraped.get("ok") else body.brand_name) or None
        if brand_label:
            script = _replace_brand_token(script, brand_label)
        return {"audience": audience_key, "label": prof["label"], "script": script}

    variants = await asyncio.gather(*[_one(k) for k in order])

    failed = sum(1 for v in variants if v.get("error"))
    if failed:
        await _refund(user, failed * 5, "script_variants_refund", body.project_id)
        user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        if user_doc:
            user.credits = user_doc.get("credits", user.credits)

    # Auto-score variants (organic + Google Ads suitability) — one extra LLM
    # call that returns 0-100 scores per metric plus overall winners.
    scoring = {"variants": [], "winner_organic": None, "winner_google_ads": None,
               "reasoning": None}
    try:
        scoring = await score_variants(variants, body.video_type or "cinematic_ad",
                                        body.language or "english")
        score_by_key = {}
        for row in scoring.get("variants", []):
            for k in (row.get("audience"), row.get("label")):
                if k:
                    score_by_key[k] = row
        for v in variants:
            row = score_by_key.get(v.get("label")) or score_by_key.get(v.get("audience"))
            if row:
                v["scores"] = row
        # Normalise winner tokens to the canonical `label` (LLM sometimes returns
        # the raw audience key like "parents" instead of "Parents (32-55)").
        label_by_any = {}
        for v in variants:
            for k in (v.get("audience"), v.get("label")):
                if k:
                    label_by_any[k] = v.get("label")
        for wk in ("winner_organic", "winner_google_ads"):
            w = scoring.get(wk)
            if w and label_by_any.get(w):
                scoring[wk] = label_by_any[w]
    except Exception as e:  # noqa: BLE001
        print(f"[variants] scoring failed: {e}")

    return {
        "axis": axis,
        "variants": variants,
        "source_assets": scraped if scraped.get("ok") else None,
        "credits_left": user.credits,
        "warning": None if scraped.get("ok") else "No brand info — variants use the [BRAND] placeholder.",
        "winners": {
            "organic": scoring.get("winner_organic"),
            "google_ads": scoring.get("winner_google_ads"),
            "reasoning": scoring.get("reasoning"),
        },
    }


class ApplyVariantReq(BaseModel):
    project_id: str
    script: dict
    audience_label: Optional[str] = None
    audience_key: Optional[str] = None
    axis: Optional[str] = None
    source_assets: Optional[dict] = None


@api.post("/ai/script/apply")
async def ai_script_apply(body: ApplyVariantReq, request: Request):
    """Save one of the returned variants as the project's active script."""
    user = await _current(request)
    update = {
        "script": body.script,
        "status": "scripting",
        "target_audience": body.audience_label,
        "variant_axis": body.axis,
        "variant_key": body.audience_key,
        "voice_stale": True,
        "updated_at": utc_now().isoformat(),
    }
    if body.source_assets and body.source_assets.get("ok"):
        update["source_assets"] = {
            "kind": body.source_assets.get("kind"),
            "title": body.source_assets.get("title"),
            "icon": body.source_assets.get("icon"),
            "screenshots": body.source_assets.get("screenshots", []),
            "url": body.source_assets.get("url"),
        }
    res = await db.projects.update_one(
        {"project_id": body.project_id, "user_id": user.user_id},
        {"$set": update, "$inc": {"script_version": 1}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


# ---------- A/B tracking ----------
# Public tracking endpoint — no auth so it can be called from a shared link / QR.
# Events are aggregated per (project_id, variant_key). Fire-and-forget by client.
_TRACK_EVENTS = {"view", "click", "share", "conversion"}


class TrackEventReq(BaseModel):
    event: str  # view | click | share | conversion


@app.post("/api/track/{project_id}")
async def track_variant_event(project_id: str, body: TrackEventReq):
    if body.event not in _TRACK_EVENTS:
        raise HTTPException(status_code=400, detail=f"event must be one of {_TRACK_EVENTS}")
    proj = await db.projects.find_one(
        {"project_id": project_id},
        {"_id": 0, "variant_key": 1, "variant_axis": 1, "user_id": 1},
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    key = proj.get("variant_key") or "none"
    axis = proj.get("variant_axis") or "none"
    field = f"metrics.{axis}.{key}.{body.event}"
    await db.projects.update_one(
        {"project_id": project_id},
        {"$inc": {field: 1, f"metrics.totals.{body.event}": 1}},
    )
    return {"ok": True}


@app.get("/api/projects/public/{project_id}")
async def public_project(project_id: str):
    """Public read-only view for the share page — returns only fields safe to expose."""
    proj = await db.projects.find_one(
        {"project_id": project_id},
        {"_id": 0, "project_id": 1, "title": 1, "video_url": 1, "thumbnail": 1,
         "aspect_ratio": 1, "target_audience": 1, "script": 1, "duration_sec": 1},
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Not found")
    # Only expose the CTA + hook from the script, never the full internal payload.
    if isinstance(proj.get("script"), dict):
        proj["script"] = {"hook": proj["script"].get("hook"), "cta": proj["script"].get("cta")}
    return proj


@api.get("/projects/{project_id}/metrics")
async def get_project_metrics(project_id: str, request: Request):
    """Return the A/B rollup for the current project."""
    user = await _current(request)
    proj = await db.projects.find_one(
        {"project_id": project_id, "user_id": user.user_id},
        {"_id": 0, "metrics": 1, "variant_axis": 1, "variant_key": 1, "target_audience": 1},
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "metrics": proj.get("metrics") or {},
        "active_variant": {
            "axis": proj.get("variant_axis"),
            "key": proj.get("variant_key"),
            "label": proj.get("target_audience"),
        },
    }


# ---------- Video-clip generation (Sora 2 free / Seedance paid) ----------
# Two engines, plan-gated:
#   sora     — OpenAI Sora 2 via Emergent Universal Key. Available on ALL plans
#              (including free). T2V only, 4/8/12s clips at 1024x1792 / 1792x1024 / 1024x1024.
#   seedance — ByteDance Seedance via fal.ai. Requires FAL_KEY and a paid plan
#              (creator / studio / enterprise). Supports both T2V and I2V.
SEEDANCE_ALLOWED_PLANS = {"creator", "studio", "enterprise"}
CLIP_COST = {
    ("sora", "t2v"): 20,
    ("seedance", "t2v"): 40,
    ("seedance", "i2v"): 30,
}


class VideoClipReq(BaseModel):
    project_id: str
    scene_index: int
    engine: str = "sora"       # "sora" | "seedance"
    mode: str = "t2v"          # "t2v" | "i2v" (i2v is seedance-only)
    prompt: Optional[str] = None
    duration_seconds: Optional[int] = None
    aspect_ratio: Optional[str] = None


def _absolute_asset_url(request: Request, path: str) -> str:
    """Turn an internal /api/files/... path into a fully-qualified URL that fal.ai can fetch."""
    if not path:
        return ""
    if path.startswith("http://") or path.startswith("https://") or path.startswith("data:"):
        return path
    base = os.environ.get("PUBLIC_BASE_URL")
    if not base:
        base = str(request.base_url).rstrip("/")
    return f"{base}{path}"


@api.post("/ai/video-clip/generate")
async def video_clip_generate(body: VideoClipReq, request: Request):
    """Generate a video clip for a single scene using either Sora 2 (free) or Seedance (paid)."""
    engine = (body.engine or "sora").lower()
    mode = (body.mode or "t2v").lower()
    if engine not in ("sora", "seedance"):
        raise HTTPException(status_code=400, detail="engine must be 'sora' or 'seedance'")
    if mode not in ("t2v", "i2v"):
        raise HTTPException(status_code=400, detail="mode must be 't2v' or 'i2v'")
    if engine == "sora" and mode == "i2v":
        raise HTTPException(status_code=400, detail="Sora 2 supports text-to-video only. Use engine='seedance' for image-to-video.")

    user = await _current(request)

    # Plan gating for Seedance (paid)
    if engine == "seedance" and user.plan not in SEEDANCE_ALLOWED_PLANS:
        raise HTTPException(
            status_code=402,
            detail="Seedance is available on Creator plan and above. Upgrade at /pricing — or use the free Sora 2 engine.",
        )

    proj = await db.projects.find_one({"project_id": body.project_id, "user_id": user.user_id})
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    scenes = proj.get("scenes") or []
    if body.scene_index < 0 or body.scene_index >= len(scenes):
        raise HTTPException(status_code=400, detail="scene_index out of range")
    scene = scenes[body.scene_index]

    aspect = body.aspect_ratio or proj.get("aspect_ratio") or "9:16"

    scene_prompt = body.prompt or scene.get("prompt") or scene.get("voiceover") or ""
    motion_hint = "cinematic subtle motion, natural camera movement, high detail, no text, no watermarks"
    prompt = f"{scene_prompt}. {motion_hint}".strip(". ").strip()

    cost = CLIP_COST[(engine, mode)]
    user = await _charge_credits(user, cost, f"videoclip_{engine}_{mode}", body.project_id)

    try:
        if engine == "sora":
            # Sora 2: T2V only, 4/8/12s. Default 4s for speed.
            duration = int(body.duration_seconds or 4)
            video_bytes = await sora_t2v(prompt, aspect_ratio=aspect, duration_seconds=duration)
            # Persist to our own store; Sora returns bytes directly.
            local_url = await save_video_persistent(video_bytes)
            if not local_url:
                raise SoraError("Failed to persist Sora video to storage")
            actual_duration = duration
        else:
            # Seedance: T2V or I2V, 5/10s
            duration = max(5, min(10, int(body.duration_seconds or 5)))
            if mode == "i2v":
                src = scene.get("image_url")
                if not src:
                    raise SeedanceError("Scene has no image to animate — regenerate the storyboard first.")
                fal_url = await seedance_i2v(_absolute_asset_url(request, src),
                                             prompt=prompt, aspect_ratio=aspect,
                                             duration_seconds=duration)
            else:
                fal_url = await seedance_t2v(prompt, aspect_ratio=aspect, duration_seconds=duration)
            # Mirror the fal.ai URL to our own store so the link never expires.
            try:
                vb = await seedance_download(fal_url)
                local_url = await save_video_persistent(vb) or fal_url
            except Exception as e:
                print(f"[videoclip] mirror to object-store failed: {e}")
                local_url = fal_url
            actual_duration = duration
    except (SoraError, SeedanceError) as e:
        await _refund(user, cost, f"videoclip_refund_{engine}", body.project_id)
        detail = str(e)
        if "exhausted balance" in detail.lower() or "top up" in detail.lower():
            raise HTTPException(
                status_code=402,
                detail=("fal.ai account balance exhausted — top up at fal.ai/dashboard/billing, "
                        "or switch to the free Sora 2 engine."),
            )
        raise HTTPException(status_code=502, detail=f"{engine.title()} error: {detail[:300]}")

    scenes[body.scene_index] = {
        **scene,
        "video_clip_url": local_url,
        "video_clip_engine": engine,
        "video_clip_source": mode,
        "video_clip_duration": actual_duration,
    }
    await db.projects.update_one(
        {"project_id": body.project_id, "user_id": user.user_id},
        {"$set": {"scenes": scenes, "updated_at": utc_now().isoformat()}},
    )

    return {
        "ok": True,
        "video_clip_url": local_url,
        "engine": engine,
        "credits_left": user.credits,
        "scene_index": body.scene_index,
    }


# Backwards-compat alias — old /ai/seedance/generate paths just route through the
# generic endpoint with engine='seedance'.
class SeedanceReq(BaseModel):
    project_id: str
    scene_index: int
    mode: str
    prompt: Optional[str] = None
    duration_seconds: Optional[int] = 5
    aspect_ratio: Optional[str] = None


@api.post("/ai/seedance/generate")
async def seedance_generate_legacy(body: SeedanceReq, request: Request):
    return await video_clip_generate(
        VideoClipReq(
            project_id=body.project_id,
            scene_index=body.scene_index,
            engine="seedance",
            mode=body.mode,
            prompt=body.prompt,
            duration_seconds=body.duration_seconds,
            aspect_ratio=body.aspect_ratio,
        ),
        request,
    )


class SeedanceClearReq(BaseModel):
    project_id: str
    scene_index: int


@api.post("/ai/seedance/clear")
async def seedance_clear(body: SeedanceClearReq, request: Request):
    """Drop a scene's video-clip so the renderer falls back to the still image."""
    user = await _current(request)
    proj = await db.projects.find_one({"project_id": body.project_id, "user_id": user.user_id})
    if not proj:
        raise HTTPException(status_code=404, detail="Not found")
    scenes = proj.get("scenes") or []
    if body.scene_index < 0 or body.scene_index >= len(scenes):
        raise HTTPException(status_code=400, detail="scene_index out of range")
    scenes[body.scene_index] = {k: v for k, v in scenes[body.scene_index].items()
                                 if k not in {"video_clip_url", "video_clip_source",
                                              "video_clip_engine", "video_clip_duration"}}
    await db.projects.update_one(
        {"project_id": body.project_id, "user_id": user.user_id},
        {"$set": {"scenes": scenes}},
    )
    return {"ok": True}


@api.get("/ai/video-clip/engines")
async def list_video_engines(request: Request):
    """Return which engines are unlocked for the current user's plan."""
    user = await _current(request)
    return {
        "current_plan": user.plan,
        "engines": [
            {
                "id": "sora",
                "label": "Sora 2 (Free)",
                "modes": ["t2v"],
                "cost": {"t2v": CLIP_COST[("sora", "t2v")]},
                "unlocked": True,
                "note": "Included in every plan. 4-12s clips, portrait/landscape/square.",
            },
            {
                "id": "seedance",
                "label": "Seedance (Premium)",
                "modes": ["t2v", "i2v"],
                "cost": {"t2v": CLIP_COST[("seedance", "t2v")],
                         "i2v": CLIP_COST[("seedance", "i2v")]},
                "unlocked": user.plan in SEEDANCE_ALLOWED_PLANS,
                "note": "Available on Creator plan and above. Higher realism + image-to-video mode.",
            },
        ],
    }


def _replace_brand_token(obj, brand: str):
    """Walk script JSON and replace [BRAND] / [BRAND_NAME] with the resolved brand label."""
    if isinstance(obj, str):
        return obj.replace("[BRAND]", brand).replace("[BRAND_NAME]", brand).replace("[YOUR BRAND]", brand)
    if isinstance(obj, list):
        return [_replace_brand_token(x, brand) for x in obj]
    if isinstance(obj, dict):
        return {k: _replace_brand_token(v, brand) for k, v in obj.items()}
    return obj


@api.post("/ai/hooks")
async def ai_hooks(body: HookRequest, request: Request):
    user = await _current(request)
    user = await _charge_credits(user, 1, "hook_generation")
    try:
        hooks = await generate_hooks(body.topic, body.language, body.count)
    except AIServiceError as e:
        await _refund(user, 1, "hook_generation")
        return JSONResponse(status_code=422, content={"error": str(e), "refunded": True, "credits_left": user.credits})
    return {"hooks": hooks, "credits_left": user.credits}


@api.post("/ai/ctas")
async def ai_ctas(body: CTARequest, request: Request):
    user = await _current(request)
    user = await _charge_credits(user, 1, "cta_generation")
    try:
        ctas = await generate_ctas(body.topic, body.language, body.count)
    except AIServiceError as e:
        await _refund(user, 1, "cta_generation")
        return JSONResponse(status_code=422, content={"error": str(e), "refunded": True, "credits_left": user.credits})
    return {"ctas": ctas, "credits_left": user.credits}


class IdeaReq(BaseModel):
    query: str
    language: str = "english"


class ScrapeReq(BaseModel):
    query: str


@api.post("/scrape/inspect")
async def scrape_inspect(body: ScrapeReq, request: Request):
    await _current(request)
    data = await scrape_query(body.query)
    return data


@api.post("/ai/ad-ideas")
async def ai_ad_ideas(body: IdeaReq, request: Request):
    user = await _current(request)
    user = await _charge_credits(user, 2, "ad_ideas")
    # If query looks like a URL / Play Store id, fetch real metadata first
    scraped = await scrape_query(body.query)
    enriched_query = body.query
    if scraped.get("ok"):
        context = to_script_context(scraped)
        enriched_query = f"{body.query}\n\nReal info:\n{context}"
    try:
        ideas = await suggest_ad_ideas(enriched_query, body.language)
    except AIServiceError as e:
        await _refund(user, 2, "ad_ideas")
        return JSONResponse(status_code=422, content={"error": str(e), "refunded": True, "credits_left": user.credits})
    return {"ideas": ideas, "credits_left": user.credits, "scraped": scraped if scraped.get("ok") else None}


# ---------- AI: voice (ElevenLabs + OpenAI fallback) ----------
class VoicePreviewReq(BaseModel):
    voice_id: str
    language: Optional[str] = "english"


# In-memory preview cache — same (voice_id, language) always produces the same
# audio, so cache forever. Prevents burning credits on every dropdown hover.
_VOICE_PREVIEW_CACHE: dict = {}
_PREVIEW_SAMPLES = {
    "hindi": "Namaste! Aapka apna brand ab yahan hai. Chaliye milkar kuch kamaal karte hain.",
    "hinglish": "Hi guys! Aaj hum ek amazing product ke baare mein baat karenge. Ready ho?",
    "indian_english": "Hello everyone! Welcome to something special crafted just for you.",
    "english": "Hello there! This is a quick preview of how I sound. Great to meet you.",
}


@api.post("/ai/tts/preview")
async def ai_tts_preview(body: VoicePreviewReq, request: Request):
    """Generate a short audio sample for a voice — cheap, cached, free of credit cost."""
    _ = await _current(request)
    lang = (body.language or "english").lower()
    key = f"{body.voice_id}::{lang}"
    if key in _VOICE_PREVIEW_CACHE:
        return {"audio_url": _VOICE_PREVIEW_CACHE[key], "cached": True}
    sample = _PREVIEW_SAMPLES.get(lang) or _PREVIEW_SAMPLES["english"]
    result = await synthesize_speech(sample, body.voice_id, 0.55, 0.75, 0.0,
                                     language_code=project_language_to_iso(lang))
    if result.get("audio_url"):
        url = await save_audio_persistent(result["audio_url"]) or result["audio_url"]
        _VOICE_PREVIEW_CACHE[key] = url
        return {"audio_url": url, "cached": False}
    # Fallback to OpenAI TTS
    fb = await synthesize_openai_tts(sample, style="default")
    if fb.get("audio_url"):
        url = await save_audio_persistent(fb["audio_url"]) or fb["audio_url"]
        _VOICE_PREVIEW_CACHE[key] = url
        return {"audio_url": url, "cached": False, "provider": "openai"}
    return {"audio_url": None, "error": result.get("error") or "Preview unavailable"}


@api.post("/ai/tts")
async def ai_tts(body: TTSRequest, request: Request):
    user = await _current(request)
    cost = max(1, len(body.text) // 200)
    user = await _charge_credits(user, cost, "tts_generation")
    # Look up the project language so we can lock in an accent-appropriate
    # phoneme set (multilingual v2 model). Without this, English-trained voices
    # read Hindi text with an English accent.
    proj_lang = None
    if body.project_id:
        proj = await db.projects.find_one({"project_id": body.project_id, "user_id": user.user_id},
                                           {"_id": 0, "language": 1})
        proj_lang = (proj or {}).get("language")
    language_code = project_language_to_iso(proj_lang)
    # Try ElevenLabs first (real human-grade voice if user's plan allows)
    result = await synthesize_speech(body.text, body.voice_id, body.stability,
                                     body.similarity_boost, body.style,
                                     language_code=language_code)
    if result.get("audio_url"):
        url = await save_audio_persistent(result["audio_url"]) or result["audio_url"]
        # Mark project voice as fresh — synced with current script_version.
        if body.project_id:
            proj = await db.projects.find_one({"project_id": body.project_id, "user_id": user.user_id},
                                              {"_id": 0, "script_version": 1})
            sv = (proj or {}).get("script_version", 0)
            await db.projects.update_one(
                {"project_id": body.project_id, "user_id": user.user_id},
                {"$set": {"voice_stale": False, "voice_script_version": sv}},
            )
        return {"audio_url": url, "provider": "elevenlabs",
                "credits_left": user.credits}
    # Fallback: OpenAI TTS via Emergent LLM key.
    # For config errors (invalid/missing ElevenLabs key) we still fall back
    # so voice generation never dies — but we surface a note so the user
    # knows to update their key for higher-quality Indian voices.
    err_msg = (result.get("error") or "")
    is_config_error = any(
        k in err_msg.lower()
        for k in ["invalid elevenlabs_api_key", "elevenlabs_api_key missing"]
    )
    fb = await synthesize_openai_tts(body.text, style="default")
    if fb.get("audio_url"):
        url = await save_audio_persistent(fb["audio_url"]) or fb["audio_url"]
        if body.project_id:
            proj = await db.projects.find_one({"project_id": body.project_id, "user_id": user.user_id},
                                              {"_id": 0, "script_version": 1})
            sv = (proj or {}).get("script_version", 0)
            await db.projects.update_one(
                {"project_id": body.project_id, "user_id": user.user_id},
                {"$set": {"voice_stale": False, "voice_script_version": sv}},
            )
        note = ("ElevenLabs key invalid — used OpenAI HD voice as fallback. "
                "For authentic Indian accent, set a valid sk_... ElevenLabs key.") if is_config_error \
            else "ElevenLabs voice unavailable — used OpenAI HD voice."
        return {"audio_url": url, "provider": "openai",
                "voice": fb.get("voice"), "credits_left": user.credits,
                "note": note}
    await _refund(user, cost, "tts_generation")
    return {"audio_url": None,
            "error": result.get("error") or fb.get("error") or "Voice service unavailable.",
            "refunded": True, "credits_left": user.credits}


class OpenAITTSReq(BaseModel):
    text: str
    voice: str = "nova"
    model: str = "tts-1"


@api.post("/ai/tts/openai")
async def ai_tts_openai(body: OpenAITTSReq, request: Request):
    user = await _current(request)
    cost = max(1, len(body.text) // 200)
    user = await _charge_credits(user, cost, "tts_openai")
    result = await synthesize_openai_tts(body.text, style="default", model=body.model)
    if result.get("error"):
        await _refund(user, cost, "tts_openai")
        return {"audio_url": None, "error": result["error"], "refunded": True,
                "credits_left": user.credits}
    url = await save_audio_persistent(result["audio_url"]) or result["audio_url"]
    return {"audio_url": url, "voice": result.get("voice"),
            "provider": "openai", "credits_left": user.credits}


# ---------- AI: scene images ----------
@api.post("/ai/scene-image")
async def ai_scene_image(body: SceneImageRequest, request: Request):
    user = await _current(request)
    user = await _charge_credits(user, 3, "scene_image")
    img = await generate_scene_image(body.prompt, body.aspect_ratio)
    if not img:
        await _refund(user, 3, "scene_image")
        return {"image_url": None, "credits_left": user.credits,
                "warning": "Image generation unavailable — credits refunded."}
    url = await save_image_persistent(img) or img
    return {"image_url": url, "credits_left": user.credits}


async def _fetch_as_data_uri(url: str) -> Optional[str]:
    """Download a remote image, persist it to disk and return a SHORT /api/files/images/... URL."""
    if not url or not url.startswith("http"):
        return None
    # Upgrade Play Store / Google-hosted image URLs to their maximum resolution.
    # These CDN URLs use =wXXX-hYYY suffixes to request specific sizes; stripping
    # them returns the original hi-res asset.
    hi_url = url
    if any(host in url for host in ("googleusercontent.com", "gstatic.com", "ggpht.com")):
        base = url.split("=", 1)[0]
        # Request a large landscape/portrait rendering. s0 = original size.
        hi_url = base + "=s0"
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=15.0, follow_redirects=True) as c:
            r = await c.get(hi_url, headers={"User-Agent": "Mozilla/5.0 CineReelBot/1.0"})
            # Fallback to original URL if the upgraded one 4xx-ed.
            if r.status_code != 200 and hi_url != url:
                r = await c.get(url, headers={"User-Agent": "Mozilla/5.0 CineReelBot/1.0"})
            if r.status_code != 200 or len(r.content) < 1024:
                return None
            mime = r.headers.get("content-type", "image/jpeg").split(";")[0]
            import base64 as _b64
            data_uri = f"data:{mime};base64,{_b64.b64encode(r.content).decode()}"
            return (await save_image_persistent(data_uri)) or data_uri
    except Exception:
        return None


@api.post("/ai/storyboard")
async def ai_storyboard(body: StoryboardRequest, request: Request):
    user = await _current(request)
    # Pull project-level source assets (real screenshots / icon from a prior /ai/script scrape)
    real_assets: List[str] = []
    real_icon: Optional[str] = None
    real_title: Optional[str] = None
    if body.project_id:
        proj = await db.projects.find_one(
            {"project_id": body.project_id, "user_id": user.user_id}, {"_id": 0, "source_assets": 1}
        )
        sa = (proj or {}).get("source_assets") or {}
        real_assets = list(sa.get("screenshots") or [])
        real_icon = sa.get("icon")
        real_title = sa.get("title")

    out: List[dict] = []
    succeeded = 0
    real_idx = 0
    # ----- Scene mix planning -----
    # Target: 4 REAL product screenshots + 2 AI-rendered scenes when the script
    # produces the recommended 6 scenes and we have enough real assets. The
    # logo (real_icon) is deliberately reserved for the CTA slot (scene 6) so
    # it never steals a product-screenshot slot.
    n_scenes = len(body.scenes)
    # per_scene_plan[i] ∈ {"logo", "real", "ai"}
    per_scene_plan: List[str] = []
    if n_scenes == 6 and len(real_assets) >= 4:
        # Slot map: [ai hook, real, real, real, real, logo-or-ai CTA]
        per_scene_plan = ["ai", "real", "real", "real", "real",
                          "logo" if real_icon else "ai"]
    else:
        # Fallback: proportional ~66% real
        real_target = min(len(real_assets), max(1, int(n_scenes * 2 / 3)))
        cta_slot = n_scenes - 1
        for i in range(n_scenes):
            if i == cta_slot and real_icon:
                per_scene_plan.append("logo")
            elif i == 0:
                per_scene_plan.append("ai")
            elif len([p for p in per_scene_plan if p == "real"]) < real_target and real_assets:
                per_scene_plan.append("real")
            else:
                per_scene_plan.append("ai")
    for i, sc in enumerate(body.scenes):
        user = await _charge_credits(user, 3, "storyboard_scene")
        img: Optional[str] = None
        source_tag = None
        plan = per_scene_plan[i] if i < len(per_scene_plan) else "ai"

        # 1. Logo slot → real app icon
        if plan == "logo" and real_icon:
            img = await _fetch_as_data_uri(real_icon)
            if img:
                source_tag = "real_icon"

        # 2. Real slot → next Play Store screenshot
        if not img and plan == "real":
            while real_idx < len(real_assets) and not img:
                img = await _fetch_as_data_uri(real_assets[real_idx])
                real_idx += 1
            if img:
                source_tag = "real"

        # 3. Otherwise generate via Nano Banana — but strip any brand text from the prompt
        if not img:
            prompt = sc.get("visual_prompt") or sc.get("description") or ""
            # Remove any potential fake-brand directives — keep it scene-only.
            prompt = _strip_brand_directives(prompt, real_title)
            camera = sc.get("camera", "")
            lighting = sc.get("lighting", "")
            motion = sc.get("motion", "")
            full = (
                f"{prompt}. Camera: {camera}. Lighting: {lighting}. Motion: {motion}. "
                f"Do not include any text, logo, wordmark or app-store badge in this image."
            )
            img = await generate_scene_image(full, body.aspect_ratio)
            if img:
                img = (await save_image_persistent(img)) or img
                source_tag = "ai"

        # 4. Final fallback — if AI failed AND we still have real assets left, use one
        # so the scene is never empty.
        if not img and real_assets and real_idx < len(real_assets):
            while real_idx < len(real_assets) and not img:
                img = await _fetch_as_data_uri(real_assets[real_idx])
                real_idx += 1
            if img:
                source_tag = "real"

        if not img:
            await _refund(user, 3, "storyboard_scene")
        else:
            succeeded += 1
        out.append({**sc, "image_url": img, "source": source_tag})

    if body.project_id and succeeded > 0:
        thumb = next((s["image_url"] for s in out if s["image_url"]), None)
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {"scenes": out, "updated_at": utc_now().isoformat(), "thumbnail": thumb}},
        )
    return {"scenes": out, "credits_left": user.credits, "succeeded": succeeded,
            "real_screenshots_used": real_idx,
            "real_icon_used": any(s.get("source") == "real_icon" for s in out)}


def _strip_brand_directives(text: str, real_title: Optional[str]) -> str:
    """Remove any 'brand named X' / made-up brand names from a visual prompt."""
    if not text:
        return text
    # Remove quoted strings (often fake brand wordmarks)
    import re as _re
    cleaned = _re.sub(r'"[^"]{2,40}"', "", text)
    # Drop common 'app store' badge phrases
    for token in ["app store", "google play", "play store", "get it on", "download on the",
                  "5 stars", "4.5 stars", "10000 reviews"]:
        cleaned = _re.sub(token, "", cleaned, flags=_re.IGNORECASE)
    if real_title:
        # Keep the real brand mention as-is.
        pass
    return cleaned.strip()


# ---------- PROJECTS ----------
@api.post("/projects")
async def create_project(body: ProjectCreate, request: Request):
    user = await _current(request)
    p = Project(user_id=user.user_id, **body.model_dump())
    await db.projects.insert_one(_doc(p))
    return p.model_dump()


@api.get("/projects")
async def list_projects(request: Request, folder: Optional[str] = None):
    user = await _current(request)
    q = {"user_id": user.user_id}
    if folder:
        q["folder"] = folder
    # Only return summary fields — never embed scenes/script/audio in the list response
    projection = {
        "_id": 0, "project_id": 1, "title": 1, "video_type": 1, "language": 1,
        "aspect_ratio": 1, "resolution": 1, "fps": 1, "duration_sec": 1,
        "status": 1, "thumbnail": 1, "video_url": 1, "folder": 1,
        "workspace_id": 1, "music_id": 1, "music_url": 1,
        "created_at": 1, "updated_at": 1,
    }
    items = await db.projects.find(q, projection).sort("updated_at", -1).to_list(200)
    # Coerce any leftover base64 thumbnail to a small placeholder so the list response stays tiny
    for it in items:
        thumb = it.get("thumbnail") or ""
        if thumb.startswith("data:") and len(thumb) > 500:
            it["thumbnail"] = None
    return items


@api.get("/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    user = await _current(request)
    p = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@api.put("/projects/{project_id}")
async def update_project(project_id: str, request: Request):
    user = await _current(request)
    body = await request.json()
    body["updated_at"] = utc_now().isoformat()
    body.pop("project_id", None)
    body.pop("user_id", None)
    # If the caller edited the script, flag the voice as stale so the frontend
    # nudges the user to re-record it.
    inc = None
    if "script" in body:
        body["voice_stale"] = True
        inc = {"script_version": 1}
    ops = {"$set": body}
    if inc:
        ops["$inc"] = inc
    await db.projects.update_one({"project_id": project_id, "user_id": user.user_id}, ops)
    p = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
    return p


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, request: Request):
    user = await _current(request)
    await db.projects.delete_one({"project_id": project_id, "user_id": user.user_id})
    return {"ok": True}


@api.post("/projects/{project_id}/duplicate")
async def duplicate_project(project_id: str, request: Request):
    user = await _current(request)
    src = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Not found")
    src.pop("project_id", None)
    new_p = Project(**{**src, "user_id": user.user_id, "title": src.get("title", "Untitled") + " (copy)"})
    await db.projects.insert_one(_doc(new_p))
    return new_p.model_dump()


def _probe_audio_duration(audio_bytes: bytes) -> float:
    """Return duration in seconds of an in-memory audio buffer using ffmpeg. 0.0 on failure."""
    import subprocess as _sp
    import tempfile as _tf
    from pathlib import Path as _P
    from video_renderer import FFMPEG_BIN as _FFB
    try:
        with _tf.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            f.write(audio_bytes)
            tmp = _P(f.name)
        r = _sp.run([_FFB, "-i", str(tmp)], capture_output=True, timeout=10)
        tmp.unlink(missing_ok=True)
        for line in r.stderr.decode(errors="ignore").splitlines():
            if "Duration:" in line:
                h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
                return int(h) * 3600 + int(m) * 60 + float(s)
    except Exception as e:
        print(f"[probe] {e}")
    return 0.0


@api.post("/projects/{project_id}/render")
async def render_project_video(project_id: str, request: Request):
    """Start a background render job. Returns a job_id immediately.
    Frontend polls GET /api/render/jobs/{job_id} for completion."""
    user = await _current(request)
    p = await db.projects.find_one({"project_id": project_id, "user_id": user.user_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    scenes = p.get("scenes") or []
    if not scenes or not any(s.get("image_url") for s in scenes):
        raise HTTPException(status_code=400, detail="Generate the storyboard first.")

    # ----- Duration alignment -----
    # If a voiceover exists we make the video match the VOICE length (not
    # project.duration_sec) so subtitles/pacing feel natural. If no voice yet, we
    # fall back to the project's configured duration. Scene durations are then
    # distributed evenly to sum to the chosen target.
    audio_url = p.get("audio_url")
    voice_dur = 0.0
    if audio_url:
        try:
            audio_bytes = await fetch_asset_bytes(audio_url)
            if audio_bytes:
                voice_dur = await asyncio.to_thread(_probe_audio_duration, audio_bytes)
        except Exception as e:
            print(f"[render] voice probe failed: {e}")
    target_dur = float(voice_dur) if voice_dur > 3 else float(int(p.get("duration_sec") or 30))
    total_scene_dur = sum(float(s.get("duration") or 0) for s in scenes)
    # Redistribute when scenes drastically disagree with the target (>25% off).
    if total_scene_dur < target_dur * 0.85 or total_scene_dur > target_dur * 1.15:
        per = round(target_dur / len(scenes), 2)
        for s in scenes:
            s["duration"] = per
        await db.projects.update_one(
            {"project_id": project_id, "user_id": user.user_id},
            {"$set": {"scenes": scenes, "updated_at": utc_now().isoformat()}},
        )

    user = await _charge_credits(user, 10, "video_render", project_id)
    job_id = "job_" + uuid.uuid4().hex[:12]
    await db.render_jobs.insert_one({
        "job_id": job_id,
        "user_id": user.user_id,
        "project_id": project_id,
        "status": "pending",
        "video_url": None,
        "error": None,
        "created_at": utc_now().isoformat(),
    })
    asyncio.create_task(_run_render_job(
        job_id=job_id, user_id=user.user_id, project_id=project_id,
        scenes=scenes, audio_url=p.get("audio_url"),
        aspect_ratio=p.get("aspect_ratio", "9:16"), fps=int(p.get("fps", 30)),
    ))
    return {"job_id": job_id, "status": "pending", "credits_left": user.credits}


@api.get("/render/jobs/{job_id}")
async def render_job_status(job_id: str, request: Request):
    user = await _current(request)
    job = await db.render_jobs.find_one({"job_id": job_id, "user_id": user.user_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def _run_render_job(job_id: str, user_id: str, project_id: str,
                          scenes: list, audio_url: Optional[str],
                          aspect_ratio: str, fps: int):
    try:
        video_url = await render_video(scenes=scenes, audio_data_uri=audio_url,
                                       aspect_ratio=aspect_ratio, fps=fps)
        if not video_url:
            # Refund and mark failed
            udoc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            if udoc:
                from models import User as _U
                await _refund(_U(**{k: v for k, v in udoc.items() if k != "password_hash"}),
                              10, "video_render", project_id)
            await db.render_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "failed", "error": "Render failed — check storyboard images."}}
            )
            return
        await db.projects.update_one(
            {"project_id": project_id, "user_id": user_id},
            {"$set": {"video_url": video_url, "status": "complete", "updated_at": utc_now().isoformat()}},
        )
        await db.render_jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "complete", "video_url": video_url}}
        )
    except Exception as e:
        logging.exception("[render job] failed")
        await db.render_jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "failed", "error": str(e)[:200]}}
        )


class QuickProjectFromScript(BaseModel):
    title: str
    video_type: str = "cinematic_ad"
    language: str = "english"
    aspect_ratio: str = "9:16"
    duration_sec: int = 30
    script: dict


@api.post("/projects/from-script")
async def create_project_from_script(body: QuickProjectFromScript, request: Request):
    user = await _current(request)
    p = Project(
        user_id=user.user_id,
        title=body.title,
        video_type=body.video_type,
        language=body.language,
        aspect_ratio=body.aspect_ratio,
        duration_sec=body.duration_sec,
        script=body.script,
        status="scripting",
    )
    await db.projects.insert_one(_doc(p))
    return p.model_dump()


# ---------- BRAND KITS ----------
@api.post("/brand-kits")
async def create_brand_kit(body: BrandKitCreate, request: Request):
    user = await _current(request)
    kit = BrandKit(user_id=user.user_id, **body.model_dump())
    await db.brand_kits.insert_one(_doc(kit))
    return kit.model_dump()


@api.get("/brand-kits")
async def list_brand_kits(request: Request):
    user = await _current(request)
    return await db.brand_kits.find({"user_id": user.user_id}, {"_id": 0}).to_list(50)


@api.delete("/brand-kits/{kit_id}")
async def delete_brand_kit(kit_id: str, request: Request):
    user = await _current(request)
    await db.brand_kits.delete_one({"kit_id": kit_id, "user_id": user.user_id})
    return {"ok": True}


# ---------- CREDITS / PLANS / USAGE ----------
@api.get("/credits/history")
async def credits_history(request: Request):
    user = await _current(request)
    items = await db.credit_transactions.find({"user_id": user.user_id}, {"_id": 0})\
        .sort("created_at", -1).to_list(200)
    return items


@api.post("/billing/purchase")
async def purchase_plan(body: PlanPurchase, request: Request):
    """MVP: simulated Stripe checkout — assigns plan + adds credits."""
    user = await _current(request)
    plan = next((p for p in PLANS if p["id"] == body.plan), None)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan")
    new_credits = user.credits + plan["credits"]
    await db.users.update_one({"user_id": user.user_id},
                              {"$set": {"plan": plan["id"], "credits": new_credits}})
    await db.credit_transactions.insert_one(_doc(CreditTransaction(
        user_id=user.user_id, delta=plan["credits"], reason=f"plan_{plan['id']}",
    )))
    return {"ok": True, "plan": plan["id"], "credits": new_credits}


# ---------- ADMIN ----------
async def _require_admin(request: Request) -> User:
    user = await _current(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@api.get("/admin/users")
async def admin_users(request: Request):
    await _require_admin(request)
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return items


@api.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, body: AdminUserUpdate, request: Request):
    await _require_admin(request)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="No fields")
    await db.users.update_one({"user_id": user_id}, {"$set": upd})
    return {"ok": True}


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request):
    await _require_admin(request)
    await db.users.delete_one({"user_id": user_id})
    await db.projects.delete_many({"user_id": user_id})
    return {"ok": True}


@api.get("/admin/analytics")
async def admin_analytics(request: Request):
    await _require_admin(request)
    users = await db.users.count_documents({})
    projects = await db.projects.count_documents({})
    txns = await db.credit_transactions.count_documents({})
    revenue_docs = await db.credit_transactions.find(
        {"reason": {"$regex": "^plan_"}}, {"_id": 0}
    ).to_list(1000)
    plan_prices = {p["id"]: p["price_usd"] for p in PLANS}
    revenue = sum(plan_prices.get(t["reason"].replace("plan_", ""), 0) for t in revenue_docs)
    # plan breakdown
    plans_pipeline = [{"$group": {"_id": "$plan", "count": {"$sum": 1}}}]
    plans_agg = await db.users.aggregate(plans_pipeline).to_list(20)
    return {
        "users": users, "projects": projects, "transactions": txns,
        "revenue_usd": revenue, "plans": plans_agg,
    }


# ---------- STARTUP: ensure admin + indexes ----------
@app.on_event("startup")
async def on_startup():
    # default admin
    admin_email = "admin@cinereel.ai"
    existing = await db.users.find_one({"email": admin_email}, {"_id": 0})
    if not existing:
        admin = User(user_id=gen_user_id(), email=admin_email, name="CineReel Admin",
                     role="admin", credits=100000, plan="enterprise", auth_provider="email")
        doc = _doc(admin)
        doc["password_hash"] = hash_password("admin12345")
        await db.users.insert_one(doc)
        logging.info("Default admin created: admin@cinereel.ai / admin12345")
    await db.projects.create_index("user_id")
    await db.user_sessions.create_index("session_token", unique=True)
    # Initialize object storage (non-fatal)
    try:
        await init_objstore()
    except Exception as e:
        logging.warning(f"objstore init failed: {e}")
    # Background migration — completely opt-in to keep production startup bullet-proof
    if os.environ.get("RUN_LEGACY_MIGRATION", "0") == "1":
        asyncio.create_task(_migrate_legacy_base64_to_disk())


async def _migrate_legacy_base64_to_disk():
    """Background migration: move heavy base64 fields out of project docs to disk.
    Streams one project at a time and yields to the event loop between writes so it
    never spikes memory or blocks health-checks."""
    try:
        # Only iterate the IDs first — keep memory tiny
        cur = db.projects.find(
            {"$or": [
                {"audio_url": {"$regex": "^data:"}},
                {"thumbnail": {"$regex": "^data:"}},
                {"scenes.image_url": {"$regex": "^data:"}},
            ]},
            {"_id": 1},
        )
        ids = [doc["_id"] async for doc in cur]
        converted = 0
        for _id in ids:
            await asyncio.sleep(0.5)  # yield + throttle
            try:
                p = await db.projects.find_one(
                    {"_id": _id},
                    {"project_id": 1, "scenes": 1, "audio_url": 1, "thumbnail": 1},
                )
                if not p:
                    continue
                update = {}
                if isinstance(p.get("audio_url"), str) and p["audio_url"].startswith("data:"):
                    u = await save_audio_persistent(p["audio_url"])
                    if u:
                        update["audio_url"] = u
                if isinstance(p.get("thumbnail"), str) and p["thumbnail"].startswith("data:"):
                    u = await save_image_persistent(p["thumbnail"])
                    if u:
                        update["thumbnail"] = u
                scenes = p.get("scenes") or []
                new_scenes = []
                scenes_changed = False
                for sc in scenes:
                    img = sc.get("image_url") or ""
                    if img.startswith("data:"):
                        u = await save_image_persistent(img)
                        if u:
                            sc = {**sc, "image_url": u}
                            scenes_changed = True
                    new_scenes.append(sc)
                    await asyncio.sleep(0)  # yield between scenes
                if scenes_changed:
                    update["scenes"] = new_scenes
                if update:
                    await db.projects.update_one({"_id": _id}, {"$set": update})
                    converted += 1
            except Exception as e:
                logging.warning(f"[migration] skipped {_id}: {e}")
                continue
        if converted:
            logging.info(f"Migrated {converted} legacy projects from base64 to disk-backed assets.")
    except Exception:
        logging.exception("[migration] aborted")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ---------- mount ----------
app.include_router(api)

# Studio router (Ad Studio, Workspaces, STT, Multi-creative, Campaign, etc.)
from routes_studio import build_studio_router  # noqa: E402
studio_router = build_studio_router(db, _current, _charge_credits, _refund)
app.include_router(studio_router, prefix="/api")

# Serve files: try local disk first, fallback to object storage (persistent across pod restarts).
from fastapi import Path as FPath
from asset_store import url_kind_and_path  # noqa: E402

@app.get("/api/files/{kind}/{filename}")
async def serve_file(kind: str, filename: str):
    if kind not in ("images", "audio", "videos"):
        raise HTTPException(status_code=404, detail="not found")
    url = f"/api/files/{kind}/{filename}"
    data = await fetch_asset_bytes(url)
    if data is None:
        raise HTTPException(status_code=404, detail="not found")
    ext = filename.rsplit(".", 1)[-1].lower()
    media_type = {
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp",
        "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg",
        "mp4": "video/mp4", "mov": "video/quicktime",
    }.get(ext, "application/octet-stream")
    return Response(content=data, media_type=media_type,
                    headers={"Cache-Control": "public, max-age=86400"})

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
