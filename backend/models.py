"""Pydantic models for CineReel AI."""
from datetime import datetime, timezone
from typing import Any, List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr
import uuid


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------- AUTH ----------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    auth_provider: Literal["google", "email"] = "email"
    role: Literal["user", "admin"] = "user"
    credits: int = 100
    plan: Literal["free", "creator", "studio", "enterprise"] = "free"
    created_at: datetime = Field(default_factory=utc_now)


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "user"
    credits: int = 0
    plan: str = "free"


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OTPRequest(BaseModel):
    email: EmailStr


class OTPVerify(BaseModel):
    email: EmailStr
    code: str


# ---------- PROJECTS ----------
class Project(BaseModel):
    project_id: str = Field(default_factory=lambda: new_id("proj"))
    user_id: str
    title: str
    video_type: str  # cinematic_ad, product_ad, talking_avatar, yt_short, ig_reel, etc.
    language: str = "english"  # english, hindi, hinglish
    aspect_ratio: str = "9:16"  # 9:16, 16:9, 1:1
    resolution: str = "1080p"
    fps: int = 30
    status: Literal["draft", "scripting", "voicing", "rendering", "complete", "failed"] = "draft"
    script: Optional[dict] = None  # {hook, body, cta, scenes:[]}
    voice_id: Optional[str] = None
    audio_url: Optional[str] = None
    scenes: List[dict] = []  # generated scene images
    thumbnail: Optional[str] = None
    video_url: Optional[str] = None
    duration_sec: int = 30
    brand_kit_id: Optional[str] = None
    folder: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ProjectCreate(BaseModel):
    title: str
    video_type: str
    language: str = "english"
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"
    fps: int = 30
    duration_sec: int = 30


# ---------- SCRIPT ----------
class ScriptRequest(BaseModel):
    project_id: Optional[str] = None
    topic: str
    video_type: str
    language: str = "english"
    tone: str = "professional"  # professional, motivational, friendly, emotional, storytelling
    duration_sec: int = 30
    target_audience: Optional[str] = None
    cta: Optional[str] = None
    extra_notes: Optional[str] = None


class HookRequest(BaseModel):
    topic: str
    language: str = "english"
    count: int = 5


class CTARequest(BaseModel):
    topic: str
    language: str = "english"
    count: int = 5


# ---------- VOICE ----------
class TTSRequest(BaseModel):
    text: str
    voice_id: str
    stability: float = 0.55
    similarity_boost: float = 0.75
    style: float = 0.3


# ---------- SCENE / IMAGE ----------
class SceneImageRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "9:16"


class StoryboardRequest(BaseModel):
    project_id: Optional[str] = None
    scenes: List[dict]  # [{description, camera, lighting, motion}]
    aspect_ratio: str = "9:16"


# ---------- BRAND KIT / TEMPLATES / ASSETS ----------
class BrandKit(BaseModel):
    kit_id: str = Field(default_factory=lambda: new_id("kit"))
    user_id: str
    name: str
    primary_color: str = "#E2FF3D"
    secondary_color: str = "#0A0A0B"
    accent_color: str = "#FFFFFF"
    font: str = "Outfit"
    logo_url: Optional[str] = None
    watermark_url: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class BrandKitCreate(BaseModel):
    name: str
    primary_color: str = "#E2FF3D"
    secondary_color: str = "#0A0A0B"
    accent_color: str = "#FFFFFF"
    font: str = "Outfit"
    logo_url: Optional[str] = None
    watermark_url: Optional[str] = None


class Template(BaseModel):
    template_id: str
    title: str
    category: str
    video_type: str
    aspect_ratio: str
    thumbnail: str
    description: str
    duration_sec: int = 30
    is_premium: bool = False


# ---------- CREDITS / TRANSACTIONS ----------
class CreditTransaction(BaseModel):
    txn_id: str = Field(default_factory=lambda: new_id("txn"))
    user_id: str
    delta: int  # negative for spend, positive for credit
    reason: str
    project_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class PlanPurchase(BaseModel):
    plan: Literal["creator", "studio", "enterprise"]


# ---------- ADMIN ----------
class AdminUserUpdate(BaseModel):
    credits: Optional[int] = None
    plan: Optional[str] = None
    role: Optional[str] = None
