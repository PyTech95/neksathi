"""Nek Sathi commerce layer — QR orders (vehicles AND tags), Razorpay,
delivery tracking, plan activation / expiry / recharge, admin sticker
download/print, vendor scan-&-assign (OTP), per-vendor dashboard and the
admin tag-plan catalogue.

Self-contained: it registers its routes on server.py's `api` router. Razorpay
runs in DRY-RUN automatically when no keys are set, so the entire journey works
locally with no keys / no network. Add keys (env or admin panel) to go live.
"""
from __future__ import annotations

import hashlib
import hmac
import io
import json as _json
import math
import os
import random as _random
from datetime import timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.db import db
from app.security import current_user, require_admin, require_dealer
from app.utils import new_id, now_utc
from app.services import comms
from app.services import sticker

router = APIRouter()

GRACE_DAYS = 3
OTP_TTL_MIN = 10
ORDER_FLOW = ["pending_payment", "paid", "generating", "printed",
              "shipped", "out_for_delivery", "delivered"]
# statuses from which the admin can download / print the physical sticker
STICKER_READY = {"printed", "shipped", "out_for_delivery", "delivered"}
TAG_TYPES = ["person", "kid", "patient", "staff", "pet", "bag",
             "luggage", "keys", "phone", "laptop", "door", "other"]


# --------------------------------------------------------------------------- utils
def _aware(dt):
    if dt is not None and getattr(dt, "tzinfo", None) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _norm_phone(p: str) -> str:
    return (p or "").strip().replace(" ", "")


def _coll(product: str):
    """The collection that owns the plan for a product type."""
    return db.tags if product == "tag" else db.vehicles


def _order_target(o: dict):
    """(product_type, target_id) for an order document."""
    product = o.get("product_type", "vehicle")
    tid = o.get("tag_id") if product == "tag" else o.get("vehicle_id")
    return product, tid


def _public_base(request: Optional[Request] = None) -> str:
    # Scan / tag / register links are WEBSITE (React) routes, so prefer the
    # website origin (FRONTEND_URL) over the API origin (PUBLIC_APP_URL). This
    # keeps freshly generated QR stickers pointing at the site, not the API host.
    base = (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_WEB_URL") or os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    if base:
        return base
    if request is not None:
        return str(request.base_url).rstrip("/")
    return ""


def _scan_url(product: str, qr_id: str, request: Optional[Request] = None) -> str:
    base = _public_base(request)
    path = "/t/" if product == "tag" else "/scan/"
    return f"{base}{path}{qr_id}"


async def _settings(key: str) -> dict:
    return (await db.app_settings.find_one({"_id": key})) or {}


async def rzp_cfg() -> dict:
    s = await _settings("razorpay")
    key_id = (s.get("key_id") or os.environ.get("RAZORPAY_KEY_ID") or "").strip()
    key_secret = (s.get("key_secret") or os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
    webhook_secret = (s.get("webhook_secret") or os.environ.get("RAZORPAY_WEBHOOK_SECRET") or "").strip()
    enabled = bool(s.get("enabled", True))
    dry_run = (not (key_id and key_secret)) or (not enabled)
    return {"key_id": key_id, "key_secret": key_secret,
            "webhook_secret": webhook_secret, "enabled": enabled, "dry_run": dry_run}


async def _create_provider_order(amount_paise: int, receipt: str) -> dict:
    cfg = await rzp_cfg()
    if cfg["dry_run"]:
        return {"provider": "dry", "order_id": "order_dry_" + new_id().replace("-", "")[:16],
                "dry_run": True, "key_id": None}
    try:
        import razorpay  # shipped in requirements.txt; needed only in live mode
    except Exception:
        raise HTTPException(500, "Razorpay library not installed on server. Run: pip install razorpay")
    try:
        client = razorpay.Client(auth=(cfg["key_id"], cfg["key_secret"]))
        o = client.order.create({"amount": int(amount_paise), "currency": "INR",
                                  "receipt": receipt, "payment_capture": 1})
        return {"provider": "razorpay", "order_id": o["id"], "dry_run": False, "key_id": cfg["key_id"]}
    except Exception as e:
        raise HTTPException(502, f"Razorpay order failed (check your Key ID / Secret): {e}")


def _verify_sig(order_id, payment_id, signature, secret) -> bool:
    body = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


async def _unique_sticker_code() -> str:
    for _ in range(40):
        code = sticker.new_sticker_code()
        if not await db.qr_orders.find_one({"sticker_code": code}):
            return code
    return sticker.new_sticker_code()


# --------------------------------------------------------------------------- referral / tokens
import secrets as _secrets
import string as _string

TOKENS_PER_RUPEE = 10        # 10 tokens = Rs 1
REF_REWARD_REFERRER = 100    # tokens to the one who referred
REF_REWARD_REFERRED = 50     # tokens to the one who was referred


def _gen_ref_code() -> str:
    alpha = _string.ascii_uppercase + _string.digits
    return "".join(_secrets.choice(alpha) for _ in range(6))


async def _ensure_ref_code(user_id: str) -> dict:
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "User not found")
    if u.get("referral_code"):
        return u
    for _ in range(30):
        code = _gen_ref_code()
        if not await db.users.find_one({"referral_code": code}):
            await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
            u["referral_code"] = code
            return u
    return u


async def _reward_referral(buyer_id: str):
    """One-time: when a referred user makes their FIRST paid plan purchase,
    give 100 tokens to the referrer and 50 to the referred user."""
    buyer = await db.users.find_one({"id": buyer_id})
    if not buyer or not buyer.get("referred_by") or buyer.get("referral_rewarded"):
        return
    referrer_id = buyer["referred_by"]
    await db.users.update_one({"id": referrer_id}, {"$inc": {"tokens": REF_REWARD_REFERRER}})
    await db.users.update_one({"id": buyer_id},
                              {"$inc": {"tokens": REF_REWARD_REFERRED},
                               "$set": {"referral_rewarded": True, "referral_rewarded_at": now_utc()}})
    try:
        await db.token_ledger.insert_many([
            {"id": new_id(), "user_id": referrer_id, "delta": REF_REWARD_REFERRER,
             "reason": "referral_bonus_referrer", "ref_user": buyer_id, "created_at": now_utc()},
            {"id": new_id(), "user_id": buyer_id, "delta": REF_REWARD_REFERRED,
             "reason": "referral_bonus_referred", "ref_user": referrer_id, "created_at": now_utc()},
        ])
    except Exception:
        pass


async def _plan_price_with_tokens(user: dict, plan_price: int, use_tokens):
    """Return (final_amount_paise, tokens_used, discount_paise) applying a
    token discount (10 tokens = Rs 1), capped to the plan price and balance."""
    bal = int((await db.users.find_one({"id": user["id"]}) or {}).get("tokens") or 0)
    want = max(0, min(int(use_tokens or 0), bal))
    discount = min((want // TOKENS_PER_RUPEE) * 100, int(plan_price))
    tokens_used = (discount // 100) * TOKENS_PER_RUPEE
    return int(plan_price) - discount, tokens_used, discount


async def _spend_tokens(user_id: str, tokens_used: int):
    if tokens_used and tokens_used > 0:
        await db.users.update_one({"id": user_id}, {"$inc": {"tokens": -int(tokens_used)}})
        try:
            await db.token_ledger.insert_one({"id": new_id(), "user_id": user_id,
                                              "delta": -int(tokens_used), "reason": "redeemed_discount",
                                              "created_at": now_utc()})
        except Exception:
            pass


# --------------------------------------------------------------------------- plans
async def _get_plan(plan_id=None, plan_code=None) -> dict:
    if plan_id:
        q = {"id": plan_id}
    elif plan_code:
        q = {"code": plan_code}
    else:
        raise HTTPException(400, "plan_id or plan_code required")
    p = await db.plans.find_one(q)
    if not p:
        raise HTTPException(404, "Plan not found")
    return p


async def _get_tag_plan(plan_id=None) -> dict:
    if not plan_id:
        raise HTTPException(400, "plan_id required")
    p = await db.tag_plans.find_one({"id": plan_id})
    if not p:
        raise HTTPException(404, "Tag plan not found")
    return p


def plan_validity(p: dict) -> int:
    return int(p.get("validity_days") or (365 if p.get("interval") == "year" else 30))


def plan_state(doc: dict) -> dict:
    exp = _aware((doc or {}).get("plan_expires_at"))
    name = (doc or {}).get("plan_name")
    if not exp:
        return {"status": "none", "days_left": 0, "expires_at": None, "plan_name": name}
    now = now_utc()
    secs = (exp - now).total_seconds()
    if secs >= 0:
        return {"status": "active", "days_left": max(0, math.ceil(secs / 86400)),
                "expires_at": exp.isoformat(), "plan_name": name}
    if (exp + timedelta(days=GRACE_DAYS) - now).total_seconds() >= 0:
        return {"status": "grace", "days_left": 0, "expires_at": exp.isoformat(), "plan_name": name}
    return {"status": "expired", "days_left": 0, "expires_at": exp.isoformat(), "plan_name": name}


async def _activate_plan(target_id: str, plan: dict, start=None, product: str = "vehicle"):
    start = start or now_utc()
    vdays = plan_validity(plan)
    expires = start + timedelta(days=vdays)
    await _coll(product).update_one({"id": target_id}, {"$set": {
        "plan_code": plan.get("code"), "plan_name": plan.get("name"),
        "plan_validity_days": vdays, "plan_activated_at": start,
        "plan_expires_at": expires, "plan_status": "active",
    }})
    return expires


async def _extend_plan(doc: dict, plan: dict, product: str = "vehicle"):
    now = now_utc()
    cur = _aware(doc.get("plan_expires_at"))
    base = cur if (cur and cur > now) else now
    vdays = plan_validity(plan)
    expires = base + timedelta(days=vdays)
    await _coll(product).update_one({"id": doc["id"]}, {"$set": {
        "plan_code": plan.get("code"), "plan_name": plan.get("name"),
        "plan_validity_days": vdays, "plan_expires_at": expires, "plan_status": "active",
        "plan_activated_at": doc.get("plan_activated_at") or now,
    }})
    return expires


# --------------------------------------------------------------------------- OTP (reuses comms + db.otp_codes)
async def _otp_send(phone: str) -> dict:
    code = f"{_random.randint(0, 999999):06d}"
    store = {"phone": phone, "code": code,
             "expires_at": now_utc() + timedelta(minutes=OTP_TTL_MIN), "created_at": now_utc()}
    try:
        if comms.whatsapp_otp_live():
            await db.otp_codes.update_one({"phone": phone}, {"$set": store}, upsert=True)
            await comms.send_whatsapp_otp(phone, code)
            return {"channel": "whatsapp", "dev_code": None}
        if comms.otp_live():
            await comms.send_otp(phone)
            return {"channel": "sms", "dev_code": None}
    except Exception:
        pass  # fall back to mock so the flow never dead-ends
    await db.otp_codes.update_one({"phone": phone}, {"$set": store}, upsert=True)
    return {"channel": "mock", "dev_code": code}


async def _otp_check(phone: str, code: str) -> bool:
    try:
        if comms.otp_live() and not comms.whatsapp_otp_live():
            return await comms.verify_otp(phone, code)
    except Exception:
        return False
    row = await db.otp_codes.find_one({"phone": phone})
    if not row:
        return False
    return row.get("code") == code and _aware(row["expires_at"]) >= now_utc()


# =========================================================================== PAYMENTS
@router.get("/payments/config")
async def payments_config(user: dict = Depends(current_user)):
    cfg = await rzp_cfg()
    return {"provider": "razorpay", "dry_run": cfg["dry_run"], "key_id": cfg["key_id"] or None}


class AddressIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=20)
    line1: str = Field(min_length=1, max_length=160)
    line2: Optional[str] = Field(default=None, max_length=160)
    city: str = Field(min_length=1, max_length=80)
    pincode: str = Field(min_length=3, max_length=12)
    landmark: Optional[str] = Field(default=None, max_length=120)


class OrderCreateIn(BaseModel):
    vehicle_id: str
    plan_id: Optional[str] = None
    plan_code: Optional[str] = None
    address: AddressIn
    use_tokens: int = 0


async def _provider_for(amount_paise: int, receipt: str) -> dict:
    if int(amount_paise) <= 0:    # fully covered by tokens -> free, no gateway
        return {"provider": "free", "order_id": "free_" + new_id().replace("-", "")[:16],
                "dry_run": True, "key_id": None}
    return await _create_provider_order(amount_paise, receipt)


@router.post("/orders/create")
async def order_create(body: OrderCreateIn, user: dict = Depends(current_user)):
    if not user.get("phone_verified"):
        raise HTTPException(403, "Please verify your mobile number before ordering a QR")
    v = await db.vehicles.find_one({"id": body.vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(404, "Vehicle not found")
    plan = await _get_plan(body.plan_id, body.plan_code)
    base_amount = int(plan["price_cents"])
    amount, tokens_used, discount = await _plan_price_with_tokens(user, base_amount, body.use_tokens)
    oid = new_id()
    prov = await _provider_for(amount, receipt=oid[:20])
    doc = {
        "id": oid, "user_id": user["id"], "product_type": "vehicle",
        "vehicle_id": v["id"], "number_plate": v.get("number_plate"),
        "plan_id": plan["id"], "plan_code": plan["code"], "plan_name": plan["name"],
        "validity_days": plan_validity(plan), "amount_paise": amount, "base_amount_paise": base_amount,
        "tokens_used": tokens_used, "discount_paise": discount, "currency": "INR",
        "address": body.address.model_dump(), "status": "pending_payment",
        "provider": prov["provider"], "provider_order_id": prov["order_id"],
        "payment_id": None, "paid": False, "sticker_code": None,
        "timeline": [{"status": "pending_payment", "at": now_utc()}], "created_at": now_utc(),
    }
    await db.qr_orders.insert_one(dict(doc))
    return {"qr_order_id": oid, "provider_order_id": prov["order_id"], "amount_paise": amount,
            "base_amount_paise": base_amount, "tokens_used": tokens_used, "discount_paise": discount,
            "currency": "INR", "key_id": prov["key_id"], "dry_run": prov["dry_run"],
            "name": "Nek Sathi QR", "description": f'{plan["name"]} · {plan_validity(plan)} days',
            "prefill": {"name": body.address.name, "contact": body.address.phone}}


class TagOrderCreateIn(BaseModel):
    tag_id: str
    plan_id: str
    address: AddressIn
    use_tokens: int = 0


@router.post("/tag-orders/create")
async def tag_order_create(body: TagOrderCreateIn, user: dict = Depends(current_user)):
    if not user.get("phone_verified"):
        raise HTTPException(403, "Please verify your mobile number before ordering a QR")
    t = await db.tags.find_one({"id": body.tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(404, "Tag not found")
    plan = await _get_tag_plan(body.plan_id)
    base_amount = int(plan["price_cents"])
    amount, tokens_used, discount = await _plan_price_with_tokens(user, base_amount, body.use_tokens)
    oid = new_id()
    prov = await _provider_for(amount, receipt=oid[:20])
    doc = {
        "id": oid, "user_id": user["id"], "product_type": "tag",
        "tag_id": t["id"], "tag_type": t.get("tag_type"), "number_plate": t.get("name"),
        "plan_id": plan["id"], "plan_code": plan.get("code"), "plan_name": plan["name"],
        "validity_days": plan_validity(plan), "amount_paise": amount, "base_amount_paise": base_amount,
        "tokens_used": tokens_used, "discount_paise": discount, "currency": "INR",
        "address": body.address.model_dump(), "status": "pending_payment",
        "provider": prov["provider"], "provider_order_id": prov["order_id"],
        "payment_id": None, "paid": False, "sticker_code": None,
        "timeline": [{"status": "pending_payment", "at": now_utc()}], "created_at": now_utc(),
    }
    await db.qr_orders.insert_one(dict(doc))
    return {"qr_order_id": oid, "provider_order_id": prov["order_id"], "amount_paise": amount,
            "base_amount_paise": base_amount, "tokens_used": tokens_used, "discount_paise": discount,
            "currency": "INR", "key_id": prov["key_id"], "dry_run": prov["dry_run"],
            "name": "Nek Sathi QR Tag", "description": f'{plan["name"]} · {plan_validity(plan)} days',
            "prefill": {"name": body.address.name, "contact": body.address.phone}}


async def _mark_order_paid(order: dict, payment_id: str):
    tl = order.get("timeline", [])
    tl += [{"status": "paid", "at": now_utc()}, {"status": "generating", "at": now_utc()}]
    await db.qr_orders.update_one({"id": order["id"]}, {"$set": {
        "paid": True, "status": "generating", "payment_id": payment_id,
        "paid_at": now_utc(), "timeline": tl}})
    product, tid = _order_target(order)
    if tid:
        await _coll(product).update_one({"id": tid},
                                        {"$set": {"qr_ordered": True, "qr_order_id": order["id"]}})
    # spend any tokens redeemed on this order, then (one-time) reward referral
    await _spend_tokens(order["user_id"], order.get("tokens_used") or 0)
    await _reward_referral(order["user_id"])


class OrderVerifyIn(BaseModel):
    qr_order_id: str
    razorpay_payment_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_signature: Optional[str] = None


@router.post("/orders/verify")
async def order_verify(body: OrderVerifyIn, user: dict = Depends(current_user)):
    order = await db.qr_orders.find_one({"id": body.qr_order_id, "user_id": user["id"]})
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("paid"):
        return {"ok": True, "already": True, "status": order["status"]}
    cfg = await rzp_cfg()
    if not cfg["dry_run"]:
        if not _verify_sig(body.razorpay_order_id, body.razorpay_payment_id,
                           body.razorpay_signature, cfg["key_secret"]):
            raise HTTPException(400, "Payment verification failed")
    await _mark_order_paid(order, body.razorpay_payment_id or ("dry_" + new_id()[:8]))
    return {"ok": True, "status": "generating"}


@router.post("/payments/webhook")
async def payments_webhook(request: Request):
    cfg = await rzp_cfg()
    raw = await request.body()
    if cfg["webhook_secret"]:
        sig = request.headers.get("X-Razorpay-Signature", "")
        expected = hmac.new(cfg["webhook_secret"].encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise HTTPException(400, "bad signature")
    try:
        evt = _json.loads(raw.decode())
        ent = evt["payload"]["payment"]["entity"]
        oid, pid = ent.get("order_id"), ent.get("id")
    except Exception:
        return {"ok": True}
    order = await db.qr_orders.find_one({"provider_order_id": oid})
    if order and not order.get("paid"):
        await _mark_order_paid(order, pid)
    rec = await db.recharges.find_one({"provider_order_id": oid})
    if rec and not rec.get("paid"):
        product = rec.get("product_type", "vehicle")
        doc = await _coll(product).find_one({"id": rec.get("target_id") or rec.get("vehicle_id")})
        plan = (await db.tag_plans.find_one({"id": rec["plan_id"]}) if product == "tag"
                else await db.plans.find_one({"id": rec["plan_id"]}))
        if doc and plan:
            await _extend_plan(doc, plan, product=product)
            await db.recharges.update_one({"id": rec["id"]},
                                          {"$set": {"paid": True, "paid_at": now_utc(), "payment_id": pid}})
            await _spend_tokens(rec["user_id"], rec.get("tokens_used") or 0)
            await _reward_referral(rec["user_id"])
    return {"ok": True}


# =========================================================================== USER ORDERS
def _order_out(o: dict, doc: Optional[dict] = None) -> dict:
    product, _tid = _order_target(o)
    return {
        "id": o["id"], "status": o["status"], "product_type": product,
        "number_plate": o.get("number_plate"), "tag_type": o.get("tag_type"),
        "plan_name": o.get("plan_name"), "validity_days": o.get("validity_days"),
        "amount_paise": o.get("amount_paise"), "address": o.get("address"),
        "timeline": [{"status": t["status"], "at": _aware(t["at"]).isoformat()} for t in o.get("timeline", [])],
        "created_at": _aware(o.get("created_at")).isoformat() if o.get("created_at") else None,
        "vehicle_id": o.get("vehicle_id"), "tag_id": o.get("tag_id"),
        "plan": plan_state(doc) if doc else None,
    }


@router.get("/me/orders")
async def my_orders(user: dict = Depends(current_user)):
    items = []
    async for o in db.qr_orders.find({"user_id": user["id"]}).sort("created_at", -1).limit(100):
        items.append(_order_out(o))
    return {"items": items}


@router.get("/me/orders/{oid}")
async def my_order(oid: str, user: dict = Depends(current_user)):
    o = await db.qr_orders.find_one({"id": oid, "user_id": user["id"]})
    if not o:
        raise HTTPException(404, "Order not found")
    product, tid = _order_target(o)
    doc = await _coll(product).find_one({"id": tid}) if tid else None
    return _order_out(o, doc)


@router.get("/me/vehicles/plans")
async def my_vehicle_plans(user: dict = Depends(current_user)):
    out = []
    async for v in db.vehicles.find({"owner_id": user["id"]}).sort("created_at", -1):
        out.append({"vehicle_id": v["id"], "number_plate": v.get("number_plate"),
                    "qr_id": v.get("qr_id"), "qr_ordered": bool(v.get("qr_ordered")),
                    "plan": plan_state(v)})
    return {"items": out}


@router.get("/me/transactions")
async def my_transactions(user: dict = Depends(current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "name": 1, "phone": 1, "email": 1}) or {}
    txns = []
    async for o in db.qr_orders.find({"user_id": user["id"]}).sort("created_at", -1).limit(300):
        when = o.get("paid_at") or o.get("created_at")
        label = "Tag QR" if o.get("product_type") == "tag" else "QR sticker"
        txns.append({
            "id": o["id"], "kind": "qr_order", "title": f'{label} · {o.get("plan_name") or ""}'.strip(" ·"),
            "amount_paise": o.get("amount_paise"), "status": "successful" if o.get("paid") else "pending",
            "date": _aware(when).isoformat() if when else None,
            "plan_name": o.get("plan_name"), "validity_days": o.get("validity_days"),
            "number_plate": o.get("number_plate"), "payment_id": o.get("payment_id"),
            "provider": o.get("provider"), "order_ref": o.get("provider_order_id"), "customer": u,
        })
    async for r in db.recharges.find({"user_id": user["id"]}).sort("created_at", -1).limit(300):
        product = r.get("product_type", "vehicle")
        doc = await _coll(product).find_one({"id": r.get("target_id") or r.get("vehicle_id")},
                                            {"_id": 0, "number_plate": 1, "name": 1})
        plan = (await db.tag_plans.find_one({"id": r["plan_id"]}, {"_id": 0, "name": 1, "validity_days": 1})
                if product == "tag"
                else await db.plans.find_one({"id": r["plan_id"]}, {"_id": 0, "name": 1, "validity_days": 1}))
        when = r.get("paid_at") or r.get("created_at")
        label = (doc or {}).get("number_plate") or (doc or {}).get("name")
        txns.append({
            "id": r["id"], "kind": "recharge", "title": f'Recharge · {(plan or {}).get("name") or ""}'.strip(" ·"),
            "amount_paise": r.get("amount_paise"), "status": "successful" if r.get("paid") else "pending",
            "date": _aware(when).isoformat() if when else None,
            "plan_name": (plan or {}).get("name"), "validity_days": (plan or {}).get("validity_days"),
            "number_plate": label, "payment_id": r.get("payment_id"),
            "provider": r.get("provider"), "order_ref": r.get("provider_order_id"), "customer": u,
        })
    txns.sort(key=lambda x: x["date"] or "", reverse=True)
    return {"items": txns}


# =========================================================================== REFERRAL / TOKENS
@router.get("/me/referral")
async def my_referral(request: Request, user: dict = Depends(current_user)):
    u = await _ensure_ref_code(user["id"])
    referred_count = await db.users.count_documents({"referred_by": user["id"]})
    base = _public_base(request)
    code = u["referral_code"]
    tokens = int(u.get("tokens") or 0)
    referrer = None
    if u.get("referred_by"):
        r = await db.users.find_one({"id": u["referred_by"]}, {"_id": 0, "name": 1, "referral_code": 1})
        referrer = {"name": (r or {}).get("name"), "code": (r or {}).get("referral_code")} if r else None
    return {
        "code": code,
        "link": f"{base}/register?ref={code}",
        "tokens": tokens,
        "tokens_value_rupees": round(tokens / TOKENS_PER_RUPEE, 2),
        "tokens_per_rupee": TOKENS_PER_RUPEE,
        "referred_count": referred_count,
        "already_referred": bool(u.get("referred_by")),
        "referrer": referrer,
        "reward_referrer": REF_REWARD_REFERRER,
        "reward_referred": REF_REWARD_REFERRED,
    }


class RefApplyIn(BaseModel):
    code: str = Field(min_length=3, max_length=16)


@router.post("/me/referral/apply")
async def apply_referral(body: RefApplyIn, user: dict = Depends(current_user)):
    me = await db.users.find_one({"id": user["id"]})
    if me.get("referred_by"):
        raise HTTPException(400, "You've already applied a referral code — only one is allowed per account.")
    code = (body.code or "").strip().upper()
    ref = await db.users.find_one({"referral_code": code})
    if not ref:
        raise HTTPException(404, "Invalid referral code.")
    if ref["id"] == user["id"]:
        raise HTTPException(400, "You can't use your own referral code.")
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"referred_by": ref["id"], "referred_at": now_utc()}})
    return {"ok": True, "referrer_name": ref.get("name") or "a friend",
            "note": f"Applied! You'll get {REF_REWARD_REFERRED} tokens after your first plan purchase."}


@router.get("/me/tokens")
async def my_tokens(user: dict = Depends(current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "tokens": 1}) or {}
    tokens = int(u.get("tokens") or 0)
    return {"tokens": tokens, "value_rupees": round(tokens / TOKENS_PER_RUPEE, 2),
            "tokens_per_rupee": TOKENS_PER_RUPEE}


# =========================================================================== RECHARGE
class RechargeCreateIn(BaseModel):
    product_type: str = "vehicle"
    vehicle_id: Optional[str] = None
    tag_id: Optional[str] = None
    plan_id: Optional[str] = None
    plan_code: Optional[str] = None
    use_tokens: int = 0


async def _recharge_target(body: RechargeCreateIn, user: dict):
    """Return (product, doc, plan) for a recharge request, or raise."""
    if body.product_type == "tag":
        doc = await db.tags.find_one({"id": body.tag_id, "owner_id": user["id"]})
        if not doc:
            raise HTTPException(404, "Tag not found")
        plan = await _get_tag_plan(body.plan_id)
        return "tag", doc, plan
    doc = await db.vehicles.find_one({"id": body.vehicle_id, "owner_id": user["id"]})
    if not doc:
        raise HTTPException(404, "Vehicle not found")
    plan = await _get_plan(body.plan_id, body.plan_code)
    return "vehicle", doc, plan


@router.post("/me/recharge/create")
async def recharge_create(body: RechargeCreateIn, user: dict = Depends(current_user)):
    product, doc, plan = await _recharge_target(body, user)
    base_amount = int(plan["price_cents"])
    amount, tokens_used, discount = await _plan_price_with_tokens(user, base_amount, body.use_tokens)
    rid = new_id()
    prov = await _provider_for(amount, receipt=rid[:20])
    await db.recharges.insert_one({
        "id": rid, "user_id": user["id"], "product_type": product, "target_id": doc["id"],
        "vehicle_id": doc["id"] if product == "vehicle" else None,
        "tag_id": doc["id"] if product == "tag" else None,
        "plan_id": plan["id"], "plan_code": plan.get("code"), "amount_paise": amount,
        "base_amount_paise": base_amount, "tokens_used": tokens_used, "discount_paise": discount,
        "provider": prov["provider"], "provider_order_id": prov["order_id"],
        "paid": False, "created_at": now_utc()})
    return {"recharge_id": rid, "provider_order_id": prov["order_id"], "amount_paise": amount,
            "base_amount_paise": base_amount, "tokens_used": tokens_used, "discount_paise": discount,
            "currency": "INR", "key_id": prov["key_id"], "dry_run": prov["dry_run"],
            "name": "Nek Sathi Recharge", "description": f'{plan["name"]} · {plan_validity(plan)} days'}


class RechargeVerifyIn(BaseModel):
    recharge_id: str
    razorpay_payment_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_signature: Optional[str] = None


@router.post("/me/recharge/verify")
async def recharge_verify(body: RechargeVerifyIn, user: dict = Depends(current_user)):
    r = await db.recharges.find_one({"id": body.recharge_id, "user_id": user["id"]})
    if not r:
        raise HTTPException(404, "Recharge not found")
    if r.get("paid"):
        return {"ok": True, "already": True}
    cfg = await rzp_cfg()
    if not cfg["dry_run"]:
        if not _verify_sig(body.razorpay_order_id, body.razorpay_payment_id,
                           body.razorpay_signature, cfg["key_secret"]):
            raise HTTPException(400, "Payment verification failed")
    product = r.get("product_type", "vehicle")
    doc = await _coll(product).find_one({"id": r.get("target_id") or r.get("vehicle_id")})
    plan = (await db.tag_plans.find_one({"id": r["plan_id"]}) if product == "tag"
            else await db.plans.find_one({"id": r["plan_id"]}))
    if not doc or not plan:
        raise HTTPException(404, "Target/plan missing")
    exp = await _extend_plan(doc, plan, product=product)
    await db.recharges.update_one({"id": r["id"]},
                                  {"$set": {"paid": True, "paid_at": now_utc(),
                                            "payment_id": body.razorpay_payment_id or ("dry_" + new_id()[:8])}})
    await _spend_tokens(r["user_id"], r.get("tokens_used") or 0)
    await _reward_referral(r["user_id"])
    return {"ok": True, "expires_at": exp.isoformat()}


# =========================================================================== TAG PLANS (catalogue)
def _tag_plan_out(p: dict) -> dict:
    return {"id": p["id"], "tag_type": p.get("tag_type"), "name": p.get("name"),
            "description": p.get("description"), "price_cents": int(p.get("price_cents") or 0),
            "currency": p.get("currency", "INR"), "validity_days": plan_validity(p),
            "features": p.get("features") or [], "active": bool(p.get("active", True)),
            "popular": bool(p.get("popular", False))}


@router.get("/tag-plans")
async def list_tag_plans(tag_type: Optional[str] = None, user: dict = Depends(current_user)):
    filt: dict = {"active": True}
    if tag_type:
        filt["tag_type"] = tag_type
    out = []
    async for p in db.tag_plans.find(filt).sort("price_cents", 1):
        out.append(_tag_plan_out(p))
    return {"items": out}


class TagPlanIn(BaseModel):
    tag_type: str
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = Field(default=None, max_length=280)
    price_cents: int = Field(ge=0)
    currency: str = "INR"
    validity_days: int = Field(default=30, ge=1, le=3650)
    features: list[str] = []
    active: bool = True
    popular: bool = False


@router.get("/admin/tag-plans")
async def admin_tag_plans(_: dict = Depends(require_admin)):
    out = []
    async for p in db.tag_plans.find({}).sort([("tag_type", 1), ("price_cents", 1)]):
        out.append(_tag_plan_out(p))
    return {"items": out, "tag_types": TAG_TYPES}


@router.post("/admin/tag-plans")
async def admin_tag_plan_create(body: TagPlanIn, _: dict = Depends(require_admin)):
    if body.tag_type not in TAG_TYPES:
        raise HTTPException(400, "Unknown tag type")
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_utc()}
    await db.tag_plans.insert_one(dict(doc))
    return _tag_plan_out(doc)


@router.put("/admin/tag-plans/{plan_id}")
async def admin_tag_plan_update(plan_id: str, body: TagPlanIn, _: dict = Depends(require_admin)):
    if body.tag_type not in TAG_TYPES:
        raise HTTPException(400, "Unknown tag type")
    r = await db.tag_plans.update_one({"id": plan_id}, {"$set": body.model_dump()})
    if not r.matched_count:
        raise HTTPException(404, "Tag plan not found")
    p = await db.tag_plans.find_one({"id": plan_id})
    return _tag_plan_out(p)


@router.delete("/admin/tag-plans/{plan_id}")
async def admin_tag_plan_delete(plan_id: str, _: dict = Depends(require_admin)):
    r = await db.tag_plans.delete_one({"id": plan_id})
    if not r.deleted_count:
        raise HTTPException(404, "Tag plan not found")
    return {"deleted": True}


# =========================================================================== ADMIN · orders / delivery
@router.get("/admin/orders")
async def admin_orders(status: Optional[str] = None, q: Optional[str] = None,
                       product_type: Optional[str] = None,
                       skip: int = 0, limit: int = 50, _: dict = Depends(require_admin)):
    filt: dict = {}
    if status:
        filt["status"] = status
    if product_type:
        filt["product_type"] = product_type
    if q:
        filt["number_plate"] = {"$regex": q, "$options": "i"}
    total = await db.qr_orders.count_documents(filt)
    items = []
    async for o in db.qr_orders.find(filt).sort("created_at", -1).skip(int(skip)).limit(min(int(limit), 100)):
        u = await db.users.find_one({"id": o["user_id"]}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
        items.append({
            "id": o["id"], "status": o["status"],
            "product_type": o.get("product_type", "vehicle"), "tag_type": o.get("tag_type"),
            "number_plate": o.get("number_plate"),
            "plan_name": o.get("plan_name"), "amount_paise": o.get("amount_paise"),
            "paid": bool(o.get("paid")), "address": o.get("address"),
            "sticker_ready": o.get("status") in STICKER_READY,
            "sticker_code": o.get("sticker_code"),
            "user": u or {"name": "?", "phone": "?"},
            "created_at": _aware(o.get("created_at")).isoformat() if o.get("created_at") else None,
        })
    return {"total": total, "items": items}


class AdvanceIn(BaseModel):
    status: str


@router.post("/admin/orders/{oid}/advance")
async def admin_order_advance(oid: str, body: AdvanceIn, _: dict = Depends(require_admin)):
    if body.status not in ORDER_FLOW:
        raise HTTPException(400, "Invalid status")
    o = await db.qr_orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Order not found")
    tl = o.get("timeline", []) + [{"status": body.status, "at": now_utc()}]
    updates = {"status": body.status, "timeline": tl}
    # assign a stable printed code the first time it reaches "printed"
    if body.status == "printed" and not o.get("sticker_code"):
        updates["sticker_code"] = await _unique_sticker_code()
    if body.status == "delivered":
        product, tid = _order_target(o)
        if product == "tag":
            plan = await db.tag_plans.find_one({"id": o["plan_id"]}) or {
                "code": o.get("plan_code"), "name": o.get("plan_name"),
                "validity_days": o.get("validity_days", 30)}
        else:
            plan = await db.plans.find_one({"id": o["plan_id"]}) or {
                "code": o.get("plan_code"), "name": o.get("plan_name"),
                "validity_days": o.get("validity_days", 30)}
        if tid:
            exp = await _activate_plan(tid, plan, product=product)
            updates["activated_at"] = now_utc()
            updates["expires_at"] = exp
    await db.qr_orders.update_one({"id": oid}, {"$set": updates})
    return {"ok": True, "status": body.status}


@router.get("/admin/orders/{oid}/sticker.png")
async def admin_order_sticker(oid: str, request: Request, _: dict = Depends(require_admin)):
    o = await db.qr_orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Order not found")
    if o.get("status") not in STICKER_READY:
        raise HTTPException(409, "Sticker becomes available once the order is marked printed.")
    product, tid = _order_target(o)
    doc = await _coll(product).find_one({"id": tid}) if tid else None
    qr_id = (doc or {}).get("qr_id")
    if not qr_id:
        raise HTTPException(404, "QR id not found for this order")
    code = o.get("sticker_code")
    if not code:
        code = await _unique_sticker_code()
        await db.qr_orders.update_one({"id": oid}, {"$set": {"sticker_code": code}})
    title = "Safety QR Tag" if product == "tag" else None
    url = _scan_url(product, qr_id, request)
    png = sticker.render_sticker(url, code, title=title)
    fname = f"neksathi-{(o.get('number_plate') or qr_id)}-{code}.png".replace(" ", "_")
    return StreamingResponse(io.BytesIO(png), media_type="image/png",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# =========================================================================== ADMIN · Razorpay settings
class RzpSettingsIn(BaseModel):
    key_id: Optional[str] = None
    key_secret: Optional[str] = None
    webhook_secret: Optional[str] = None
    enabled: bool = True


@router.get("/admin/integrations/razorpay")
async def admin_rzp_get(_: dict = Depends(require_admin)):
    cfg = await rzp_cfg()
    return {"key_id": cfg["key_id"] or None, "has_secret": bool(cfg["key_secret"]),
            "webhook_set": bool(cfg["webhook_secret"]), "enabled": cfg["enabled"],
            "dry_run": cfg["dry_run"]}


@router.post("/admin/integrations/razorpay")
async def admin_rzp_set(body: RzpSettingsIn, _: dict = Depends(require_admin)):
    upd = {"_id": "razorpay", "enabled": bool(body.enabled)}
    if body.key_id is not None:
        upd["key_id"] = body.key_id.strip()
    if body.key_secret:
        upd["key_secret"] = body.key_secret.strip()
    if body.webhook_secret:
        upd["webhook_secret"] = body.webhook_secret.strip()
    await db.app_settings.update_one({"_id": "razorpay"}, {"$set": upd}, upsert=True)
    return {"ok": True}


# =========================================================================== VENDOR · scan & assign (OTP)
class AssignStartIn(BaseModel):
    serial_no: str
    customer_mobile: str = Field(min_length=6, max_length=20)
    number_plate: str = Field(min_length=1, max_length=20)
    vehicle_type: str = "car"
    make_model: Optional[str] = None
    plan_id: Optional[str] = None
    plan_code: Optional[str] = None


@router.post("/dealer/assign/start")
async def dealer_assign_start(body: AssignStartIn, user: dict = Depends(require_dealer)):
    inv = await db.qr_inventory.find_one({"serial_no": body.serial_no.strip()})
    if not inv:
        raise HTTPException(404, "QR serial not found")
    if inv["status"] == "assigned":
        raise HTTPException(409, "This QR is already activated")
    if inv["status"] == "blocked":
        raise HTTPException(409, "This QR is blocked")
    if inv.get("sold_vendor_id") and inv.get("sold_vendor_id") != user["vendor_id"]:
        raise HTTPException(403, "This QR is not in your stock")
    plan = await _get_plan(body.plan_id, body.plan_code)
    phone = _norm_phone(body.customer_mobile)
    aid = new_id()
    await db.assign_requests.insert_one({
        "id": aid, "vendor_id": user["vendor_id"], "serial_no": inv["serial_no"],
        "qr_id": inv["qr_id"], "inv_id": inv["id"], "mobile": phone,
        "number_plate": body.number_plate.upper().strip(), "vehicle_type": body.vehicle_type,
        "make_model": body.make_model, "plan_id": plan["id"], "plan_name": plan["name"],
        "created_at": now_utc(), "expires_at": now_utc() + timedelta(minutes=OTP_TTL_MIN), "used": False})
    sent = await _otp_send(phone)
    return {"assign_id": aid, "mobile": phone, "plan_name": plan["name"],
            "channel": sent["channel"], "dev_code": sent["dev_code"]}


class AssignVerifyIn(BaseModel):
    assign_id: str
    code: str = Field(min_length=4, max_length=8)


@router.post("/dealer/assign/verify")
async def dealer_assign_verify(body: AssignVerifyIn, user: dict = Depends(require_dealer)):
    ar = await db.assign_requests.find_one({"id": body.assign_id, "vendor_id": user["vendor_id"]})
    if not ar:
        raise HTTPException(404, "Assign request not found")
    if ar.get("used"):
        raise HTTPException(409, "This assignment is already completed")
    if _aware(ar["expires_at"]) < now_utc():
        raise HTTPException(400, "Request expired — start again")
    if not await _otp_check(ar["mobile"], body.code):
        raise HTTPException(400, "Invalid or expired OTP")
    inv = await db.qr_inventory.find_one({"id": ar["inv_id"]})
    if not inv or inv["status"] == "assigned":
        raise HTTPException(409, "This QR is already activated")
    cust = await db.users.find_one({"phone": ar["mobile"]})
    if not cust:
        digits = "".join(ch for ch in ar["mobile"] if ch.isdigit()) or new_id()[:10]
        cust = {"id": new_id(), "email": f"{digits}@phone.neksaathi.app",
                "name": "Nek Sathi User", "phone": ar["mobile"], "password_hash": "",
                "is_admin": False, "suspended": False, "auth": "otp", "created_at": now_utc()}
        await db.users.insert_one(dict(cust))
    plan = await db.plans.find_one({"id": ar["plan_id"]}) or {
        "code": None, "name": ar.get("plan_name"), "validity_days": 30}
    vid = new_id()
    await db.vehicles.insert_one({
        "id": vid, "owner_id": cust["id"], "qr_id": ar["qr_id"],
        "number_plate": ar["number_plate"], "vehicle_type": ar.get("vehicle_type", "car"),
        "make_model": ar.get("make_model"), "speed_limit_kmh": 80, "lost_mode": False,
        "qr_ordered": True, "vendor_id": user["vendor_id"], "assigned_by": "vendor",
        "created_at": now_utc()})
    exp = await _activate_plan(vid, plan)
    await db.qr_inventory.update_one({"id": inv["id"]}, {"$set": {
        "status": "assigned", "assigned_to_user_id": cust["id"],
        "assigned_at": now_utc(), "product_type": "vehicle"}})
    await db.assign_requests.update_one({"id": ar["id"]}, {"$set": {
        "used": True, "used_at": now_utc(), "vehicle_id": vid, "customer_id": cust["id"]}})
    await db.otp_codes.delete_many({"phone": ar["mobile"]})
    return {"ok": True, "vehicle_id": vid, "qr_id": ar["qr_id"], "customer_id": cust["id"],
            "plan_name": plan.get("name"), "expires_at": exp.isoformat()}


# =========================================================================== ADMIN · per-vendor dashboard
@router.get("/admin/vendors/{vendor_id}/dashboard")
async def admin_vendor_dashboard(vendor_id: str, skip: int = 0, limit: int = 50,
                                 _: dict = Depends(require_admin)):
    vendor = await db.vendors.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    name = vendor["name"]
    inv = db.qr_inventory
    counts = {
        "assigned_total": await inv.count_documents({"sold_to_vendor": name}),
        "available": await inv.count_documents({"sold_to_vendor": name, "status": "sold"}),
        "activated": await inv.count_documents({"sold_to_vendor": name, "status": "assigned"}),
        "blocked": await inv.count_documents({"sold_to_vendor": name, "status": "blocked"}),
        "pending": await db.assign_requests.count_documents(
            {"vendor_id": vendor_id, "used": False, "expires_at": {"$gt": now_utc()}}),
    }
    customers = []
    active = grace = expired = 0
    cursor = db.vehicles.find({"vendor_id": vendor_id}).sort("created_at", -1).skip(int(skip)).limit(min(int(limit), 100))
    async for v in cursor:
        st = plan_state(v)
        if st["status"] == "active":
            active += 1
        elif st["status"] == "grace":
            grace += 1
        elif st["status"] == "expired":
            expired += 1
        owner = await db.users.find_one({"id": v["owner_id"]}, {"_id": 0, "phone": 1, "name": 1})
        customers.append({
            "vehicle_id": v["id"], "number_plate": v.get("number_plate"),
            "mobile": (owner or {}).get("phone"), "plan_name": v.get("plan_name"),
            "plan_status": st["status"], "days_left": st["days_left"], "expires_at": st["expires_at"],
            "assigned_at": _aware(v.get("created_at")).isoformat() if v.get("created_at") else None})
    total_cust = await db.vehicles.count_documents({"vendor_id": vendor_id})
    counts.update({"customers": total_cust, "active": active, "grace": grace, "expired": expired})
    return {"vendor": {"id": vendor["id"], "name": name, "city": vendor.get("city"),
                       "phone": vendor.get("phone")},
            "counts": counts, "customers": customers, "customers_total": total_cust}
