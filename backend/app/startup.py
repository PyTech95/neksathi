"""Startup / shutdown lifecycle: index creation, migrations and seeds.

The bodies are the pre-refactor @app.on_event("startup"/"shutdown") handlers,
moved here verbatim and registered against the app in app/__init__.py.
"""
from __future__ import annotations

import asyncio
import os

from app.config import log
from app.db import client, db
from app.security import canon_phone, hash_password
from app.utils import new_id, now_utc
from app.services.background import (
    _digest_scheduler, _sos_escalation_scanner, _checkin_nudge_scanner,
)


async def _seed_blackspots() -> None:
    """Seed a handful of demo blackspots so the family map is not empty out of the box."""
    if await db.blackspots.count_documents({}) > 0:
        return
    seed = [
        {"name": "NH-48 Sector 44 curve", "kind": "accident", "severity": "high",  "lat": 28.4595, "lng": 77.0266, "radius_m": 400, "notes": "Sharp turn, 12 fatal accidents last year."},
        {"name": "IIT flyover ramp",      "kind": "accident", "severity": "medium","lat": 28.5433, "lng": 77.1930, "radius_m": 300, "notes": "Poor lighting at night."},
        {"name": "Yamuna riverfront",     "kind": "flood",    "severity": "medium","lat": 28.6060, "lng": 77.2340, "radius_m": 800, "notes": "Waterlogging during monsoons."},
        {"name": "Old Delhi market lane", "kind": "crime",    "severity": "high",  "lat": 28.6562, "lng": 77.2410, "radius_m": 250, "notes": "Repeated phone-snatching reports."},
    ]
    for row in seed:
        row["id"] = new_id()
        row["created_at"] = now_utc()
        await db.blackspots.insert_one(dict(row))


async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.vehicles.create_index("owner_id")
    await db.vehicles.create_index("qr_id", unique=True)
    await db.contacts.create_index("vehicle_id")
    await db.locations.create_index([("vehicle_id", 1), ("recorded_at", -1)])
    await db.alerts.create_index([("vehicle_id", 1), ("created_at", -1)])
    await db.sos_videos.create_index([("vehicle_id", 1), ("created_at", -1)])
    await db.sos_videos.create_index([("user_id", 1), ("created_at", -1)])
    await db.sos_chunks.create_index([("upload_id", 1), ("index", 1)], unique=True)
    await db.sos_uploads.create_index("user_id")
    await db.password_resets.create_index("token", unique=True)
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.plans.create_index("code", unique=True)
    await db.subscriptions.create_index([("user_id", 1), ("status", 1)])
    await db.subscriptions.create_index("stripe_session_id", unique=True, sparse=True)
    await db.support_tickets.create_index([("user_id", 1), ("created_at", -1)])
    await db.contact_enquiries.create_index([("created_at", -1)])
    await db.faqs.create_index("question", unique=True)
    await db.invites.create_index("token", unique=True)
    await db.invites.create_index("expires_at", expireAfterSeconds=0)
    await db.vehicle_shares.create_index([("shared_with_user_id", 1), ("status", 1)])
    await db.vehicle_shares.create_index([("vehicle_id", 1)])
    await db.qr_inventory.create_index("serial_no", unique=True)
    await db.qr_inventory.create_index("seq", unique=True)
    await db.qr_inventory.create_index([("status", 1), ("batch_id", 1)])
    # commerce (QR orders, tags, recharges, tag-plan catalogue)
    await db.qr_orders.create_index([("user_id", 1), ("created_at", -1)])
    await db.qr_orders.create_index("provider_order_id")
    await db.qr_orders.create_index([("status", 1), ("created_at", -1)])
    await db.qr_orders.create_index("sticker_code", sparse=True)
    await db.recharges.create_index("provider_order_id")
    await db.tags.create_index("qr_id", unique=True)
    await db.tags.create_index("owner_id")
    await db.tag_plans.create_index([("tag_type", 1), ("price_cents", 1)])
    # Fast lookup for mobile-OTP login / account matching by canonical number.
    await db.users.create_index("phone_norm", sparse=True)
    await db.phone_verify_otps.create_index("phone", unique=True)
    await db.phone_verify_otps.create_index("expires_at", expireAfterSeconds=0)
    await db.email_verify_otps.create_index("email", unique=True)
    await db.email_verify_otps.create_index("expires_at", expireAfterSeconds=0)

    # Backfill: give every legacy user a canonical phone_norm so mobile-OTP login
    # reconnects them to this same account regardless of how the number was typed.
    # phone_verified defaults to False (they can verify in profile); users who
    # later log in via OTP get auto-verified in /auth/otp/verify.
    async for u in db.users.find({"phone_norm": {"$exists": False}}, {"id": 1, "phone": 1}):
        await db.users.update_one(
            {"id": u["id"]},
            {"$set": {"phone_norm": canon_phone(u.get("phone")), "phone_verified": False}},
        )

    # Backfill: older tag/card alerts were inserted without ``user_id``, which
    # makes them invisible in /api/alerts. Populate user_id from the tag/card
    # owner in a one-shot pass at startup (idempotent).
    orphan_tags = db.alerts.find({"user_id": None, "tag_id": {"$ne": None}}, {"id": 1, "tag_id": 1})
    async for a in orphan_tags:
        t = await db.tags.find_one({"id": a["tag_id"]}, {"owner_id": 1})
        if t and t.get("owner_id"):
            await db.alerts.update_one({"id": a["id"]}, {"$set": {"user_id": t["owner_id"]}})
    orphan_cards = db.alerts.find({"user_id": None, "card_id": {"$ne": None}}, {"id": 1, "card_id": 1})
    async for a in orphan_cards:
        c = await db.cards.find_one({"id": a["card_id"]}, {"owner_id": 1})
        if c and c.get("owner_id"):
            await db.alerts.update_one({"id": a["id"]}, {"$set": {"user_id": c["owner_id"]}})

    # Seed default FAQs (idempotent)
    default_faqs = [
        {"question": "Nek Sathi sticker kya hai?", "answer": "Har vehicle par ek unique QR sticker lagta hai. Koi bhi is QR ko scan karke Emergency ya Wrong Parking alert bhej sakta hai — bina aapke phone number reveal kiye.", "category": "basics", "order": 1},
        {"question": "Kaise kaam karta hai emergency alert?", "answer": "Kisi ne QR scan kiya → 'EMERGENCY' button dabaya → aapke aur family ke phone par WhatsApp/SMS deep-link chala jayega jisme vehicle number aur location details hongi.", "category": "basics", "order": 2},
        {"question": "Kya mera phone number scanner ko dikhega?", "answer": "Nahi. Public scan page par sirf vehicle info aur pehla naam hi dikhta hai. Number kabhi expose nahi hota.", "category": "privacy", "order": 3},
        {"question": "Kitne family contacts add kar sakta hoon?", "answer": "Har vehicle ke liye maximum 4 emergency contacts add kar sakte hain. Har contact ke liye alag toggles hote hain (emergency, wrong parking, speed alert).", "category": "features", "order": 4},
        {"question": "Family Pro me kya extra milta hai?", "answer": "Family Pro me 5 vehicles, live family tracking, speed alerts, SOS video recording, priority nearby help — sab kuch ₹499/year me.", "category": "plans", "order": 5},
        {"question": "Payment safe hai?", "answer": "Sabhi payments Stripe ke through hote hain (PCI-DSS compliant). Aapke card details hamare server par kabhi store nahi hote.", "category": "plans", "order": 6},
        {"question": "Refund policy kya hai?", "answer": "First 7 days ke andar full refund. Uske baad pro-rated basis par unused months ka refund. Details Refund Policy page par.", "category": "plans", "order": 7},
        {"question": "Sticker kaise milega?", "answer": "Registration ke baad app se aap khud printable QR download kar sakte hain, ya premium plan me hum ready-made weatherproof sticker ghar bhej dete hain.", "category": "basics", "order": 8},
    ]
    for f in default_faqs:
        await db.faqs.update_one(
            {"question": f["question"]},
            {"$setOnInsert": {"id": new_id(), "active": True, "created_at": now_utc(), **f}},
            upsert=True,
        )

    # Seed default plans (idempotent)
    default_plans = [
        {
            "code": "basic",
            "name": "Basic",
            "description": "1 vehicle · Emergency + Wrong Parking alerts · WhatsApp/SMS deep-links",
            "price_cents": 9900,
            "currency": "INR",
            "interval": "year",
            "validity_days": 365,
            "vehicle_limit": 1,
            "features": [
                "1 vehicle",
                "Emergency & Wrong Parking scans",
                "WhatsApp / SMS alerts",
                "Basic activity log",
            ],
            "active": True,
        },
        {
            "code": "family_pro",
            "name": "Family Pro",
            "description": "Up to 5 vehicles · All Basic + Family tracking + Speed alerts + SOS video",
            "price_cents": 49900,
            "currency": "INR",
            "interval": "year",
            "vehicle_limit": 5,
            "features": [
                "Up to 5 vehicles",
                "Everything in Basic",
                "Family live tracking",
                "Speed limit alerts",
                "SOS video recording",
                "Priority nearby help",
            ],
            "active": True,
        },
    ]
    for p in default_plans:
        await db.plans.update_one(
            {"code": p["code"]},
            {"$setOnInsert": {"id": new_id(), "created_at": now_utc(), **p}},
            upsert=True,
        )
    # Nek Sathi uses YEARLY plans only — migrate any legacy monthly plans.
    await db.plans.update_many({"interval": {"$ne": "year"}}, {"$set": {"interval": "year"}})
    await db.users.create_index("referral_code", unique=True, sparse=True)
    await db.users.create_index("referred_by")
    await db.token_ledger.create_index([("user_id", 1), ("created_at", -1)])

    # Seed default per-type TAG plans (idempotent) so the Tag buy-flow and the
    # admin Tag-plan screen have sensible starting prices. Admin can edit/add.
    default_tag_plans = [
        {"tag_type": "person",  "name": "Person Safety",   "price_cents": 14900, "validity_days": 365,
         "features": ["Masked emergency call", "Blood group & medical notes", "Live location on scan"]},
        {"tag_type": "kid",     "name": "School Kid",       "price_cents": 14900, "validity_days": 365,
         "features": ["Guardian masked call", "Kid-needs-help SOS", "School & class info", "Live location"]},
        {"tag_type": "patient", "name": "Patient Care",     "price_cents": 14900, "validity_days": 365,
         "features": ["Caretaker masked call", "Medical notes & allergies", "Emergency SOS"]},
        {"tag_type": "staff",   "name": "Staff ID",         "price_cents": 9900,  "validity_days": 365,
         "features": ["Company masked call", "Verify identity on scan"]},
        {"tag_type": "pet",     "name": "Pet Tag",          "price_cents": 9900,  "validity_days": 365,
         "features": ["Owner masked call", "Found-pet alert", "Live location"]},
        {"tag_type": "bag",     "name": "Bag Tag",          "price_cents": 7900,  "validity_days": 365,
         "features": ["Found-bag alert", "Reward note", "Owner masked call"]},
        {"tag_type": "luggage", "name": "Luggage Tag",      "price_cents": 7900,  "validity_days": 365,
         "features": ["Found-luggage alert", "Reward note", "Owner masked call"]},
        {"tag_type": "keys",    "name": "Keys Tag",         "price_cents": 4900,  "validity_days": 365,
         "features": ["Found-keys alert", "Owner masked call"]},
        {"tag_type": "phone",   "name": "Phone Tag",        "price_cents": 4900,  "validity_days": 365,
         "features": ["Found-device alert", "Owner masked call"]},
        {"tag_type": "laptop",  "name": "Laptop Tag",       "price_cents": 4900,  "validity_days": 365,
         "features": ["Found-device alert", "Owner masked call"]},
        {"tag_type": "door",    "name": "Smart Doorbell",   "price_cents": 9900,  "validity_days": 365,
         "features": ["Doorbell alert to phone", "Voice note from visitor"]},
        {"tag_type": "other",   "name": "General Tag",      "price_cents": 4900,  "validity_days": 365,
         "features": ["Found alert", "Owner masked call"]},
    ]
    for tp in default_tag_plans:
        await db.tag_plans.update_one(
            {"tag_type": tp["tag_type"], "name": tp["name"]},
            {"$setOnInsert": {"id": new_id(), "currency": "INR", "active": True,
                              "popular": False, "created_at": now_utc(), **tp}},
            upsert=True,
        )

    # Seed default admin (idempotent)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@safeqr.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin1234")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "name": "Nek Sathi Admin",
            "phone": "+910000000000",
            "password_hash": hash_password(admin_password),
            "is_admin": True,
            "suspended": False,
            "created_at": now_utc(),
        })
        log.info("Seeded admin user %s", admin_email)
    else:
        # Ensure existing admin has flag set (idempotent lift)
        if not existing.get("is_admin"):
            await db.users.update_one({"email": admin_email}, {"$set": {"is_admin": True}})
            log.info("Promoted existing user %s to admin", admin_email)

    # Seed a non-admin demo user (idempotent) for easy login without OTP
    demo_email = os.environ.get("DEMO_EMAIL", "demo@neksathi.app")
    demo_password = os.environ.get("DEMO_PASSWORD", "demo1234")
    if not await db.users.find_one({"email": demo_email}):
        await db.users.insert_one({
            "id": new_id(),
            "email": demo_email,
            "name": "Demo User",
            "phone": "+910000000001",
            "password_hash": hash_password(demo_password),
            "is_admin": False,
            "suspended": False,
            "created_at": now_utc(),
        })
        log.info("Seeded demo user %s", demo_email)
    await _seed_blackspots()
    asyncio.create_task(_digest_scheduler())
    asyncio.create_task(_sos_escalation_scanner())
    asyncio.create_task(_checkin_nudge_scanner())
    log.info("Nek Sathi indexes ensured")


async def on_shutdown():
    client.close()
