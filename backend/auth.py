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


async def get_session_data_from_emergent(session_id: str) -> Optional[dict]:
    """Call Emergent auth /session-data with the session_id."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
            )
            if r.status_code == 200:
                return r.json()
            return None
    except Exception as e:
        print(f"[Emergent auth error] {e}")
        return None


async def get_current_user(request: Request, db) -> User:
    """Resolve current user from cookie session_token (Emergent auth) OR Authorization Bearer (JWT or session_token)."""
    # 1. session cookie (Emergent OAuth)
    session_token = request.cookies.get("session_token")
    # 2. Authorization header
    auth_header = request.headers.get("Authorization", "")
    bearer = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else ""

    user_id: Optional[str] = None

    # Try session_token from cookie first
    if session_token:
        user_id = await _user_id_from_session(session_token, db)

    # Fallback: bearer might be session_token
    if not user_id and bearer:
        user_id = await _user_id_from_session(bearer, db)

    # Fallback: bearer is JWT
    if not user_id and bearer:
        user_id = decode_jwt(bearer)

    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user_doc)


async def _user_id_from_session(token: str, db) -> Optional[str]:
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    return sess.get("user_id")


async def require_admin(request: Request, db) -> User:
    user = await get_current_user(request, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
