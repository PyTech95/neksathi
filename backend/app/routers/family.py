from __future__ import annotations

from datetime import timedelta
import secrets
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import ActivityIn, AlertRulesIn, CheckInIn, CheckInRespondIn, FamilyAddByPhoneIn, FamilyCreateIn, FamilyJoinIn, NudgeIn, SharingIn, StatusIn, ZoneMuteIn
from app.security import current_user
from app.services.background import _build_family_digest, _digest_text, _send_family_digest
from app.services.fcm import send_push
from app.services.geo import _evaluate_geofences, _ist_now
from app.services.notify import notify_whatsapp
from app.utils import _aware, clean, new_id, now_utc

router = APIRouter()


FAMILY_MAX = 5


async def _my_family(user_id: str) -> Optional[dict]:
    fm = await db.family_members.find_one({"user_id": user_id})
    if not fm:
        return None
    return await db.families.find_one({"id": fm["family_id"]})


@router.post("/family")
async def create_family(payload: FamilyCreateIn, user: dict = Depends(current_user)):
    if await db.family_members.find_one({"user_id": user["id"]}):
        raise HTTPException(status_code=400, detail="You are already in a family circle.")
    fam = {"id": new_id(), "name": payload.name, "guardian_id": user["id"],
           "invite_code": secrets.token_hex(3).upper(), "max_members": FAMILY_MAX, "created_at": now_utc()}
    await db.families.insert_one(dict(fam))
    await db.family_members.insert_one({"id": new_id(), "family_id": fam["id"], "user_id": user["id"],
                                        "role": "guardian", "name": user.get("name", "Guardian"),
                                        "share_location": True, "share_activity": True, "joined_at": now_utc()})
    return {"id": fam["id"], "name": fam["name"], "invite_code": fam["invite_code"], "is_guardian": True}


@router.post("/family/join")
async def join_family(payload: FamilyJoinIn, user: dict = Depends(current_user)):
    if await db.family_members.find_one({"user_id": user["id"]}):
        raise HTTPException(status_code=400, detail="You are already in a family circle.")
    fam = await db.families.find_one({"invite_code": payload.invite_code.strip().upper()})
    if not fam:
        raise HTTPException(status_code=404, detail="Invalid invite code.")
    if await db.family_members.count_documents({"family_id": fam["id"]}) >= fam.get("max_members", FAMILY_MAX):
        raise HTTPException(status_code=400, detail="This family circle is full.")
    await db.family_members.insert_one({"id": new_id(), "family_id": fam["id"], "user_id": user["id"],
                                        "role": "member", "name": user.get("name", "Member"),
                                        "share_location": True, "share_activity": True, "joined_at": now_utc()})
    return {"joined": True, "family_name": fam["name"]}


@router.post("/family/add-by-phone")
async def family_add_by_phone(payload: FamilyAddByPhoneIn, user: dict = Depends(current_user)):
    """Guardian adds a family member straight by their mobile number. The number
    must belong to a Nek Sathi account — that's how the app knows which phone to
    push the intruder alert to. (If they're not on Nek Sathi yet, share the
    invite code; they join once they install and sign up with that number.)"""
    fam = await _my_family(user["id"])
    if not fam or fam["guardian_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the guardian can add family members.")
    if await db.family_members.count_documents({"family_id": fam["id"]}) >= fam.get("max_members", FAMILY_MAX):
        raise HTTPException(status_code=400, detail="This family circle is full.")
    raw = payload.phone.strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    candidates = [c for c in {raw, digits, digits[-10:] if len(digits) >= 10 else ""} if c]
    target = None
    for c in candidates:
        target = await db.users.find_one({"phone": c})
        if not target:
            target = await db.users.find_one({"phone": {"$regex": c + "$"}})
        if target:
            break
    if not target:
        raise HTTPException(status_code=404, detail="No Nek Sathi account uses this number yet. Ask them to install the app and sign up with this number, or share your invite code — then they can join.")
    if await db.family_members.find_one({"user_id": target["id"]}):
        raise HTTPException(status_code=400, detail="This person is already in a family circle.")
    await db.family_members.insert_one({"id": new_id(), "family_id": fam["id"], "user_id": target["id"],
                                        "role": "member", "name": payload.name or target.get("name", "Member"),
                                        "phone": target.get("phone"),
                                        "share_location": True, "share_activity": True, "joined_at": now_utc()})
    return {"added": True, "name": payload.name or target.get("name"), "user_id": target["id"]}


@router.get("/family/intruder-alerts")
async def family_intruder_alerts(user: dict = Depends(current_user), limit: int = 50):
    """Intruder captures across the whole family circle — each member's stolen /
    locked phone front-camera photo + location. This is the family view the user
    asked for: tap Location to see where the phone is, and see the photo inline."""
    fam = await _my_family(user["id"])
    if not fam:
        return {"in_family": False, "items": []}
    names, ids = {}, []
    async for m in db.family_members.find({"family_id": fam["id"]}):
        if m.get("user_id"):
            names[m["user_id"]] = m.get("name")
            ids.append(m["user_id"])
    items = []
    async for e in db.intruder_events.find({"user_id": {"$in": ids}}).sort("created_at", -1).limit(min(limit, 200)):
        items.append({
            "id": e["id"],
            "owner_name": names.get(e.get("user_id")) or "Family member",
            "is_me": e.get("user_id") == user["id"],
            "device_name": e.get("device_name"),
            "attempt_count": e.get("attempt_count"),
            "triggered_lock": bool(e.get("triggered_lock")),
            "photo_base64": e.get("photo_base64"),
            "has_photo": bool(e.get("photo_base64")),
            "latitude": e.get("latitude"), "longitude": e.get("longitude"),
            "created_at": _aware(e.get("created_at")),
        })
    return {"in_family": True, "items": items}


@router.get("/family")
async def get_family(user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam:
        return {"in_family": False}
    is_guardian = fam["guardian_id"] == user["id"]
    members = []
    async for m in db.family_members.find({"family_id": fam["id"]}):
        loc = await db.user_locations.find_one({"user_id": m["user_id"]})
        # Guardian sees members' location/last-seen only when the member shares it.
        show_loc = m.get("share_location", True) or m["user_id"] == user["id"]
        members.append({
            "member_id": m["id"], "user_id": m["user_id"], "name": m.get("name"), "role": m.get("role"),
            "is_me": m["user_id"] == user["id"],
            "share_location": m.get("share_location", True), "share_activity": m.get("share_activity", True),
            "latitude": (loc or {}).get("latitude") if (loc and show_loc) else None,
            "longitude": (loc or {}).get("longitude") if (loc and show_loc) else None,
            "battery": (loc or {}).get("battery") if (loc and show_loc) else None,
            "last_seen": (loc or {}).get("recorded_at") if (loc and show_loc) else None,
        })
    return {"in_family": True, "id": fam["id"], "name": fam["name"], "is_guardian": is_guardian,
            "invite_code": fam["invite_code"] if is_guardian else None,
            "max_members": fam.get("max_members", FAMILY_MAX), "members": members}


@router.put("/family/my-sharing")
async def update_my_sharing(payload: SharingIn, user: dict = Depends(current_user)):
    r = await db.family_members.update_one({"user_id": user["id"]}, {"$set": payload.model_dump()})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="You are not in a family circle.")
    return {"updated": True}


@router.post("/family/leave")
async def leave_family(user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam:
        raise HTTPException(status_code=400, detail="You are not in a family circle.")
    if fam["guardian_id"] == user["id"]:
        # Guardian leaving dissolves the circle (cascade activity for privacy).
        await db.family_members.delete_many({"family_id": fam["id"]})
        await db.activity_reports.delete_many({"family_id": fam["id"]})
        await db.families.delete_one({"id": fam["id"]})
        return {"left": True, "dissolved": True}
    await db.family_members.delete_one({"user_id": user["id"], "family_id": fam["id"]})
    await db.activity_reports.delete_many({"family_id": fam["id"], "user_id": user["id"]})
    return {"left": True}


@router.delete("/family/members/{member_id}")
async def remove_member(member_id: str, user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam or fam["guardian_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the guardian can remove members.")
    m = await db.family_members.find_one({"id": member_id, "family_id": fam["id"]})
    if not m or m["role"] == "guardian":
        raise HTTPException(status_code=400, detail="Cannot remove this member.")
    await db.family_members.delete_one({"id": member_id})
    await db.activity_reports.delete_many({"family_id": fam["id"], "user_id": m["user_id"]})
    return {"removed": True}


@router.post("/me/status")
async def push_status(payload: StatusIn, user: dict = Depends(current_user)):
    upd = {"user_id": user["id"], "recorded_at": now_utc()}
    if payload.battery is not None:
        upd["battery"] = payload.battery
    transitions = []
    if payload.latitude is not None and payload.longitude is not None:
        upd["latitude"] = payload.latitude
        upd["longitude"] = payload.longitude
    await db.user_locations.update_one({"user_id": user["id"]}, {"$set": upd}, upsert=True)
    await _maybe_low_battery_alert(user, payload.battery)
    if payload.latitude is not None and payload.longitude is not None:
        transitions = await _evaluate_geofences(user, payload.latitude, payload.longitude)
    return {"ok": True, "transitions": transitions}


async def _maybe_low_battery_alert(user: dict, battery: Optional[int]):
    """Alert the family guardian once when a member's battery drops below the
    guardian's chosen threshold. Re-arms after charging back to threshold+5%."""
    if battery is None:
        return
    fm = await db.family_members.find_one({"user_id": user["id"]})
    if not fm:
        return
    fam = await db.families.find_one({"id": fm["family_id"]})
    if not fam or not fam.get("guardian_id") or fam["guardian_id"] == user["id"]:
        return
    threshold = int(fam.get("low_battery_threshold", 15))
    rearm = threshold + 5
    prior = await db.user_locations.find_one({"user_id": user["id"]})
    was = bool((prior or {}).get("low_batt_notified"))
    if battery >= rearm and was:
        await db.user_locations.update_one({"user_id": user["id"]}, {"$set": {"low_batt_notified": False}})
        return
    if battery >= threshold or was:
        return
    await db.user_locations.update_one({"user_id": user["id"]}, {"$set": {"low_batt_notified": True}})
    who = user.get("name") or "Your family member"
    msg = f"{who}'s phone battery is low ({battery}%). You may want to check in."
    try:
        await send_push(recipients=[fam["guardian_id"]], data={
            "title": "🔋 Low battery", "message": msg, "action_url": "/family"}, idempotency_key=new_id())
    except Exception:
        pass
    guardian = await db.users.find_one({"id": fam["guardian_id"]})
    if guardian and guardian.get("phone"):
        try:
            await notify_whatsapp(guardian["phone"], f"🔋 Nek Sathi: {msg}", meta={"kind": "low_battery", "user_id": user["id"]})
        except Exception:
            pass


@router.post("/family/activity")
@rate_limit("60/minute")
async def report_activity(request: Request, payload: ActivityIn, user: dict = Depends(current_user)):
    fm = await db.family_members.find_one({"user_id": user["id"]})
    if not fm:
        raise HTTPException(status_code=400, detail="Join a family circle first.")
    if not fm.get("share_activity", True):
        return {"stored": False, "reason": "activity sharing off"}
    doc = {"id": new_id(), "family_id": fm["family_id"], "user_id": user["id"],
           "type": payload.type, "app_name": payload.app_name, "seconds": payload.seconds,
           "note": payload.note, "battery": payload.battery, "created_at": now_utc()}
    await db.activity_reports.insert_one(dict(doc))
    return {"stored": True}


@router.get("/family/members/{member_id}/activity")
async def member_activity(member_id: str, user: dict = Depends(current_user), limit: int = 50):
    fam = await _my_family(user["id"])
    if not fam:
        raise HTTPException(status_code=404, detail="Not in a family circle.")
    m = await db.family_members.find_one({"id": member_id, "family_id": fam["id"]})
    if not m:
        raise HTTPException(status_code=404, detail="Member not found.")
    # Only the guardian (or the member themselves) may read, and only if shared.
    if user["id"] != m["user_id"] and fam["guardian_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed.")
    if not m.get("share_activity", True) and user["id"] != m["user_id"]:
        return {"shared": False, "items": []}
    items = []
    async for a in db.activity_reports.find({"user_id": m["user_id"]}).sort("created_at", -1).limit(min(limit, 200)):
        items.append(clean(a))
    # Aggregate screen-time / app-usage totals for today.
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    totals = {}
    async for a in db.activity_reports.find({"user_id": m["user_id"], "type": {"$in": ["app_usage", "screen_time"]}, "created_at": {"$gte": today}}):
        key = a.get("app_name") or a.get("type")
        totals[key] = totals.get(key, 0) + (a.get("seconds") or 0)
    return {"shared": True, "member_name": m.get("name"), "items": items, "today_totals": totals}


@router.get("/family/place-events")
async def family_place_events(user: dict = Depends(current_user), limit: int = 60):
    """Timeline of who arrived at / left each safe place across the circle.
    Guardian sees all location-sharing members; a member sees only their own."""
    fam = await _my_family(user["id"])
    if not fam:
        return {"in_family": False, "items": []}
    is_guardian = fam["guardian_id"] == user["id"]
    names, allowed = {}, []
    async for m in db.family_members.find({"family_id": fam["id"]}):
        names[m["user_id"]] = m.get("name")
        if m["user_id"] == user["id"] or (is_guardian and m.get("share_location", True)):
            allowed.append(m["user_id"])
    items = []
    async for e in db.geofence_events.find({"user_id": {"$in": allowed}}).sort("created_at", -1).limit(min(limit, 200)):
        items.append({"id": e["id"], "member_name": names.get(e.get("user_id")) or "Member",
                      "zone_name": e.get("zone_name"), "type": e.get("type"), "created_at": e.get("created_at")})
    return {"in_family": True, "is_guardian": is_guardian, "items": items}


@router.get("/family/alert-rules")
async def get_alert_rules(user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam:
        raise HTTPException(status_code=404, detail="Not in a family circle.")
    return {"is_guardian": fam["guardian_id"] == user["id"],
            "place_alerts_enabled": fam.get("place_alerts_enabled", True),
            "place_alert_direction": fam.get("place_alert_direction", "both"),
            "quiet_start": fam.get("quiet_start"), "quiet_end": fam.get("quiet_end"),
            "low_battery_threshold": fam.get("low_battery_threshold", 15),
            "sos_escalation_min": fam.get("sos_escalation_min", 3),
            "digest_day": fam.get("digest_day", 6), "digest_hour": fam.get("digest_hour", 9)}


@router.put("/family/alert-rules")
async def put_alert_rules(payload: AlertRulesIn, user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam or fam["guardian_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the guardian can change alert rules.")
    await db.families.update_one({"id": fam["id"]}, {"$set": payload.model_dump()})
    return {"updated": True, **payload.model_dump()}


@router.get("/family/zones")
async def family_zones(user: dict = Depends(current_user)):
    """List safe zones across the circle so the guardian can mute alerts for
    specific places (e.g. the member's own home)."""
    fam = await _my_family(user["id"])
    if not fam:
        raise HTTPException(status_code=404, detail="Not in a family circle.")
    is_guardian = fam["guardian_id"] == user["id"]
    names, ids = {}, []
    async for m in db.family_members.find({"family_id": fam["id"]}):
        names[m["user_id"]] = m.get("name")
        if m["user_id"] == user["id"] or (is_guardian and m.get("share_location", True)):
            ids.append(m["user_id"])
    muted = set(fam.get("muted_zones", []))
    items = []
    async for z in db.safe_zones.find({"user_id": {"$in": ids}}):
        items.append({"id": z["id"], "name": z.get("name"), "member_name": names.get(z["user_id"]),
                      "muted": z["id"] in muted})
    return {"is_guardian": is_guardian, "items": items}


@router.put("/family/zones/{zone_id}/mute")
async def mute_family_zone(zone_id: str, payload: ZoneMuteIn, user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam or fam["guardian_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the guardian can mute places.")
    op = "$addToSet" if payload.muted else "$pull"
    await db.families.update_one({"id": fam["id"]}, {op: {"muted_zones": zone_id}})
    return {"zone_id": zone_id, "muted": payload.muted}


@router.post("/family/check-in")
async def request_check_in(payload: CheckInIn, user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam or fam["guardian_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the guardian can request a check-in.")
    m = await db.family_members.find_one({"id": payload.member_id, "family_id": fam["id"]})
    if not m or m["user_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Pick a family member.")
    doc = {"id": new_id(), "family_id": fam["id"], "guardian_id": user["id"],
           "member_user_id": m["user_id"], "member_name": m.get("name"),
           "guardian_name": user.get("name"), "status": "pending", "created_at": now_utc()}
    await db.check_ins.insert_one(dict(doc))
    msg = f"{user.get('name','Your guardian')} is checking in — are you okay? Open Nek Sathi to reply."
    try:
        await send_push(recipients=[m["user_id"]], data={"title": "👋 Are you okay?", "message": msg, "action_url": "/family"}, idempotency_key=doc["id"])
    except Exception:
        pass
    mu = await db.users.find_one({"id": m["user_id"]})
    if mu and mu.get("phone"):
        try:
            await notify_whatsapp(mu["phone"], f"👋 Nek Sathi check-in: {msg}", meta={"kind": "check_in", "user_id": m["user_id"]})
        except Exception:
            pass
    return {"requested": True, "id": doc["id"]}


@router.get("/family/check-ins")
async def list_check_ins(user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam:
        return {"incoming": [], "outgoing": []}
    incoming, outgoing = [], []
    async for c in db.check_ins.find({"member_user_id": user["id"], "status": "pending"}).sort("created_at", -1).limit(10):
        incoming.append(clean(c))
    if fam["guardian_id"] == user["id"]:
        async for c in db.check_ins.find({"guardian_id": user["id"]}).sort("created_at", -1).limit(20):
            outgoing.append(clean(c))
    return {"incoming": incoming, "outgoing": outgoing}


@router.post("/family/check-in/{check_id}/respond")
async def respond_check_in(check_id: str, payload: CheckInRespondIn, user: dict = Depends(current_user)):
    c = await db.check_ins.find_one({"id": check_id, "member_user_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Check-in not found.")
    await db.check_ins.update_one({"id": check_id}, {"$set": {"status": payload.status, "responded_at": now_utc()}})
    who = user.get("name") or "Your family member"
    verb = "is safe ✅" if payload.status == "safe" else "needs help ‼️"
    msg = f"{who} replied to your check-in: {who} {verb}."
    try:
        await send_push(recipients=[c["guardian_id"]], data={"title": "Check-in reply", "message": msg, "action_url": "/family"}, idempotency_key=new_id())
    except Exception:
        pass
    g = await db.users.find_one({"id": c["guardian_id"]})
    if g and g.get("phone"):
        try:
            await notify_whatsapp(g["phone"], f"Nek Sathi: {msg}", meta={"kind": "check_in_reply", "user_id": c["guardian_id"]})
        except Exception:
            pass
    return {"responded": True, "status": payload.status}


@router.get("/family/active-sos")
async def family_active_sos(user: dict = Depends(current_user)):
    """Live pins of any member's active (unacknowledged, last 2h) SOS so the
    guardian can head over."""
    fam = await _my_family(user["id"])
    if not fam:
        return {"items": []}
    is_guardian = fam["guardian_id"] == user["id"]
    names, ids = {}, []
    async for m in db.family_members.find({"family_id": fam["id"]}):
        names[m["user_id"]] = m.get("name")
        if is_guardian or m["user_id"] == user["id"]:
            ids.append(m["user_id"])
    since = now_utc() - timedelta(hours=2)
    items = []
    async for s in db.sos_events.find({"user_id": {"$in": ids}, "acknowledged": {"$ne": True},
                                       "created_at": {"$gte": since}}).sort("created_at", -1):
        items.append({"id": s["id"], "member_name": names.get(s["user_id"]) or "Member",
                      "member_user_id": s["user_id"],
                      "latitude": s.get("latitude"), "longitude": s.get("longitude"),
                      "message": s.get("message"), "escalated": bool(s.get("escalated")),
                      # explicit UTC so phones show local time, not the raw UTC clock
                      "created_at": _aware(s.get("created_at")),
                      "can_resolve": is_guardian or s["user_id"] == user["id"]})
    return {"items": items}


@router.post("/family/sos/{sos_id}/resolve")
async def family_resolve_sos(sos_id: str, user: dict = Depends(current_user)):
    """Mark a member's SOS handled. Allowed for the member themselves or the
    guardian of their circle — so an alert never stays stuck for 2 hours just
    because the member closed the app before tapping "I'm safe"."""
    s = await db.sos_events.find_one({"id": sos_id})
    if not s:
        raise HTTPException(status_code=404, detail="SOS not found.")
    allowed = s["user_id"] == user["id"]
    if not allowed:
        fam = await _my_family(user["id"])
        if fam and fam["guardian_id"] == user["id"]:
            m = await db.family_members.find_one({"family_id": fam["id"], "user_id": s["user_id"]})
            allowed = m is not None
    if not allowed:
        raise HTTPException(status_code=403, detail="Only the member or their guardian can mark this SOS handled.")
    await db.sos_events.update_one({"id": sos_id}, {"$set": {"acknowledged": True, "acknowledged_at": now_utc(), "acknowledged_by": user["id"]}})
    return {"ok": True, "acknowledged": True}


@router.post("/family/nudge")
async def nudge_member(payload: NudgeIn, user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam or fam["guardian_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the guardian can nudge a member.")
    m = await db.family_members.find_one({"id": payload.member_id, "family_id": fam["id"]})
    if not m or m["user_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Pick a family member.")
    await db.nudges.update_many({"member_user_id": m["user_id"], "active": True}, {"$set": {"active": False}})
    doc = {"id": new_id(), "family_id": fam["id"], "guardian_id": user["id"], "guardian_name": user.get("name"),
           "member_user_id": m["user_id"], "active": True, "created_at": now_utc()}
    await db.nudges.insert_one(dict(doc))
    msg = f"{user.get('name','Your guardian')} is trying to reach you — please open Nek Sathi now."
    try:
        await send_push(recipients=[m["user_id"]], data={"title": "🔔 Please respond", "message": msg, "action_url": "/family"}, idempotency_key=doc["id"])
    except Exception:
        pass
    mu = await db.users.find_one({"id": m["user_id"]})
    if mu and mu.get("phone"):
        try:
            await notify_whatsapp(mu["phone"], f"🔔 Nek Sathi: {msg}", meta={"kind": "nudge", "user_id": m["user_id"]})
        except Exception:
            pass
    return {"nudged": True, "id": doc["id"]}


@router.get("/family/nudge-state")
async def nudge_state(user: dict = Depends(current_user)):
    n = await db.nudges.find_one({"member_user_id": user["id"], "active": True}, sort=[("created_at", -1)])
    if not n:
        return {"active": False}
    return {"active": True, "id": n["id"], "guardian_name": n.get("guardian_name"), "created_at": n.get("created_at")}


@router.post("/family/nudge/clear")
async def nudge_clear(user: dict = Depends(current_user)):
    await db.nudges.update_many({"member_user_id": user["id"], "active": True}, {"$set": {"active": False, "cleared_at": now_utc()}})
    return {"cleared": True}


@router.get("/family/digest")
async def family_digest(user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam:
        return {"in_family": False}
    d = await _build_family_digest(fam)
    log_row = await db.digest_log.find_one({"family_id": fam["id"]}, sort=[("sent_at", -1)])
    return {"in_family": True, "is_guardian": fam["guardian_id"] == user["id"],
            "last_sent_at": (log_row or {}).get("sent_at"), "preview_text": _digest_text(d), **d}


@router.post("/family/digest/send")
async def family_digest_send(user: dict = Depends(current_user)):
    fam = await _my_family(user["id"])
    if not fam or fam["guardian_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the guardian can send the digest.")
    res = await _send_family_digest(fam)
    week = _ist_now().strftime("%G-W%V")
    await db.digest_log.update_one({"family_id": fam["id"], "week": week},
                                   {"$set": {"sent_at": now_utc(), "manual": True}}, upsert=True)
    return res
