"""Authentication module: JWT email/password + Email OTP + Emergent Google Auth."""
import os
import random
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
import httpx
from fastapi import HTTPException, Request, Depends, Response

from models import User, utc_now

JWT_SECRET = os.environ.get("JWT_SECRET", "cinereel-dev-secret-change-me")
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 7


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def issue_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_jwt(token: str) -> Optional[str]:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return data.get("user_id")
    except Exception:
        return None


def gen_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def gen_user_id() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


async def send_otp_email(email: str, code: str) -> bool:
    """Send OTP via Resend. Returns True on success, False otherwise (still printed to logs)."""
    api_key = os.environ.get("RESEND_API_KEY")
    print(f"[OTP] {email} -> {code}")  # always log for dev/testing
    if not api_key:
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": "CineReel AI <onboarding@resend.dev>",
                    "to": [email],
                    "subject": f"Your CineReel AI code: {code}",
                    "html": f"""
                    <div style="font-family:Manrope,sans-serif;background:#0A0A0B;color:#fff;padding:32px;border-radius:12px;max-width:480px;margin:auto">
                      <h2 style="color:#E2FF3D;letter-spacing:-0.02em">CineReel AI</h2>
                      <p style="color:#A1A1AA">Your one-time verification code is</p>
                      <div style="font-size:36px;font-weight:700;letter-spacing:8px;background:#141416;border:1px solid rgba(255,255,255,.1);padding:20px;border-radius:8px;text-align:center;margin:16px 0;color:#E2FF3D">{code}</div>
                      <p style="color:#52525B;font-size:12px">Expires in 10 minutes. If you didn't request this, ignore this email.</p>
                    </div>
                    """,
                },
            )
            return r.status_code in (200, 201, 202)
    except Exception as e:
        print(f"[OTP email error] {e}")
        return False


async def get_current_user(request: Request, db) -> User:
    auth_header = request.headers.get("Authorization", "")
    bearer = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""
    user_id: Optional[str] = decode_jwt(bearer) if bearer else None

    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    await _auto_downgrade(db, user_doc)
    if user_doc.get("blocked"):
        raise HTTPException(status_code=403, detail="Account suspend kar diya gaya hai. Support se sampark karein.")
    if user_doc.get("delete_after"):
        await db.users.update_one({"user_id": user_id}, {"$unset": {"delete_after": ""}})
    return User(**user_doc)


async def _auto_downgrade(db, user_doc: dict):
    """Expired paid plan → Free. Projects, assets and remaining credits are untouched."""
    exp = user_doc.get("plan_expires_at")
    if user_doc.get("plan", "free") == "free" or not exp or user_doc.get("role") == "admin" \
            or user_doc.get("unlimited_credits"):
        return
    if exp > datetime.now(timezone.utc).isoformat():
        return
    res = await db.users.update_one({"user_id": user_doc["user_id"], "plan_expires_at": exp},
                                    {"$set": {"plan": "free", "previous_plan": user_doc["plan"],
                                              "downgraded_at": datetime.now(timezone.utc).isoformat()}})
    if res.modified_count:
        user_doc["previous_plan"], user_doc["plan"] = user_doc["plan"], "free"


async def require_admin(request: Request, db) -> User:
    user = await get_current_user(request, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
