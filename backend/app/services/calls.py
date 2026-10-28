from __future__ import annotations

from datetime import timedelta
import os
from typing import Optional
from fastapi import Response
from app.services import comms
from app.config import log
from app.db import db
from app.services.fcm import send_push
from app.services.notify import notify_whatsapp
from app.utils import _aware, new_id, now_utc


async def _incident_recipients(vehicle: dict) -> list[dict]:
    """Owner + opted-in family contacts (name/phone) for an incident."""
    out: list[dict] = []
    owner = await db.users.find_one({"id": vehicle["owner_id"]})
    if owner and owner.get("phone"):
        out.append({"name": owner.get("name", "Owner"), "phone": owner["phone"], "role": "owner"})
    async for c in db.contacts.find({"vehicle_id": vehicle["id"]}):
        if c.get("phone"):
            out.append({"name": c.get("name", "Family"), "phone": c["phone"], "role": c.get("relation", "family")})
    return out


CALL_RING_TIMEOUT_SEC = 45


async def _call_callee_ids(vehicle: dict) -> list[str]:
    """Everyone who should RING for an in-app call about this vehicle: the owner,
    users the vehicle is shared with (accepted share), and the owner's family
    circle. First to answer wins; the rest stop ringing."""
    ids = [vehicle["owner_id"]]
    async for s in db.vehicle_shares.find({"vehicle_id": vehicle["id"], "status": "accepted"}):
        if s.get("shared_with_user_id"):
            ids.append(s["shared_with_user_id"])
    fm = await db.family_members.find_one({"user_id": vehicle["owner_id"]})
    if fm:
        async for m in db.family_members.find({"family_id": fm["family_id"]}):
            if m.get("user_id"):
                ids.append(m["user_id"])
    seen, out = set(), []
    for i in ids:
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out


def _callee_filter(user_id: str) -> dict:
    """Mongo filter: calls this user is a callee of (new calls carry callee_ids;
    older in-flight calls only had owner_id)."""
    return {"$or": [{"callee_ids": user_id}, {"owner_id": user_id}]}


async def _push_call_cancel(c: dict, exclude: Optional[str] = None, reason: str = "ended"):
    """Tell every callee phone to stop ringing NOW (native lock-screen ring +
    notification + full-screen call UI). Sent when the caller hangs up, when the
    ring times out, when everyone declined, or when another member answered."""
    targets = [i for i in (c.get("callee_ids") or [c.get("owner_id")]) if i and i != exclude]
    if not targets:
        return
    try:
        await send_push(recipients=targets, data={
            "type": "call_cancel", "call_id": c["id"], "reason": reason,
            "title": "Call ended", "message": f"The call about {c.get('number_plate', 'your vehicle')} has ended",
            "action_url": "/dashboard"}, idempotency_key=f"cancel-{reason}-{c['id']}", data_only=True)
    except Exception as _e:
        log.warning("call_cancel push failed: %s", _e)


async def _notify_missed_call(c: dict):
    # Stop every phone that is still ringing for this call.
    await _push_call_cancel(c, reason="missed")
    v = await db.vehicles.find_one({"id": c["vehicle_id"]})
    if not v:
        return
    link = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/") + "/dashboard#recent-calls"
    body = (f"📞 Missed call: someone scanned your vehicle {c['number_plate']} and tried to reach you "
            f"on a live Nek Sathi call. See it here: {link}")
    try:
        for r in await _incident_recipients(v):
            await notify_whatsapp(r["phone"], body, meta={"kind": "missed_call", "call_id": c["id"], "role": r["role"]})
    except Exception as _e:
        log.warning("missed-call whatsapp failed: %s", _e)
    try:
        await send_push(recipients=c.get("callee_ids") or [c["owner_id"]], data={
            "title": "📞 Missed call", "message": f"Scanner tried to call about {c['number_plate']}",
            "action_url": "/incidents"}, idempotency_key="miss-" + c["id"])
    except Exception as _e:
        log.warning("missed-call push failed: %s", _e)
    try:
        await db.alerts.insert_one({
            "id": new_id(), "vehicle_id": c["vehicle_id"], "number_plate": c["number_plate"],
            "type": "missed_call", "scanner_note": "Missed in-app live call",
            "scanner_phone": None, "scanner_lat": None, "scanner_lng": None,
            "created_at": now_utc(), "contact_channels": [], "incident_id": None,
        })
    except Exception:
        pass


async def _expire_stale_calls():
    cutoff = now_utc() - timedelta(seconds=CALL_RING_TIMEOUT_SEC)
    async for c in db.webrtc_calls.find({"status": "ringing"}):
        if _aware(c["created_at"]) <= cutoff:
            r = await db.webrtc_calls.update_one(
                {"id": c["id"], "status": "ringing"},
                {"$set": {"status": "missed", "ended_at": now_utc()}})
            if r.modified_count:
                await _notify_missed_call(c)


async def _bridge_masked_call(reporter_phone: Optional[str], targets, *, kind: str, ref_id: str) -> dict:
    """Provider-aware masked call. Prefers Vobiz (real private bridge via a
    masking DID), then MSG91, else mock. `targets` is a phone string or a list
    of numbers (owner + family) that are rung together — whoever answers first
    connects. Target numbers are NEVER returned to the reporter."""
    reporter_phone = (reporter_phone or "").strip()
    if isinstance(targets, str) or targets is None:
        targets = [targets] if targets else []
    # de-dup, keep order, drop blanks
    seen, clean_targets = set(), []
    for t in targets:
        t = (t or "").strip()
        if t and t not in seen:
            seen.add(t)
            clean_targets.append(t)
    if comms.vobiz_live():
        if not reporter_phone:
            return {"status": "need_phone", "provider": "vobiz"}
        token = new_id()
        await db.call_sessions.insert_one({
            "token": token, "reporter": reporter_phone,
            "target": clean_targets[0] if clean_targets else None,
            "targets": clean_targets, "kind": kind, "ref_id": ref_id,
            "created_at": now_utc(), "used": False,
        })
        base = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
        answer_url = f"{base}/api/vobiz/answer?token={token}"
        hangup_url = f"{base}/api/vobiz/hangup?token={token}"
        res = await comms.vobiz_place_call(reporter_phone, answer_url, hangup_url)
        return {"status": "calling" if res.get("ok") else "connecting", "provider": "vobiz", "token": token, "detail": res.get("detail")}
    return await comms.masked_call(reporter_phone, clean_targets[0] if clean_targets else None)


def _vobiz_xml(body: str) -> Response:
    return Response(content=body, media_type="application/xml")


def _mask_phone(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    d = "".join(ch for ch in p if ch.isdigit())
    if len(d) < 4:
        return "****"
    return f"{'+' if p.strip().startswith('+') else ''}{d[:-6]}••••{d[-2:]}" if len(d) > 6 else f"••••{d[-2:]}"
