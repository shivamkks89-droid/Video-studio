import asyncio
import json
import logging
import os
from typing import Optional

import firebase_admin
from firebase_admin import auth as fb_auth, credentials, db as rtdb, messaging, storage

_app = None


def app():
    global _app
    if _app is None:
        raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not raw:
            return None
        _app = firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)),
                                             {"storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET"),
                                              "databaseURL": os.environ.get("FIREBASE_DATABASE_URL")})
    return _app


def verify_id_token(token: str) -> dict:
    if not app():
        raise RuntimeError("Firebase not configured")
    return fb_auth.verify_id_token(token, app=_app)


async def send_push(tokens: list, title: str, body: str, data: Optional[dict] = None) -> list:
    """Returns tokens that are no longer valid."""
    if not tokens or not app():
        return []
    msg = messaging.MulticastMessage(tokens=tokens, notification=messaging.Notification(title=title, body=body),
                                     data={k: str(v) for k, v in (data or {}).items()},
                                     android=messaging.AndroidConfig(priority="high"))
    try:
        res = await asyncio.to_thread(messaging.send_each_for_multicast, msg, app=_app)
        return [t for t, r in zip(tokens, res.responses) if not r.success and
                type(r.exception).__name__ in ("UnregisteredError", "SenderIdMismatchError")]
    except Exception as e:
        logging.warning(f"push failed: {e}")
        return []


def storage_on() -> bool:
    return bool(app() and os.environ.get("FIREBASE_STORAGE_BUCKET"))


async def upload(path: str, raw: bytes, mime: str) -> bool:
    try:
        await asyncio.to_thread(lambda: storage.bucket(app=_app).blob(path).upload_from_string(raw, content_type=mime))
        return True
    except Exception as e:
        logging.warning(f"firebase upload failed {path}: {e}")
        return False


async def download(path: str) -> Optional[bytes]:
    try:
        return await asyncio.to_thread(lambda: storage.bucket(app=_app).blob(path).download_as_bytes())
    except Exception:
        return None


def custom_token(user_id: str) -> str:
    return fb_auth.create_custom_token(user_id, app=app()).decode()


async def live_set(path: str, value) -> None:
    if not (app() and os.environ.get("FIREBASE_DATABASE_URL")):
        return
    try:
        await asyncio.to_thread(lambda: rtdb.reference(path, app=_app).set(value))
    except Exception as e:
        logging.warning(f"rtdb write failed {path}: {e}")
