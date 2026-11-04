import uuid
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
        if n > MAX_ACCOUNTS_PER_SOURCE:
            await alert(db, f"multi_account_{label.lower()}", user_id, f"{n} accounts from the same {label} ({val})")


async def on_render(db, user_id: str):
    n, mins = RENDER_BURST
    since = (_now() - timedelta(minutes=mins)).isoformat()
    c = await db.render_jobs.count_documents({"user_id": user_id, "created_at": {"$gte": since}})
    if c >= n:
        await alert(db, "credit_burst", user_id, f"{c} renders in {mins} minutes", dedupe_hours=1)
