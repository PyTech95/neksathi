from __future__ import annotations

from datetime import timedelta
from urllib.parse import quote_plus
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.services import comms
from app.config import log
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import BridgeOut, BridgeReqIn, ClaimIn, PublicVehicleOut, ScanAlertIn
from app.security import current_user
from app.services.fcm import send_push
from app.services.notify import notify_whatsapp, send_sms
from app.utils import new_id, now_utc

router = APIRouter()


@router.get("/public/qr/{qr_id}", response_model=PublicVehicleOut)
async def public_qr_lookup(qr_id: str):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if not v:
        raise HTTPException(status_code=404, detail="QR not found or vehicle removed")
    owner = await db.users.find_one({"id": v["owner_id"]})
    first_name = owner["name"].split()[0] if owner and owner.get("name") else "Owner"
    return PublicVehicleOut(
        qr_id=v["qr_id"],
        number_plate=v["number_plate"],
        vehicle_type=v["vehicle_type"],
        brand=v.get("brand"),
        model=v.get("model"),
        make_model=v.get("make_model"),
        color=v.get("color"),
        photo_base64=v.get("photo_base64"),
        owner_first_name=first_name,
    )


@router.post("/public/qr/{qr_id}/alert")
@rate_limit("20/minute")
async def public_qr_alert(request: Request, qr_id: str, payload: ScanAlertIn):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if not v:
        raise HTTPException(status_code=404, detail="QR not found")
    contacts = [c async for c in db.contacts.find({"vehicle_id": v["id"]})]
    channels = []
    if payload.type == "emergency":
        channels = [c["phone"] for c in contacts if c.get("receives_emergency", True)]
    elif payload.type == "wrong_parking":
        channels = [c["phone"] for c in contacts if c.get("receives_parking", True)]
    else:
        # theft / fire / towing — treat as emergency-severity, notify everyone
        # opted in for emergencies.
        channels = [c["phone"] for c in contacts if c.get("receives_emergency", True)]
    owner = await db.users.find_one({"id": v["owner_id"]})
    if owner and owner.get("phone"):
        channels.insert(0, owner["phone"])

    alert = {
        "id": new_id(),
        "vehicle_id": v["id"],
        "number_plate": v["number_plate"],
        "type": payload.type,
        "scanner_note": payload.scanner_note,
        "scanner_phone": payload.scanner_phone,
        "scanner_lat": payload.scanner_lat,
        "scanner_lng": payload.scanner_lng,
        "evidence_photo_base64": payload.evidence_photo_base64,
        "created_at": now_utc(),
        "contact_channels": channels,
    }
    await db.alerts.insert_one(dict(alert))
    # WhatsApp + SMS fan-out to owner & vehicle contacts so they are reached even
    # when the app is closed (mirrors the tag-alert flow). Gated by provider config:
    # runs live only if MSG91_WHATSAPP_TEMPLATE / MSG91_SMS_FLOW_ID are set, else mock.
    titles_msg = {
        "emergency": "🚨 EMERGENCY", "wrong_parking": "🅿️ Wrong parking",
        "theft": "🔒 Theft alert", "fire": "🔥 Fire alert", "towing": "🚛 Being towed",
    }
    body = f"{titles_msg.get(payload.type, 'Alert')}: Your vehicle {v.get('number_plate','')} was reported via a Nek Sathi QR scan."
    if payload.scanner_note:
        body += f" Note: {payload.scanner_note[:100]}"
    if payload.scanner_lat is not None and payload.scanner_lng is not None:
        body += f" Location: https://maps.google.com/?q={payload.scanner_lat},{payload.scanner_lng}"
    for phone in list(dict.fromkeys([comms.e164(p) for p in channels if p])):
        try:
            wa = await notify_whatsapp(phone, body, meta={"vehicle_id": v["id"], "kind": "scan_alert"})
            if wa.get("status") == "failed":
                await send_sms(phone, body, meta={"vehicle_id": v["id"], "kind": "scan_alert_fallback"})
        except Exception as _e:
            log.warning("vehicle alert whatsapp/sms failed: %s", _e)
    # Fire-and-forget push to the owner. Never blocks the primary op.
    try:
        if v.get("owner_id"):
            titles = {
                "emergency": "🚨 Emergency alert",
                "wrong_parking": "🅿️ Wrong parking",
                "theft": "🔒 Theft alert",
                "fire": "🔥 Fire alert",
                "towing": "🚛 Being towed",
            }
            title = titles.get(payload.type, "Vehicle alert")
            msg_bits = [v.get("number_plate", "Your vehicle")]
            if payload.scanner_note:
                msg_bits.append(payload.scanner_note[:100])
            await send_push(
                recipients=[v["owner_id"]],
                data={
                    "title": title,
                    "message": " · ".join(msg_bits),
                    "action_url": f"/alerts",
                },
                idempotency_key=alert["id"],
            )
    except Exception as _e:
        log.warning("push (vehicle alert) failed: %s", _e)
    # Public-facing response never leaks contact_channels or owner phone.
    return {"id": alert["id"], "type": alert["type"], "ok": True}


@router.get("/public/resolve/{qr_id}")
async def resolve_qr(qr_id: str):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if v:
        return {"entity_type": "vehicle", "qr_id": qr_id}
    t = await db.tags.find_one({"qr_id": qr_id})
    if t:
        return {"entity_type": "tag", "qr_id": qr_id}
    c = await db.cards.find_one({"qr_id": qr_id})
    if c:
        return {"entity_type": "card", "qr_id": qr_id}
    raise HTTPException(status_code=404, detail="QR not recognised")


MASK_TTL_MIN = 30


def _telco_provider() -> str:
    return "msg91" if comms.voice_live() else "mock"


@router.post("/public/qr/{qr_id}/bridge", response_model=BridgeOut)
@rate_limit("10/minute")
async def public_bridge(request: Request, qr_id: str, payload: BridgeReqIn):
    owner_phone: Optional[str] = None
    label = ""
    if payload.entity == "vehicle":
        v = await db.vehicles.find_one({"qr_id": qr_id})
        if not v:
            raise HTTPException(status_code=404, detail="Not found")
        owner = await db.users.find_one({"id": v["owner_id"]})
        owner_phone = owner and owner.get("phone")
        label = v["number_plate"]
    elif payload.entity == "tag":
        t = await db.tags.find_one({"qr_id": qr_id})
        if not t:
            raise HTTPException(status_code=404, detail="Not found")
        owner = await db.users.find_one({"id": t["owner_id"]})
        owner_phone = owner and owner.get("phone")
        label = t["name"]
    else:  # card
        c = await db.cards.find_one({"qr_id": qr_id})
        if not c:
            raise HTTPException(status_code=404, detail="Not found")
        owner_phone = c.get("phone") or None
        if not owner_phone:
            owner = await db.users.find_one({"id": c["owner_id"]})
            owner_phone = owner and owner.get("phone")
        label = c.get("display_name") or "Card"

    if not owner_phone:
        return BridgeOut(kind="unavailable", note="Owner has no phone on file")

    provider = _telco_provider()
    session_id = new_id()
    expires = now_utc() + timedelta(minutes=MASK_TTL_MIN)
    # Persist the mapping so admin can audit the bridge later.
    await db.bridge_sessions.insert_one({
        "id": session_id,
        "qr_id": qr_id,
        "entity": payload.entity,
        "scanner_phone": payload.scanner_phone,
        "owner_phone": owner_phone,
        "provider": provider,
        "expires_at": expires,
        "created_at": now_utc(),
    })

    if provider == "msg91":
        res = await comms.masked_call(payload.scanner_phone, owner_phone)
        return BridgeOut(
            kind="msg91",
            masked_from="Nek Sathi bridge",
            masked_to=label,
            expires_at=expires,
            note="We'll connect you privately via MSG91 — the owner's number stays hidden.",
        )
    # Mock fallback (no live voice creds) — WhatsApp deep-link is the safest zero-config bridge.
    text = f"Hi, I scanned your Nek Sathi QR ({label}). Session {session_id[:8]}."
    dial = f"https://wa.me/{owner_phone.replace('+', '').replace(' ', '')}?text={quote_plus(text)}"
    return BridgeOut(
        kind="mock",
        dial_url=dial,
        masked_from="via WhatsApp",
        masked_to=label,
        expires_at=expires,
        note="Chat opens directly with the owner. Your number is only shared if you press 'send'.",
    )


@router.get("/public/claim/{serial_no}")
async def public_claim_preview(serial_no: str):
    d = await db.qr_inventory.find_one({"serial_no": serial_no})
    if not d:
        raise HTTPException(status_code=404, detail="Serial not found")
    if d["status"] == "assigned":
        return {"status": "assigned", "product_type": d.get("product_type"), "qr_id": d["qr_id"]}
    return {
        "status": d["status"], "serial_no": d["serial_no"],
        "batch_label": d.get("batch_label"),
        "intended_type": d.get("intended_type"),
        "org_name": d.get("org_name"),
    }


@router.post("/qr/claim")
async def qr_claim(body: ClaimIn, user: dict = Depends(current_user)):
    d = await db.qr_inventory.find_one({"serial_no": body.serial_no})
    if not d:
        raise HTTPException(status_code=404, detail="Serial not found")
    if d["status"] == "assigned":
        raise HTTPException(status_code=409, detail="This QR is already claimed")
    p = body.payload or {}
    new_qr = d["qr_id"]
    new_doc_id = new_id()
    now = now_utc()
    if body.product_type == "vehicle":
        _brand = (p.get("brand") or "").strip() or None
        _model = (p.get("model") or "").strip() or None
        await db.vehicles.insert_one({
            "id": new_doc_id, "owner_id": user["id"], "qr_id": new_qr,
            "number_plate": (p.get("number_plate") or "").strip().upper() or "UNSET",
            "vehicle_type": p.get("vehicle_type", "car"),
            "brand": _brand, "model": _model,
            "make_model": p.get("make_model") or (" ".join(x for x in [_brand, _model] if x) or None),
            "color": (p.get("color") or "").strip() or None,
            "speed_limit_kmh": int(p.get("speed_limit_kmh", 80)),
            "lost_mode": False, "created_at": now,
        })
    elif body.product_type == "tag":
        await db.tags.insert_one({
            "id": new_doc_id, "owner_id": user["id"], "qr_id": new_qr,
            "name": p.get("name", "My Tag"), "tag_type": p.get("tag_type") or p.get("type_", "pet"),
            "description": p.get("description"),
            "blood_group": (p.get("blood_group") or "").strip() or None,
            "medical_notes": p.get("medical_notes"),
            "reward_text": p.get("reward_text"),
            "guardian_name": (p.get("guardian_name") or "").strip() or None,
            "guardian_phone": (p.get("guardian_phone") or "").strip() or None,
            "org_id": d.get("org_id"),
            "lost_mode": bool(p.get("lost_mode", False)),
            "metadata": p.get("metadata", {}), "created_at": now,
        })
    else:
        await db.cards.insert_one({
            "id": new_doc_id, "owner_id": user["id"], "qr_id": new_qr,
            "display_name": p.get("display_name", user.get("name", "Card")),
            "title": p.get("title"), "company": p.get("company"),
            "phone": p.get("phone"), "email": p.get("email"),
            "website": p.get("website"), "bio": p.get("bio"),
            "address": p.get("address"), "socials": p.get("socials", {}),
            "accent": p.get("accent"), "photo_base64": p.get("photo_base64"),
            "created_at": now,
        })
    await db.qr_inventory.update_one(
        {"id": d["id"]},
        {"$set": {
            "status": "assigned", "assigned_to_user_id": user["id"],
            "assigned_at": now, "product_type": body.product_type,
        }},
    )
    return {"ok": True, "product_type": body.product_type, "qr_id": new_qr, "id": new_doc_id}
