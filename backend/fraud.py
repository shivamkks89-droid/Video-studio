import logging
import os
import uuid

import httpx
from datetime import datetime, timedelta, timezone

from fastapi import Request

DISPOSABLE = {
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
    "trashmail.com", "getnada.com", "sharklasers.com", "dispostable.com", "maildrop.cc", "throwawaymail.com",
    "fakeinbox.com", "mintemail.com", "emailondeck.com", "mohmal.com", "tempail.com", "moakt.com",
    "burnermail.io", "33mail.com", "spamgourmet.com", "mailnesia.com", "tempr.email", "discard.email",
    "mail.tm", "emailfake.com", "1secmail.com", "tmpmail.org", "minuteinbox.com", "inboxkitten.com",
}
MAX_ACCOUNTS_PER_SOURCE = 3
RENDER_BURST = (6, 10)  # renders, minutes


def client_ip(request: Request) -> str:
    h = request.headers
    return (h.get("cf-connecting-ip") or h.get("x-forwarded-for", "").split(",")[0] or
            (request.client.host if request.client else "")).strip()


def _now():
    return datetime.now(timezone.utc)


async def alert(db, kind: str, user_id: str, detail: str, dedupe_hours: int = 6):
    since = (_now() - timedelta(hours=dedupe_hours)).isoformat()
    if await db.fraud_alerts.find_one({"kind": kind, "user_id": user_id, "created_at": {"$gte": since}}):
        return
    await db.fraud_alerts.insert_one({"alert_id": f"fa_{uuid.uuid4().hex[:12]}", "kind": kind, "user_id": user_id,
                                      "detail": detail, "status": "open", "created_at": _now().isoformat()})
    cfg = await settings(db)
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1}) or {}
    await _email(cfg["alert_email"], f"Fraud alert: {kind}", f"<p><b>{kind}</b> — {u.get('email', user_id)}</p><p>{detail}</p>"
                 "<p>Admin panel → Fraud alerts me Block / Resolve karein.</p>")


DEFAULTS = {"alert_email": "Shivamkks986@gmail.com", "auto_block": False, "auto_block_accounts": 5}


async def settings(db) -> dict:
    doc = await db.admin_settings.find_one({"key": "fraud"}, {"_id": 0}) or {}
    return {k: doc.get(k, v) for k, v in DEFAULTS.items()}


async def _email(to: str, subject: str, html: str):
    key = os.environ.get("RESEND_API_KEY")
    if not (key and to):
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post("https://api.resend.com/emails", headers={"Authorization": f"Bearer {key}"},
                             json={"from": "CineReel AI <onboarding@resend.dev>", "to": [to], "subject": subject, "html": html})
            if r.status_code >= 300:
                logging.warning(f"fraud email failed {r.status_code}: {r.text[:120]}")
            return r.status_code < 300
    except Exception as e:
        logging.warning(f"fraud email error: {e}")
        return False


async def on_signup(db, request: Request, user_id: str, email: str):
    ip, dev = client_ip(request), (request.headers.get("x-device-id") or "")[:64]
    await db.users.update_one({"user_id": user_id}, {"$set": {"signup_ip": ip, "signup_device": dev}})
    domain = email.split("@")[-1].lower()
    if domain in DISPOSABLE:
        await alert(db, "disposable_email", user_id, f"Signup with disposable email domain {domain}")
    for field, val, label in (("signup_device", dev, "device"), ("signup_ip", ip, "IP")):
        if not val:
            continue
        n = await db.users.count_documents({field: val})
        cfg = await settings(db)
        auto = field == "signup_device" and cfg["auto_block"] and n >= int(cfg["auto_block_accounts"])
        if n > MAX_ACCOUNTS_PER_SOURCE or auto:
            if auto:
                await db.users.update_one({"user_id": user_id}, {"$set": {"blocked": True}})
            await alert(db, f"multi_account_{label.lower()}", user_id,
                        f"{n} accounts from the same {label} ({val})" + (" — AUTO-BLOCKED" if auto else ""))


async def on_render(db, user_id: str):
    n, mins = RENDER_BURST
    since = (_now() - timedelta(minutes=mins)).isoformat()
    c = await db.render_jobs.count_documents({"user_id": user_id, "created_at": {"$gte": since}})
    if c >= n:
        await alert(db, "credit_burst", user_id, f"{c} renders in {mins} minutes", dedupe_hours=1)
