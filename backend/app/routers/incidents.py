from __future__ import annotations

from datetime import datetime, timedelta, timezone
import base64
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.config import NEK_PORTAL_NUMBER, log
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import IncidentCallIn, IncidentCreateIn, IncidentRespondIn
from app.security import _prefs, current_user
from app.services.calls import _bridge_masked_call, _incident_recipients
from app.services.fcm import send_push
from app.services.notify import notify_whatsapp
from app.utils import _aware, _visible_vehicle_ids, new_id, now_utc

router = APIRouter()


INCIDENT_WINDOW_MIN = 15


INCIDENT_TITLES = {
    "wrong_parking": "🅿️ Wrong parking reported",
    "vehicle_blocking": "🚧 Vehicle blocking reported",
    "headlight_on": "💡 Headlights left ON",
    "door_open": "🚪 Door / window left open",
    "emergency": "🚨 Emergency reported",
    "vehicle_damage": "⚠️ Vehicle damage reported",
    "other": "📢 New alert about your vehicle",
    "accident": "🚨 Accident reported",
    "theft": "🚨 Theft / suspicious activity",
}


WINDOW_TYPES = {"wrong_parking", "vehicle_blocking"}


URGENT_TYPES = {"emergency", "accident", "theft", "vehicle_damage"}


def _incident_body(kind: str, plate: str) -> str:
    return {
        "wrong_parking": f"Your car {plate} has been reported for wrong parking. Someone is trying to alert you. Please move within {INCIDENT_WINDOW_MIN} minutes. Open Nek Sathi to respond: 'I am coming'.",
        "vehicle_blocking": f"Your car {plate} is blocking the way. Please move it within {INCIDENT_WINDOW_MIN} minutes. Open Nek Sathi to respond: 'I am coming'.",
        "headlight_on": f"Heads up — the headlights on your car {plate} appear to be left ON. Someone alerted you via Nek Sathi.",
        "door_open": f"Heads up — a door or window on your car {plate} appears to be open. Someone alerted you via Nek Sathi.",
        "emergency": f"EMERGENCY reported involving your car {plate} via Nek Sathi. Please respond immediately.",
        "vehicle_damage": f"Damage to your car {plate} was reported via Nek Sathi. Please check as soon as possible.",
        "other": f"Someone left an alert about your car {plate} via Nek Sathi. Please check the details.",
        "accident": f"An accident involving your car {plate} was reported via Nek Sathi. Please respond immediately.",
        "theft": f"Suspicious/theft activity reported on your car {plate} via Nek Sathi. Please check immediately.",
    }.get(kind, f"A new alert was reported about your car {plate} via Nek Sathi.")


def _minutes_left(expires_at: datetime) -> int:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    delta = (expires_at - now_utc()).total_seconds() / 60
    return max(0, int(delta + 0.999))


def _incident_public(inc: dict) -> dict:
    """Reporter-facing view — NEVER leaks owner/family numbers."""
    return {
        "id": inc["id"],
        "type": inc["type"],
        "number_plate": inc["number_plate"],
        "status": inc["status"],
        "owner_response": inc.get("owner_response"),
        "minutes_left": _minutes_left(inc["expires_at"]),
        "expires_at": inc["expires_at"],
        "call_available": inc["type"] in URGENT_TYPES or inc["status"] in ("alert_sent", "no_response", "call_attempted"),
        "portal_number": NEK_PORTAL_NUMBER,
        "created_at": inc["created_at"],
    }


@router.post("/public/qr/{qr_id}/incident")
@rate_limit("20/minute")
async def create_incident(request: Request, qr_id: str, payload: IncidentCreateIn):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if not v:
        raise HTTPException(status_code=404, detail="QR not found or vehicle removed")
    # Guard photo payload size (base64) — keep each under ~5MB.
    for _p in (payload.evidence_photo_base64, payload.reporter_photo_base64):
        if _p and len(_p) > 5_000_000:
            raise HTTPException(status_code=413, detail="Photo too large")
    now = now_utc()
    inc_id = new_id()
    incident = {
        "id": inc_id,
        "type": payload.type,
        "qr_id": qr_id,
        "vehicle_id": v["id"],
        "number_plate": v["number_plate"],
        "owner_id": v["owner_id"],
        "scanner_note": payload.scanner_note,
        "scanner_phone": payload.scanner_phone,
        "scanner_lat": payload.scanner_lat,
        "scanner_lng": payload.scanner_lng,
        "evidence_photo_base64": payload.evidence_photo_base64,
        "reporter_photo_base64": payload.reporter_photo_base64,
        "status": "alert_sent",
        "owner_response": None,
        "call_attempted": False,
        "resolved": False,
        "created_at": now,
        "expires_at": now + timedelta(minutes=INCIDENT_WINDOW_MIN),
    }
    await db.incidents.insert_one(dict(incident))

    # Mirror into the unified alerts feed so owner /alerts + admin see it.
    alert_type = "accident_reported" if payload.type == "accident" else payload.type
    await db.alerts.insert_one({
        "id": new_id(), "vehicle_id": v["id"], "number_plate": v["number_plate"],
        "type": alert_type, "scanner_note": payload.scanner_note,
        "scanner_phone": payload.scanner_phone, "scanner_lat": payload.scanner_lat,
        "scanner_lng": payload.scanner_lng, "created_at": now,
        "evidence_photo_base64": payload.evidence_photo_base64,
        "contact_channels": [], "incident_id": inc_id,
    })

    # Notify owner + family via WhatsApp (mock-ready) + push (owner channel pref-gated).
    recipients = await _incident_recipients(v)
    owner_doc = await db.users.find_one({"id": v["owner_id"]})
    op = _prefs(owner_doc)
    title = INCIDENT_TITLES.get(payload.type, "Vehicle alert")
    body = _incident_body(payload.type, v["number_plate"])
    for r in recipients:
        # Family contacts always get alerted; the owner's own channel honours their prefs
        # (urgent reasons bypass prefs so the owner is never left unaware of an emergency).
        urgent = payload.type in URGENT_TYPES
        if r["role"] == "owner" and not urgent and not (op.get("whatsapp") and op.get("incident_alerts")):
            continue
        await notify_whatsapp(r["phone"], body, meta={"incident_id": inc_id, "role": r["role"]})
    try:
        if op.get("push") and op.get("incident_alerts"):
            await send_push(recipients=[v["owner_id"]], data={"title": title, "message": v["number_plate"], "action_url": "/incidents"}, idempotency_key=inc_id)
    except Exception as _e:
        log.warning("push (incident) failed: %s", _e)

    return _incident_public(incident)


@router.get("/incidents/live")
async def live_incidents(user: dict = Depends(current_user)):
    """Lightweight poll for the owner's ACTIVE (unresolved) incidents in the last
    24h — powers the in-portal live alarm (banner + sound + bell)."""
    cutoff = now_utc() - timedelta(hours=24)
    out = []
    async for inc in db.incidents.find({
        "owner_id": user["id"], "resolved": {"$ne": True}, "created_at": {"$gte": cutoff},
    }).sort("created_at", -1).limit(20):
        out.append({
            "id": inc["id"], "type": inc["type"], "number_plate": inc["number_plate"],
            "scanner_note": inc.get("scanner_note"), "created_at": inc["created_at"],
            "minutes_left": _minutes_left(inc["expires_at"]),
        })
    return {"count": len(out), "results": out}


@router.get("/public/incident/{incident_id}")
async def public_incident_status(incident_id: str):
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    # Auto-expire windowed reasons (parking/blocking) to no_response once the window lapses.
    if (not inc.get("resolved") and inc["type"] in WINDOW_TYPES
            and inc["status"] == "alert_sent" and _minutes_left(inc["expires_at"]) == 0):
        await db.incidents.update_one({"id": incident_id}, {"$set": {"status": "no_response"}})
        inc["status"] = "no_response"
    return _incident_public(inc)


@router.post("/public/incident/{incident_id}/call")
@rate_limit("10/minute")
async def public_incident_call(request: Request, incident_id: str, payload: IncidentCallIn):
    """Privacy-safe masked call. Reporter → Nek Sathi portal → owner.
    MOCK unless live telephony creds present. Never returns owner number."""
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    owner = await db.users.find_one({"id": inc["owner_id"]})
    owner_phone = owner and owner.get("phone")
    # Ring the owner AND family contacts together — whoever answers first connects.
    targets = [owner_phone]
    vehicle = await db.vehicles.find_one({"id": inc["vehicle_id"]})
    if vehicle:
        async for c in db.contacts.find({"vehicle_id": vehicle["id"]}):
            if c.get("phone"):
                targets.append(c["phone"])
    reporter_phone = (payload.scanner_phone or inc.get("scanner_phone") or "").strip()
    res = await _bridge_masked_call(reporter_phone, targets, kind="incident", ref_id=incident_id)
    status = res.get("status", "mock_connected")
    notes = {
        "calling": "We're calling you now — pick up and we'll connect you privately to the owner.",
        "connecting": "Connecting you privately to the owner via the Nek Sathi portal — their number stays hidden.",
        "need_phone": "Enter your callback number so we can connect you privately (your number stays hidden).",
        "mock_connected": "Connecting you to the owner through the Nek Sathi portal — their number stays private.",
    }
    note = notes.get(status, notes["mock_connected"])

    rec = {
        "id": new_id(), "incident_id": incident_id, "qr_id": inc["qr_id"],
        "vehicle_id": inc["vehicle_id"], "reporter_phone": reporter_phone or None,
        "owner_phone": owner_phone,  # stored for audit only; NOT returned
        "provider": res.get("provider", "mock"), "portal_number": NEK_PORTAL_NUMBER,
        "call_token": res.get("token"), "number_plate": inc.get("number_plate"),
        "status": status, "duration_sec": 0, "kind": "incident", "created_at": now_utc(),
    }
    await db.call_records.insert_one(dict(rec))
    await db.incidents.update_one({"id": incident_id}, {"$set": {"call_attempted": True}})
    await notify_whatsapp(owner_phone, f"Someone is trying to reach you about your car {inc['number_plate']} via the Nek Sathi portal.", meta={"incident_id": incident_id, "kind": "call"})
    return {
        "status": status,
        "masked": True,
        "portal_number": NEK_PORTAL_NUMBER,
        "note": note,
        "provider": rec["provider"],
    }


@router.get("/incidents")
async def list_incidents(user: dict = Depends(current_user), status: Optional[str] = None, limit: int = 100):
    visible = await _visible_vehicle_ids(user["id"])
    filt: dict = {"vehicle_id": {"$in": visible}} if visible else {"vehicle_id": {"$in": []}}
    if status:
        filt["status"] = status
    out = []
    async for inc in db.incidents.find(filt).sort("created_at", -1).limit(limit):
        out.append({
            "id": inc["id"], "type": inc["type"], "number_plate": inc["number_plate"],
            "status": inc["status"], "owner_response": inc.get("owner_response"),
            "scanner_note": inc.get("scanner_note"), "scanner_phone": inc.get("scanner_phone"),
            "scanner_lat": inc.get("scanner_lat"), "scanner_lng": inc.get("scanner_lng"),
            "evidence_photo_base64": inc.get("evidence_photo_base64"),
            "reporter_photo_base64": inc.get("reporter_photo_base64"),
            "minutes_left": _minutes_left(inc["expires_at"]), "resolved": inc.get("resolved", False),
            "call_attempted": inc.get("call_attempted", False), "created_at": inc["created_at"],
        })
    return {"count": len(out), "results": out}


@router.get("/incidents/status")
async def incidents_status(user: dict = Depends(current_user), limit: int = 100):
    """Lightweight live-sync feed — statuses ONLY, no base64 photos. The Incidents
    screen polls this every few seconds so any family member's 'I am coming' /
    resolve / extend shows up on every other member's screen within seconds,
    without re-downloading incident photos on each poll (keeps mobile data low)."""
    visible = await _visible_vehicle_ids(user["id"])
    filt: dict = {"vehicle_id": {"$in": visible}} if visible else {"vehicle_id": {"$in": []}}
    out = []
    async for inc in db.incidents.find(filt).sort("created_at", -1).limit(limit):
        out.append({
            "id": inc["id"],
            "status": inc["status"],
            "owner_response": inc.get("owner_response"),
            "resolved": inc.get("resolved", False),
            "call_attempted": inc.get("call_attempted", False),
            "minutes_left": _minutes_left(inc["expires_at"]),
        })
    return {"count": len(out), "results": out}


@router.post("/incidents/{incident_id}/respond")
async def respond_incident(incident_id: str, payload: IncidentRespondIn, user: dict = Depends(current_user)):
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    visible = await _visible_vehicle_ids(user["id"])
    if inc["vehicle_id"] not in visible:
        raise HTTPException(status_code=403, detail="Not your vehicle")
    status = "coming" if payload.response == "coming" else "no_response"
    await db.incidents.update_one(
        {"id": incident_id},
        {"$set": {"owner_response": payload.response, "status": status, "acknowledged_at": now_utc()}},
    )
    # Notify the reporter (mock WhatsApp) if they left a number.
    if inc.get("scanner_phone"):
        msg = ("The vehicle owner has been notified and is coming within 15 minutes. Please wait."
               if payload.response == "coming"
               else "The owner is currently unable to respond. You may try the portal call option.")
        await notify_whatsapp(inc["scanner_phone"], msg, meta={"incident_id": incident_id, "kind": "reporter_update"})
    return {"ok": True, "status": status}


@router.post("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, user: dict = Depends(current_user)):
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    visible = await _visible_vehicle_ids(user["id"])
    if inc["vehicle_id"] not in visible:
        raise HTTPException(status_code=403, detail="Not your vehicle")
    await db.incidents.update_one({"id": incident_id}, {"$set": {"status": "resolved", "resolved": True, "resolved_at": now_utc()}})
    # Let the reporter know the outcome so they're never left waiting.
    if inc.get("scanner_phone"):
        await notify_whatsapp(
            inc["scanner_phone"],
            f"Update on {inc['number_plate']}: the owner has resolved this and is on the way / has handled it. Thank you for using Nek Sathi.",
            meta={"incident_id": incident_id, "kind": "reporter_resolved"},
        )
    return {"ok": True, "status": "resolved"}


@router.post("/incidents/{incident_id}/extend")
async def extend_incident(incident_id: str, user: dict = Depends(current_user)):
    """Owner adds 10 more minutes to the response window; reporter's live countdown updates on next poll."""
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    visible = await _visible_vehicle_ids(user["id"])
    if inc["vehicle_id"] not in visible:
        raise HTTPException(status_code=403, detail="Not your vehicle")
    if inc.get("resolved"):
        raise HTTPException(status_code=409, detail="Incident already resolved")
    base = _aware(inc["expires_at"])
    now = now_utc()
    new_expiry = (base if base > now else now) + timedelta(minutes=10)
    await db.incidents.update_one({"id": incident_id}, {"$set": {"expires_at": new_expiry, "status": inc.get("owner_response") == "coming" and "coming" or "alert_sent"}})
    if inc.get("scanner_phone"):
        await notify_whatsapp(
            inc["scanner_phone"],
            f"The owner of {inc['number_plate']} needs a little more time — the window has been extended by 10 minutes. Please wait.",
            meta={"incident_id": incident_id, "kind": "reporter_extended"},
        )
    return {"ok": True, "expires_at": new_expiry.isoformat(), "minutes_left": _minutes_left(new_expiry)}
