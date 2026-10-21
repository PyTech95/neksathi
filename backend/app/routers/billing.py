from __future__ import annotations

from datetime import datetime, timedelta, timezone
import stripe
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.config import STRIPE_DRY_RUN
from app.db import db
from app.schemas import CheckoutIn, ConfirmIn, PlanOut
from app.security import current_user
from app.utils import clean, new_id, now_utc, plan_out

router = APIRouter()


@router.get("/plans", response_model=List[PlanOut])
async def list_plans():
    items = []
    async for p in db.plans.find({"active": True}).sort("price_cents", 1):
        items.append(plan_out(clean(p)))
    return items


@router.get("/subscriptions/me")
async def my_subscription(user: dict = Depends(current_user)):
    sub = await db.subscriptions.find_one(
        {"user_id": user["id"], "status": {"$in": ["active", "pending"]}},
        sort=[("created_at", -1)],
    )
    if not sub:
        return {"subscription": None}
    plan = await db.plans.find_one({"code": sub["plan_code"]})
    return {
        "subscription": {
            "id": sub["id"],
            "plan_code": sub["plan_code"],
            "plan_name": plan["name"] if plan else sub["plan_code"],
            "status": sub["status"],
            "current_period_end": sub.get("current_period_end"),
            "stripe_session_id": sub.get("stripe_session_id"),
            "stripe_subscription_id": sub.get("stripe_subscription_id"),
            "created_at": sub["created_at"],
        }
    }


@router.post("/subscriptions/checkout-session")
async def create_checkout(payload: CheckoutIn, user: dict = Depends(current_user)):
    plan = await db.plans.find_one({"code": payload.plan_code, "active": True})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Create a pending subscription record up-front so the confirm flow is
    # idempotent and traceable.
    sub_id = new_id()
    session_id = f"cs_dry_{new_id().replace('-', '')[:20]}" if STRIPE_DRY_RUN else None
    sub_doc = {
        "id": sub_id,
        "user_id": user["id"],
        "plan_code": plan["code"],
        "status": "pending",
        "stripe_session_id": session_id,
        "created_at": now_utc(),
    }

    if STRIPE_DRY_RUN:
        # DRY-RUN: skip real Stripe and expose a preview URL that the frontend
        # knows to interpret ("return with success=1 immediately"). The check-out
        # UX flow (button → open URL → confirm) stays identical to production.
        url = f"safeqr-dry-run://checkout?session_id={session_id}&plan={plan['code']}"
        sub_doc["stripe_session_id"] = session_id
        sub_doc["dry_run"] = True
    else:
        return_url = payload.return_url or "https://example.com/subscription/return"
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{
                "price_data": {
                    "currency": plan.get("currency", "inr").lower(),
                    "product_data": {"name": plan["name"]},
                    "unit_amount": plan["price_cents"],
                    "recurring": {"interval": plan.get("interval", "month")},
                },
                "quantity": 1,
            }],
            success_url=f"{return_url}?session_id={{CHECKOUT_SESSION_ID}}&status=success",
            cancel_url=f"{return_url}?session_id={{CHECKOUT_SESSION_ID}}&status=cancel",
            client_reference_id=user["id"],
            metadata={"user_id": user["id"], "plan_code": plan["code"]},
        )
        url = session.url
        session_id = session.id
        sub_doc["stripe_session_id"] = session_id

    await db.subscriptions.insert_one(dict(sub_doc))
    return {
        "url": url,
        "session_id": session_id,
        "dry_run": STRIPE_DRY_RUN,
        "plan_code": plan["code"],
        "plan_name": plan["name"],
        "price_cents": plan["price_cents"],
        "currency": plan.get("currency", "INR"),
    }


@router.post("/subscriptions/confirm")
async def confirm_subscription(payload: ConfirmIn, user: dict = Depends(current_user)):
    sub = await db.subscriptions.find_one({
        "stripe_session_id": payload.session_id,
        "user_id": user["id"],
    })
    if not sub:
        raise HTTPException(status_code=404, detail="Session not found")

    if sub["status"] == "active":
        # Idempotent: already confirmed
        return {"ok": True, "already_active": True, "status": "active", "plan_code": sub["plan_code"]}

    if STRIPE_DRY_RUN:
        period_end = now_utc() + timedelta(days=30 if sub["plan_code"].endswith("month") or sub["plan_code"] == "basic" else 365)
        await db.subscriptions.update_one(
            {"id": sub["id"]},
            {"$set": {
                "status": "active",
                "current_period_end": period_end,
                "activated_at": now_utc(),
            }},
        )
        return {"ok": True, "dry_run": True, "status": "active", "plan_code": sub["plan_code"]}

    session = stripe.checkout.Session.retrieve(payload.session_id)
    if session.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail=f"Session not paid: {session.get('payment_status')}")

    stripe_sub_id = session.get("subscription")
    period_end = None
    if stripe_sub_id:
        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
        item = stripe_sub["items"]["data"][0]
        period_end = datetime.fromtimestamp(item["current_period_end"], tz=timezone.utc)

    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {
            "status": "active",
            "current_period_end": period_end,
            "stripe_subscription_id": stripe_sub_id,
            "activated_at": now_utc(),
        }},
    )
    return {"ok": True, "status": "active", "plan_code": sub["plan_code"]}
