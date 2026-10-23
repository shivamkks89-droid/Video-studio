"""Admin key settings: switch voice/AI provider keys at runtime (persisted in Mongo, no redeploy)."""
import os
import sys
import time
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

MANAGED = {
    "ELEVENLABS_API_KEY": {"label": "ElevenLabs (voices & clone)", "modules": {"ai_services": "ELEVEN_KEY"}},
    "FAL_KEY": {"label": "fal.ai (lip-sync & video)", "modules": {}},
    "EMERGENT_LLM_KEY": {"label": "Emergent LLM key (scripts, TTS, images)",
                         "modules": {"ai_services": "EMERGENT_KEY", "openai_tts": "EMERGENT_KEY",
                                     "stt_service": "EMERGENT_KEY"}},
}
_ENV_DEFAULTS = {k: os.environ.get(k, "") for k in MANAGED}
_quota_cache = {"at": 0.0, "data": None}


def _apply(name: str, value: str):
    os.environ[name] = value
    for mod, attr in MANAGED[name]["modules"].items():
        if mod in sys.modules:
            setattr(sys.modules[mod], attr, value)
    if name == "ELEVENLABS_API_KEY":
        _quota_cache["at"] = 0.0


async def load_key_overrides(db):
    async for doc in db.app_keys.find({}, {"_id": 0}):
        if doc.get("name") in MANAGED and doc.get("value"):
            _apply(doc["name"], doc["value"])


def _mask(v: str) -> str:
    return f"••••{v[-4:]}" if v and len(v) > 8 else ("set" if v else "")


def _test(name: str, value: str) -> dict:
    try:
        if name == "ELEVENLABS_API_KEY":
            r = requests.get("https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": value}, timeout=15)
            return {"ok": r.ok, "detail": f"{len(r.json().get('voices', []))} voices" if r.ok else r.text[:120]}
        if name == "FAL_KEY":
            r = requests.get("https://api.fal.ai/v1/models?limit=1", headers={"Authorization": f"Key {value}"}, timeout=15)
            return {"ok": r.status_code != 401, "detail": "reachable" if r.status_code != 401 else "unauthorized"}
        return {"ok": bool(value), "detail": "saved (tested on next generation)"}
    except Exception as e:
        return {"ok": False, "detail": str(e)[:120]}


def eleven_quota() -> dict:
    if time.time() - _quota_cache["at"] < 60 and _quota_cache["data"]:
        return _quota_cache["data"]
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        data = {"available": False, "reason": "ElevenLabs key not set"}
    else:
        try:
            r = requests.get("https://api.elevenlabs.io/v1/user/subscription", headers={"xi-api-key": key}, timeout=15)
            if r.ok:
                j = r.json()
                used, limit = j.get("character_count", 0), j.get("character_limit", 0)
                data = {"available": True, "used": used, "limit": limit, "remaining": max(0, limit - used),
                        "tier": j.get("tier"), "resets_at": j.get("next_character_count_reset_unix")}
            elif "user_read" in r.text:
                data = {"available": False, "reason": "Key me 'User → Read' permission on karo (ElevenLabs → API keys)"}
            else:
                data = {"available": False, "reason": "ElevenLabs key invalid"}
        except Exception:
            data = {"available": False, "reason": "ElevenLabs unreachable"}
    _quota_cache.update(at=time.time(), data=data)
    return data


class KeyUpdate(BaseModel):
    name: str
    value: str = ""


def build_keys_router(db, require_admin, current_user):
    router = APIRouter()

    async def _log(name, action, masked, by):
        await db.app_key_log.insert_one({"name": name, "label": MANAGED[name]["label"], "action": action,
                                         "masked": masked, "by": by,
                                         "at": datetime.now(timezone.utc).isoformat()})

    @router.get("/admin/keys/log")
    async def key_log(request: Request):
        await require_admin(request)
        return await db.app_key_log.find({}, {"_id": 0}).sort("at", -1).to_list(50)

    @router.get("/admin/keys")
    async def list_keys(request: Request):
        await require_admin(request)
        saved = {d["name"]: d async for d in db.app_keys.find({}, {"_id": 0})}
        return [{"name": k, "label": m["label"], "masked": _mask(os.environ.get(k, "")),
                 "source": "admin" if saved.get(k, {}).get("value") else ("deploy" if _ENV_DEFAULTS[k] else "none"),
                 "updated_at": saved.get(k, {}).get("updated_at")} for k, m in MANAGED.items()]

    @router.put("/admin/keys")
    async def set_key(body: KeyUpdate, request: Request):
        admin = await require_admin(request)
        if body.name not in MANAGED:
            raise HTTPException(status_code=400, detail="Unknown key")
        value = body.value.strip()
        if value:
            result = _test(body.name, value)
            if not result["ok"]:
                raise HTTPException(status_code=400, detail=f"Key test failed: {result['detail']}")
            await db.app_keys.update_one({"name": body.name}, {"$set": {
                "name": body.name, "value": value, "updated_by": admin.email,
                "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
            _apply(body.name, value)
            await _log(body.name, "changed", _mask(value), admin.email)
            return {"ok": True, "masked": _mask(value), "detail": result["detail"]}
        await db.app_keys.delete_one({"name": body.name})
        _apply(body.name, _ENV_DEFAULTS[body.name])
        await _log(body.name, "reverted", _mask(_ENV_DEFAULTS[body.name]), admin.email)
        return {"ok": True, "masked": _mask(_ENV_DEFAULTS[body.name]), "detail": "reverted to deploy key"}

    @router.get("/voice/quota")
    async def voice_quota(request: Request):
        await current_user(request)
        import asyncio
        return await asyncio.to_thread(eleven_quota)

    return router
