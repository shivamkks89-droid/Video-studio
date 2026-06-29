"""CineReel AI — FastAPI backend."""
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
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
    try:
        script = await generate_script(body.model_dump())
    except AIServiceError as e:
        await _refund(user, 5, "script_generation", body.project_id)
        raise HTTPException(status_code=502, detail=str(e))
    if body.project_id:
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {"script": script, "status": "scripting", "updated_at": utc_now().isoformat()}},
        )
    return {"script": script, "credits_left": user.credits}


@api.post("/ai/hooks")
async def ai_hooks(body: HookRequest, request: Request):
    user = await _current(request)
    user = await _charge_credits(user, 1, "hook_generation")
    try:
        hooks = await generate_hooks(body.topic, body.language, body.count)
    except AIServiceError as e:
        await _refund(user, 1, "hook_generation")
        raise HTTPException(status_code=502, detail=str(e))
    return {"hooks": hooks, "credits_left": user.credits}


@api.post("/ai/ctas")
async def ai_ctas(body: CTARequest, request: Request):
    user = await _current(request)
    user = await _charge_credits(user, 1, "cta_generation")
    try:
        ctas = await generate_ctas(body.topic, body.language, body.count)
    except AIServiceError as e:
        await _refund(user, 1, "cta_generation")
        raise HTTPException(status_code=502, detail=str(e))
    return {"ctas": ctas, "credits_left": user.credits}


class IdeaReq(BaseModel):
    query: str
    language: str = "english"


@api.post("/ai/ad-ideas")
async def ai_ad_ideas(body: IdeaReq, request: Request):
    user = await _current(request)
    user = await _charge_credits(user, 2, "ad_ideas")
    try:
        ideas = await suggest_ad_ideas(body.query, body.language)
    except AIServiceError as e:
        await _refund(user, 2, "ad_ideas")
        raise HTTPException(status_code=502, detail=str(e))
    return {"ideas": ideas, "credits_left": user.credits}


# ---------- AI: voice (ElevenLabs) ----------
@api.post("/ai/tts")
async def ai_tts(body: TTSRequest, request: Request):
    user = await _current(request)
    cost = max(1, len(body.text) // 200)
    user = await _charge_credits(user, cost, "tts_generation")
    result = await synthesize_speech(body.text, body.voice_id, body.stability,
                                     body.similarity_boost, body.style)
    if "error" in result:
        await _refund(user, cost, "tts_generation")
        raise HTTPException(status_code=502, detail=result["error"])
    return {"audio_url": result["audio_url"], "credits_left": user.credits}


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
    return {"image_url": img, "credits_left": user.credits}


@api.post("/ai/storyboard")
async def ai_storyboard(body: StoryboardRequest, request: Request):
    user = await _current(request)
    out: List[dict] = []
    succeeded = 0
    for sc in body.scenes:
        user = await _charge_credits(user, 3, "storyboard_scene")
        prompt = sc.get("visual_prompt") or sc.get("description") or ""
        camera = sc.get("camera", "")
        lighting = sc.get("lighting", "")
        motion = sc.get("motion", "")
        full = f"{prompt}. Camera: {camera}. Lighting: {lighting}. Motion: {motion}."
        img = await generate_scene_image(full, body.aspect_ratio)
        if not img:
            await _refund(user, 3, "storyboard_scene")
        else:
            succeeded += 1
        out.append({**sc, "image_url": img})
    if body.project_id and succeeded > 0:
        thumb = next((s["image_url"] for s in out if s["image_url"]), None)
        await db.projects.update_one(
            {"project_id": body.project_id, "user_id": user.user_id},
            {"$set": {"scenes": out, "updated_at": utc_now().isoformat(), "thumbnail": thumb}},
        )
    return {"scenes": out, "credits_left": user.credits, "succeeded": succeeded}


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
    items = await db.projects.find(q, {"_id": 0}).sort("updated_at", -1).to_list(200)
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


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ---------- mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
