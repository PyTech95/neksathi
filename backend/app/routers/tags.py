from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.services import comms
from app.config import NEK_PORTAL_NUMBER, log
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import LostModeIn, PublicTagOut, TagAlertIn, TagCallIn, TagIn, TagOut
from app.security import _prefs, current_user
from app.services.calls import _bridge_masked_call
from app.services.fcm import send_push
from app.services.notify import notify_whatsapp, send_sms
from app.utils import _veh_plan_state, clean, new_id, now_utc

router = APIRouter()


TAG_TYPES = ("person", "kid", "pet", "bag", "luggage", "keys", "phone", "laptop", "door", "other")


def to_tag_out(t: dict) -> TagOut:
    """TagOut with the live plan state computed (mirrors to_vehicle_out)."""
    _ps, _dl, _exp = _veh_plan_state(t)
    data = clean(t)
    data.update({
        "qr_ordered": bool(t.get("qr_ordered", False)),
        "qr_order_id": t.get("qr_order_id"),
        "plan_status": _ps,
        "plan_name": t.get("plan_name"),
        "plan_days_left": _dl,
        "plan_expires_at": _exp,
    })
    return TagOut(**data)


@router.get("/tags", response_model=List[TagOut])
async def list_tags(user: dict = Depends(current_user)):
    out = [to_tag_out(t) async for t in db.tags.find({"owner_id": user["id"]}).sort("created_at", -1).limit(500)]
    return out


@router.post("/tags", response_model=TagOut)
async def create_tag(payload: TagIn, user: dict = Depends(current_user)):
    tag = {
        "id": new_id(),
        "owner_id": user["id"],
        "name": payload.name.strip(),
        "tag_type": payload.tag_type,
        "description": payload.description,
        "photo_base64": payload.photo_base64,
        "blood_group": (payload.blood_group or "").strip() or None,
        "medical_notes": payload.medical_notes,
        "reward_text": payload.reward_text,
        "guardian_name": (payload.guardian_name or "").strip() or None,
        "guardian_phone": (payload.guardian_phone or "").strip() or None,
        "qr_id": new_id(),
        "lost_mode": False,
        "created_at": now_utc(),
    }
    await db.tags.insert_one(dict(tag))
    return to_tag_out(tag)


@router.get("/tags/{tag_id}", response_model=TagOut)
async def get_tag(tag_id: str, user: dict = Depends(current_user)):
    t = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    return to_tag_out(t)


@router.put("/tags/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: str, payload: TagIn, user: dict = Depends(current_user)):
    t = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    updates = {
        "name": payload.name.strip(),
        "tag_type": payload.tag_type,
        "description": payload.description,
        "photo_base64": payload.photo_base64,
        "blood_group": (payload.blood_group or "").strip() or None,
        "medical_notes": payload.medical_notes,
        "reward_text": payload.reward_text,
        "guardian_name": (payload.guardian_name or "").strip() or None,
        "guardian_phone": (payload.guardian_phone or "").strip() or None,
    }
    await db.tags.update_one({"id": tag_id}, {"$set": updates})
    t.update(updates)
    return to_tag_out(t)


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, user: dict = Depends(current_user)):
    existing = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Tag not found")
    if existing.get("qr_ordered"):
        raise HTTPException(status_code=400, detail="This tag has a paid QR order and cannot be deleted.")
    await db.tags.delete_one({"id": tag_id, "owner_id": user["id"]})
    return {"deleted": True}


@router.post("/tags/{tag_id}/lost_mode", response_model=TagOut)
async def toggle_tag_lost_mode(tag_id: str, payload: LostModeIn, user: dict = Depends(current_user)):
    t = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.tags.update_one({"id": tag_id}, {"$set": {"lost_mode": payload.enabled}})
    t["lost_mode"] = payload.enabled
    return to_tag_out(t)


@router.get("/tags/{tag_id}/scans")
async def list_tag_scans(tag_id: str, user: dict = Depends(current_user)):
    """Scan history for a specific tag — owner only."""
    t = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    scans = []
    async for s in db.alerts.find({"tag_id": tag_id}).sort("created_at", -1).limit(100):
        scans.append(clean(s))
    return scans


@router.get("/public/tag/{qr_id}", response_model=PublicTagOut)
async def public_tag_lookup(qr_id: str):
    t = await db.tags.find_one({"qr_id": qr_id})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    owner = await db.users.find_one({"id": t["owner_id"]})
    first_name = owner["name"].split()[0] if owner and owner.get("name") else "Owner"
    return PublicTagOut(
        qr_id=t["qr_id"],
        name=t["name"],
        tag_type=t["tag_type"],
        description=t.get("description"),
        photo_base64=t.get("photo_base64"),
        blood_group=t.get("blood_group"),
        medical_notes=t.get("medical_notes"),
        reward_text=t.get("reward_text"),
        guardian_name=t.get("guardian_name"),
        has_guardian=bool(t.get("guardian_phone")) or (t.get("tag_type") in ("person", "kid", "patient", "staff") and bool(owner and owner.get("phone"))),
        lost_mode=bool(t.get("lost_mode")),
        owner_first_name=first_name,
    )


@router.post("/public/tag/{qr_id}/alert")
@rate_limit("20/minute")
async def public_tag_alert(request: Request, qr_id: str, payload: TagAlertIn):
    t = await db.tags.find_one({"qr_id": qr_id})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    owner = await db.users.find_one({"id": t["owner_id"]})
    channels: List[str] = []
    if owner and owner.get("phone"):
        channels.append(owner["phone"])
    alert = {
        "id": new_id(),
        "tag_id": t["id"],
        "vehicle_id": None,
        "user_id": t.get("owner_id"),
        "number_plate": t["name"],
        "type": f"tag_{payload.type}",
        "scanner_note": payload.scanner_note,
        "scanner_phone": payload.scanner_phone,
        "scanner_lat": payload.scanner_lat,
        "scanner_lng": payload.scanner_lng,
        "evidence_photo_base64": payload.evidence_photo_base64,
        "audio_base64": payload.audio_base64,
        "created_at": now_utc(),
        "contact_channels": channels,
    }
    await db.alerts.insert_one(dict(alert))
    prefs = _prefs(owner)
    # Emergency scans (kid needs help / SOS / emergency) ALWAYS broadcast to
    # both guardian and owner regardless of notification prefs — safety override.
    emergency = payload.type in ("kid_help", "sos", "emergency")
    # WhatsApp fan-out to owner + guardian (privacy-safe, mock-ready, gated by prefs unless emergency).
    tag_title = {"kid_help": "KID NEEDS HELP", "sos": "SOS", "emergency": "Emergency"}.get(payload.type, "scanned")
    body = (f"🚨 EMERGENCY — {tag_title}: " if emergency else "") + f"Your Nek Sathi tag '{t['name']}' was {tag_title} via a QR scan."
    if payload.scanner_note:
        body += f" Note: {payload.scanner_note[:100]}"
    if payload.scanner_lat is not None and payload.scanner_lng is not None:
        body += f" Live location: https://maps.google.com/?q={payload.scanner_lat},{payload.scanner_lng}"
    if emergency or prefs.get("whatsapp"):
        if owner and owner.get("phone"):
            wa = await notify_whatsapp(owner["phone"], body, meta={"tag_id": t["id"], "role": "owner", "emergency": emergency})
            if emergency and wa.get("status") == "failed":
                await send_sms(owner["phone"], body, meta={"tag_id": t["id"], "role": "owner", "kind": "emergency_fallback"})
        if t.get("guardian_phone"):
            wa = await notify_whatsapp(t["guardian_phone"], body, meta={"tag_id": t["id"], "role": "guardian", "emergency": emergency})
            if emergency and wa.get("status") == "failed":
                await send_sms(t["guardian_phone"], body, meta={"tag_id": t["id"], "role": "guardian", "kind": "emergency_fallback"})
    # Push notify owner of tag alert (doorbell / lost pet / lost luggage /
    # child-safety live GPS request).
    try:
        if t.get("owner_id") and (emergency or prefs.get("push")):
            type_titles = {
                "doorbell": "🔔 Someone's at your door",
                "door":     "🔔 Someone's at your door",
                "pet":      "🐾 Your pet was found",
                "luggage":  "🧳 Your luggage was scanned",
                "kid":      "👶 Kid tag scanned",
                "kid_help": "🆘 KID NEEDS HELP",
                "key":      "🔑 Keys scanned",
                "device":   "💻 Device scanned",
                "sos":      "🚨 SOS from tag",
                "emergency":"🚨 Emergency scan",
                "theft":    "🔒 Theft alert",
            }
            title = type_titles.get(payload.type, f"Tag scanned: {t.get('name', '')}")
            msg_bits = [t.get("name", "Your tag")]
            if payload.scanner_note:
                msg_bits.append(payload.scanner_note[:80])
            if payload.scanner_lat is not None and payload.scanner_lng is not None:
                msg_bits.append(f"📍 {payload.scanner_lat:.4f},{payload.scanner_lng:.4f}")
            if payload.audio_base64:
                msg_bits.append("🎙️ voice message attached")
            await send_push(
                recipients=[t["owner_id"]],
                data={
                    "title": title,
                    "message": " · ".join(msg_bits),
                    "action_url": "/alerts",
                },
                idempotency_key=alert["id"],
            )
    except Exception as _e:
        log.warning("push (tag alert) failed: %s", _e)
    # Never leak owner phone / contact_channels to anonymous scanners.
    return {"ok": True}


@router.post("/public/tag/{qr_id}/call")
@rate_limit("10/minute")
async def public_tag_call(request: Request, qr_id: str, payload: TagCallIn):
    """Privacy-safe masked call for person/kid/patient tags: connects the
    scanner to the guardian (or owner) through the Nek Sathi portal. The
    guardian/owner number is NEVER returned to the scanner."""
    t = await db.tags.find_one({"qr_id": qr_id})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    owner = await db.users.find_one({"id": t.get("owner_id")})
    target_phone = t.get("guardian_phone") or (owner and owner.get("phone"))
    reporter_phone = (payload.scanner_phone or "").strip()
    live = comms.voice_live() or comms.vobiz_live()
    res = await _bridge_masked_call(reporter_phone, target_phone, kind="tag", ref_id=t["id"])
    status = res.get("status", "mock_connected")
    notes = {
        "calling": "We're calling you now — pick up and we'll connect you privately to the guardian.",
        "connecting": "Connecting you privately via the Nek Sathi portal — the guardian's number stays hidden.",
        "need_phone": "Enter your callback number so we can connect you privately (your number stays hidden).",
        "mock_connected": "Connecting you to the guardian through the Nek Sathi portal — their number stays private.",
    }
    note = notes.get(status, notes["mock_connected"])

    await db.call_records.insert_one({
        "id": new_id(), "tag_id": t["id"], "qr_id": qr_id,
        "reporter_phone": reporter_phone or None, "target_phone": target_phone,  # audit only
        "provider": res.get("provider", "mock"), "portal_number": NEK_PORTAL_NUMBER,
        "call_token": res.get("token"), "number_plate": t.get("name"), "duration_sec": 0,
        "status": status, "kind": "tag_guardian", "created_at": now_utc(),
    })
    if _prefs(owner).get("whatsapp") and target_phone:
        await notify_whatsapp(target_phone, f"Someone scanned your Nek Sathi tag '{t['name']}' and is trying to reach you via the portal.", meta={"tag_id": t["id"], "kind": "call"})
    return {"status": status, "masked": True, "portal_number": NEK_PORTAL_NUMBER, "note": note, "provider": res.get("provider", "mock")}
