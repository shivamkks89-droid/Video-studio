"""CineReel AI — FastAPI backend."""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
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
    AIServiceError, generate_ctas, generate_hooks, generate_scene_image,
    generate_script, list_voices, suggest_ad_ideas, synthesize_speech,
)
from asset_store import (
    save_image_data_uri as save_image_persistent,
    save_audio_data_uri as save_audio_persistent,
    fetch_to_bytes as fetch_asset_bytes,
)
from object_storage import init_storage as init_objstore
from openai_tts import synthesize_openai_tts
from scraper import scrape as scrape_query, to_script_context
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
async def get_voices(language: Optional[str] = None):
    return list_voices(language)


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
        update = {"script": script, "status": "scripting", "updated_at": utc_now().isoformat()}
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
            {"$set": update},
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

    return {
        "axis": axis,
        "variants": variants,
        "source_assets": scraped if scraped.get("ok") else None,
        "credits_left": user.credits,
        "warning": None if scraped.get("ok") else "No brand info — variants use the [BRAND] placeholder.",
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
        {"$set": update},
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
@api.post("/ai/tts")
async def ai_tts(body: TTSRequest, request: Request):
    user = await _current(request)
    cost = max(1, len(body.text) // 200)
    user = await _charge_credits(user, cost, "tts_generation")
    # Try ElevenLabs first (real human-grade voice if user's plan allows)
    result = await synthesize_speech(body.text, body.voice_id, body.stability,
                                     body.similarity_boost, body.style)
    if result.get("audio_url"):
        url = await save_audio_persistent(result["audio_url"]) or result["audio_url"]
        return {"audio_url": url, "provider": "elevenlabs",
                "credits_left": user.credits}
    # Fallback: OpenAI TTS via Emergent LLM key
    fb = await synthesize_openai_tts(body.text, style="default")
    if fb.get("audio_url"):
        url = await save_audio_persistent(fb["audio_url"]) or fb["audio_url"]
        return {"audio_url": url, "provider": "openai",
                "voice": fb.get("voice"), "credits_left": user.credits,
                "note": "ElevenLabs voice unavailable — used OpenAI HD voice."}
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
    icon_used = False
    for i, sc in enumerate(body.scenes):
        user = await _charge_credits(user, 3, "storyboard_scene")
        prompt_text = (sc.get("visual_prompt") or sc.get("description") or "").lower()
        wants_logo = any(k in prompt_text for k in ["logo", "icon", "brand mark", "wordmark", "app icon"])
        wants_product = any(k in prompt_text for k in [
            "app", "screen", "ui", "interface", "feature", "product", "download", "store",
            "phone", "mobile", "dashboard",
        ])
        img: Optional[str] = None
        source_tag = None

        # 1. Logo scene → use the real icon (only once if we have it)
        if wants_logo and real_icon and not icon_used:
            img = await _fetch_as_data_uri(real_icon)
            if img:
                icon_used = True
                source_tag = "real_icon"

        # 2. Product / UI scene → use a real screenshot
        if not img and real_assets and (wants_product or (i % 2 == 1 and not wants_logo)):
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
            "real_screenshots_used": real_idx, "real_icon_used": icon_used}


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
    await db.projects.update_one({"project_id": project_id, "user_id": user.user_id}, {"$set": body})
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
