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
    unlimited_credits: bool = False
    created_at: datetime = Field(default_factory=utc_now)


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "user"
    credits: int = 0
    plan: str = "free"
    unlimited_credits: bool = False


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
    language: str = "english"  # english, hindi, hinglish, bengali, marathi, gujarati, ...
    accent: Optional[str] = None  # indian_english, american_english, british_english, ...
    accent_locked: bool = False   # 🔒 lock accent across every regeneration
    voice_preset: Optional[str] = None  # natural, professional, ugc, cinematic, ...
    pronunciation: dict = Field(default_factory=dict)  # {"HeartLink": "Heart Link", "AI": "A I"}
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
    target_gender: Optional[str] = None  # women | men | girls | boys | kids | teens | all
    target_age: Optional[str] = None     # e.g. "18-24", "25-34", "35-45", "45+"
    cta: Optional[str] = None
    extra_notes: Optional[str] = None
    brand_name: Optional[str] = None
    brand_url: Optional[str] = None
    brand_logo: Optional[str] = None


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
    project_id: Optional[str] = None


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


# ---------- WORKSPACES / CLIENT FOLDERS ----------
class Workspace(BaseModel):
    workspace_id: str = Field(default_factory=lambda: new_id("ws"))
    user_id: str
    name: str
    client_name: Optional[str] = None
    color: str = "#E2FF3D"
    brand_kit_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)


class WorkspaceCreate(BaseModel):
    name: str
    client_name: Optional[str] = None
    color: str = "#E2FF3D"
    brand_kit_id: Optional[str] = None


# ---------- SCRIPT REFINE ----------
class ScriptRefineRequest(BaseModel):
    script_text: str
    action: Literal["improve", "shorten", "expand", "change_tone", "translate", "split_scenes"]
    language: str = "english"
    tone: Optional[str] = None
    target_duration_sec: Optional[int] = None
    target_language: Optional[str] = None
    scene_count: int = 6


# ---------- AD COPY / CAMPAIGN ----------
class AdCopyRequest(BaseModel):
    topic: str
    brand_name: Optional[str] = None
    hook: Optional[str] = None
    body: Optional[str] = None
    cta: Optional[str] = None
    platforms: List[str] = ["meta", "google", "youtube", "tiktok", "linkedin"]
    language: str = "english"
    tone: str = "professional"
    length: Literal["short", "medium", "long"] = "medium"


class MultiCreativeRequest(BaseModel):
    project_id: Optional[str] = None
    topic: str
    language: str = "english"
    video_type: str = "cinematic_ad"
    count: Literal[1, 3, 5, 10, 20] = 5
    tone: str = "professional"
    duration_sec: int = 30
    brand_name: Optional[str] = None


class CampaignRequest(BaseModel):
    project_id: Optional[str] = None
    topic: str
    hook: Optional[str] = None
    body: Optional[str] = None
    cta: Optional[str] = None
    language: str = "english"
    platforms: List[str] = ["instagram_reel", "facebook_ad", "youtube_short", "youtube_ad",
                             "tiktok", "linkedin_ad", "snapchat", "x"]


class CreativeScoreRequest(BaseModel):
    hook: str
    body: Optional[str] = None
    cta: Optional[str] = None
    platform: str = "meta"
    language: str = "english"


class ComplianceRequest(BaseModel):
    text: str
    platform: str = "meta"
    language: str = "english"


class MultiPlatformResizeRequest(BaseModel):
    project_id: str
    aspect_ratios: List[str] = ["9:16", "16:9", "1:1", "4:5"]


class CreditsEstimateRequest(BaseModel):
    action: str  # script | variants | tts | scene_image | storyboard | render | multi_creative | ad_copy | campaign | video_clip
    count: int = 1
    duration_sec: int = 30


# ---------- MEDIA / STT ----------
class STTRequest(BaseModel):
    audio_url: str  # must be a /api/files/audio/... path served by our backend
    language: str = "auto"


# ---------- AVATARS ----------
class Avatar(BaseModel):
    avatar_id: str = Field(default_factory=lambda: new_id("av"))
    user_id: str
    name: str
    image_url: str
    source: Literal["generated", "uploaded"] = "generated"
    prompt: Optional[str] = None
    style: str = "presenter"    # presenter, ugc, corporate, influencer, cinematic
    gender: Optional[str] = None  # male, female, non_binary
    age_range: Optional[str] = None
    provider: str = "nano_banana"
    created_at: datetime = Field(default_factory=utc_now)


class AvatarGenerateRequest(BaseModel):
    name: str
    prompt: str
    style: str = "presenter"
    gender: Optional[str] = None
    age_range: Optional[str] = None


class LipSyncRequest(BaseModel):
    project_id: str
    avatar_id: str
    provider: Optional[str] = None  # heygen | did — auto-detects if None


# ---------- PROJECT VERSION SNAPSHOT ----------
class ProjectVersion(BaseModel):
    version_id: str = Field(default_factory=lambda: new_id("ver"))
    project_id: str
    user_id: str
    label: str = "Snapshot"
    snapshot: dict  # {script, scenes, audio_url, thumbnail, duration_sec}
    created_at: datetime = Field(default_factory=utc_now)


# ---------- UNIVERSAL VOICE-QUALITY SYSTEM ----------
class PronunciationCheckRequest(BaseModel):
    text: str
    language: str = "english"
    known_names: List[str] = []  # brand / product / people names user has defined


class FeedbackRequest(BaseModel):
    project_id: str
    tags: List[str] = []       # e.g. ["accent_wrong","too_fast","hook_weak"]
    free_text: Optional[str] = None
    context: Literal["voice", "video", "ad", "general"] = "general"


class CommercialCheckRequest(BaseModel):
    project_id: str


class VoiceTuning(BaseModel):
    """Optional voice-tuning inputs that can be attached to a TTS request."""
    stability: float = 0.55
    similarity_boost: float = 0.75
    style: float = 0.30
    speed: float = 1.0  # 0.7..1.2
    accent_lock: bool = False
