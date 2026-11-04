"""Razorpay one-time plan checkout: order → Checkout → signature verify (+ optional webhook). Credits only after verification."""
import os
from datetime import datetime, timedelta, timezone

import razorpay
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from models import CreditTransaction


def _client():
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))


class OrderReq(BaseModel):
    plan: str


class VerifyReq(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


import fraud  # noqa: E402


def build_razorpay_router(db, current_user, plans):
    router = APIRouter()

    async def _grant(order_id: str, payment_id: str) -> dict:
        now = datetime.now(timezone.utc)
        # Atomic status flip = idempotent: verify + webhook can both arrive, credits granted once.
        pay = await db.payments.find_one_and_update(
            {"order_id": order_id, "status": "created"},
            {"$set": {"status": "paid", "payment_id": payment_id, "paid_at": now.isoformat()}})
        if not pay:
            existing = await db.payments.find_one({"order_id": order_id}, {"_id": 0})
            if existing and existing.get("status") == "paid":
                return {"ok": True, "already": True, "plan": existing["plan"]}
            raise HTTPException(status_code=404, detail="Order not found")
        plan = next(p for p in plans if p["id"] == pay["plan"])
        await db.users.update_one({"user_id": pay["user_id"]}, {
            "$inc": {"credits": plan["credits"]},
            "$set": {"plan": plan["id"], "plan_expires_at": (now + timedelta(days=30)).isoformat()}})
        txn = CreditTransaction(user_id=pay["user_id"], delta=plan["credits"], reason=f"razorpay_{plan['id']}").model_dump()
        txn["created_at"] = txn["created_at"].isoformat()
        await db.credit_transactions.insert_one(txn)
        return {"ok": True, "plan": plan["id"], "credits_added": plan["credits"]}

    @router.post("/billing/razorpay/order")
    async def create_order(body: OrderReq, request: Request):
        user = await current_user(request)
        plan = next((p for p in plans if p["id"] == body.plan and p.get("price_inr", 0) > 0), None)
        if not plan:
            raise HTTPException(status_code=400, detail="Invalid plan")
        amount = int(plan["price_inr"] * 100)
        try:
            order = _client().order.create({"amount": amount, "currency": "INR",
                                             "receipt": f"{user.user_id[-12:]}-{plan['id']}"[:40],
                                             "notes": {"user_id": user.user_id, "plan": plan["id"]}})
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Razorpay error: {str(e)[:120]}")
        await db.payments.insert_one({"order_id": order["id"], "user_id": user.user_id, "plan": plan["id"],
                                      "amount": amount, "currency": "INR", "status": "created",
                                      "created_at": datetime.now(timezone.utc).isoformat()})
        return {"order_id": order["id"], "amount": amount, "currency": "INR", "key_id": os.environ["RAZORPAY_KEY_ID"],
                "plan_name": plan["name"], "name": user.name, "email": user.email}

    @router.post("/billing/razorpay/verify")
    async def verify(body: VerifyReq, request: Request):
        user = await current_user(request)
        pay = await db.payments.find_one({"order_id": body.razorpay_order_id, "user_id": user.user_id})
        if not pay:
            raise HTTPException(status_code=404, detail="Order not found")
        try:
            _client().utility.verify_payment_signature({
                "razorpay_order_id": body.razorpay_order_id, "razorpay_payment_id": body.razorpay_payment_id,
                "razorpay_signature": body.razorpay_signature})
        except Exception:
            await fraud.alert(db, "payment_bad_signature", user.user_id, f"Invalid signature for order {body.razorpay_order_id}")
            raise HTTPException(status_code=400, detail="Payment verification failed")
        reused = await db.payments.find_one({"payment_id": body.razorpay_payment_id, "order_id": {"$ne": body.razorpay_order_id}})
        if reused:
            await fraud.alert(db, "payment_reuse", user.user_id, f"Payment {body.razorpay_payment_id} reused for a second order")
            raise HTTPException(status_code=400, detail="Payment already used")
        try:
            rp = _client().payment.fetch(body.razorpay_payment_id)
        except Exception:
            rp = None
        if rp and (int(rp.get("amount", 0)) != int(pay["amount"]) or rp.get("order_id") != body.razorpay_order_id):
            await fraud.alert(db, "payment_mismatch", user.user_id,
                              f"Paid {rp.get('amount')} for order of {pay['amount']} (order {body.razorpay_order_id})")
            raise HTTPException(status_code=400, detail="Payment amount mismatch")
        return await _grant(body.razorpay_order_id, body.razorpay_payment_id)

    @router.post("/billing/razorpay/webhook")
    async def webhook(request: Request):
        secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET")
        if not secret:
            raise HTTPException(status_code=503, detail="Webhook not configured")
        raw = (await request.body()).decode()
        try:
            _client().utility.verify_webhook_signature(raw, request.headers.get("X-Razorpay-Signature", ""), secret)
        except Exception:
            raise HTTPException(status_code=400, detail="Bad signature")
        import json
        evt = json.loads(raw)
        if evt.get("event") in ("payment.captured", "order.paid"):
            ent = evt["payload"]["payment"]["entity"]
            try:
                await _grant(ent["order_id"], ent["id"])
            except HTTPException:
                pass
        return {"ok": True}

    @router.get("/billing/payments")
    async def my_payments(request: Request):
        user = await current_user(request)
        return await db.payments.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(50)

    return router
