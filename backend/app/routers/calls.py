from __future__ import annotations

from datetime import timedelta
import os
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.services import comms
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import RTCCandidateIn, RTCDescriptionIn
from app.security import current_user, require_admin
from app.services.calls import CALL_RING_TIMEOUT_SEC, _call_callee_ids, _callee_filter, _expire_stale_calls, _mask_phone, _notify_missed_call, _vobiz_xml
from app.services.fcm import send_push
from app.utils import _aware, new_id, now_utc

router = APIRouter()


@router.post("/vobiz/sos-answer")
async def vobiz_sos_answer(token: str = ""):
    sess = await db.sos_call_sessions.find_one({"token": token}) if token else None
    msg = (sess or {}).get("message") or "Urgent SOS alert from Nek Sathi. Please check on your family member."
    xml = (f'<?xml version="1.0" encoding="UTF-8"?><Response><Speak>{msg}</Speak>'
           f'<Speak>{msg}</Speak><Hangup/></Response>')
    return _vobiz_xml(xml)


@router.post("/public/qr/{qr_id}/call/start")
@rate_limit("15/minute")
async def rtc_call_start(request: Request, qr_id: str):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if not v:
        raise HTTPException(status_code=404, detail="QR not found or vehicle removed")
    await _expire_stale_calls()
    now = now_utc()
    # Simul-ring: owner + family. First to answer wins; the others stop ringing.
    callee_ids = await _call_callee_ids(v)
    call = {
        "id": new_id(), "qr_id": qr_id, "vehicle_id": v["id"], "number_plate": v["number_plate"],
        "owner_id": v["owner_id"], "callee_ids": callee_ids, "answered_by": None, "rejected_by": [],
        "status": "ringing",
        "caller_offer": None, "callee_answer": None,
        "caller_candidates": [], "callee_candidates": [],
        "created_at": now, "updated_at": now, "answered_at": None, "ended_at": None,
    }
    await db.webrtc_calls.insert_one(dict(call))
    try:
        await send_push(recipients=callee_ids, data={
            # keys the native CallMessagingService looks for (full-screen call UI)
            "type": "incoming_call",
            "call_id": call["id"],
            "number_plate": v["number_plate"],
            "title": "📞 Incoming call", "message": f"Someone is calling about {v['number_plate']}",
            "action_url": "/dashboard"}, idempotency_key="ring-" + call["id"], data_only=True)
    except Exception:
        pass
    return {"call_id": call["id"]}


@router.post("/public/call/{call_id}/offer")
async def rtc_caller_offer(call_id: str, payload: RTCDescriptionIn):
    r = await db.webrtc_calls.update_one(
        {"id": call_id, "status": {"$in": ["ringing", "accepted"]}},
        {"$set": {"caller_offer": payload.sdp, "updated_at": now_utc()}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Call not available")
    return {"ok": True}


@router.post("/public/call/{call_id}/candidate")
async def rtc_caller_candidate(call_id: str, payload: RTCCandidateIn):
    r = await db.webrtc_calls.update_one({"id": call_id}, {"$push": {"caller_candidates": payload.candidate}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Call not found")
    return {"ok": True}


@router.get("/public/call/{call_id}")
async def rtc_caller_poll(call_id: str):
    c = await db.webrtc_calls.find_one({"id": call_id})
    if not c:
        raise HTTPException(status_code=404, detail="Call not found")
    if c["status"] == "ringing" and _aware(c["created_at"]) <= now_utc() - timedelta(seconds=CALL_RING_TIMEOUT_SEC):
        await db.webrtc_calls.update_one({"id": call_id, "status": "ringing"}, {"$set": {"status": "missed", "ended_at": now_utc()}})
        await _notify_missed_call(c)
        c["status"] = "missed"
    return {"status": c["status"], "answer": c.get("callee_answer"), "callee_candidates": c.get("callee_candidates", [])}


@router.post("/public/call/{call_id}/end")
async def rtc_caller_end(call_id: str):
    await db.webrtc_calls.update_one(
        {"id": call_id, "status": {"$nin": ["missed", "rejected"]}},
        {"$set": {"status": "ended", "ended_at": now_utc()}})
    return {"ok": True}


@router.get("/me/calls/incoming")
async def rtc_incoming_calls(user: dict = Depends(current_user)):
    await _expire_stale_calls()
    out = []
    # Ringing calls this user is a callee of (owner OR family), excluding ones
    # they personally declined (a decline by one member doesn't stop the others).
    q = {**_callee_filter(user["id"]), "status": "ringing", "rejected_by": {"$nin": [user["id"]]}}
    async for c in db.webrtc_calls.find(q).sort("created_at", -1):
        out.append({"call_id": c["id"], "number_plate": c["number_plate"],
                    "created_at": c["created_at"], "has_offer": bool(c.get("caller_offer"))})
    return {"items": out}


@router.get("/me/calls/recent")
async def rtc_recent_calls(user: dict = Depends(current_user), limit: int = 20):
    """Recent in-app calls for the owner (incl. missed) so nothing is lost."""
    await _expire_stale_calls()
    out = []
    async for c in db.webrtc_calls.find({**_callee_filter(user["id"]), "status": {"$ne": "ringing"}}).sort("created_at", -1).limit(min(limit, 50)):
        out.append({
            "id": c["id"], "number_plate": c["number_plate"], "status": c["status"],
            "created_at": c["created_at"], "answered_at": c.get("answered_at"), "ended_at": c.get("ended_at"),
        })
    missed = sum(1 for c in out if c["status"] == "missed")
    return {"items": out, "missed": missed}


@router.get("/me/calls/{call_id}")
async def rtc_owner_poll(call_id: str, user: dict = Depends(current_user)):
    c = await db.webrtc_calls.find_one({"id": call_id, **_callee_filter(user["id"])})
    if not c:
        raise HTTPException(status_code=404, detail="Call not found")
    ab = c.get("answered_by")
    return {"status": c["status"], "offer": c.get("caller_offer"), "caller_candidates": c.get("caller_candidates", []),
            # Lets a still-ringing phone know another family member already picked up.
            "answered_by_me": (ab == user["id"]) if ab else None}


@router.post("/me/calls/{call_id}/accept")
async def rtc_accept_call(call_id: str, payload: RTCDescriptionIn, user: dict = Depends(current_user)):
    # Atomic: only the FIRST callee to accept flips ringing -> accepted.
    r = await db.webrtc_calls.update_one(
        {"id": call_id, **_callee_filter(user["id"]), "status": "ringing"},
        {"$set": {"callee_answer": payload.sdp, "status": "accepted", "answered_by": user["id"],
                  "answered_at": now_utc(), "updated_at": now_utc()}})
    if not r.matched_count:
        raise HTTPException(status_code=409, detail="Call no longer available")
    # Tell every OTHER callee to stop ringing right away (native lock-screen ring
    # + in-app ring). Their in-app poll also sees answered_by_me=false.
    c = await db.webrtc_calls.find_one({"id": call_id})
    others = [i for i in (c or {}).get("callee_ids", []) if i != user["id"]]
    if others:
        try:
            await send_push(recipients=others, data={
                "type": "call_cancel", "call_id": call_id,
                "title": "Call answered", "message": f"Another family member answered the call about {c['number_plate']}",
                "action_url": "/dashboard"}, idempotency_key="cancel-" + call_id, data_only=True)
        except Exception:
            pass
    return {"ok": True}


@router.post("/me/calls/{call_id}/reject")
async def rtc_reject_call(call_id: str, user: dict = Depends(current_user)):
    """One member declining removes only THEM from the ring; the call ends as
    'rejected' only once every callee has declined."""
    c = await db.webrtc_calls.find_one({"id": call_id, **_callee_filter(user["id"]), "status": "ringing"})
    if not c:
        return {"ok": True}
    callees = c.get("callee_ids") or [c["owner_id"]]
    rejected = set(c.get("rejected_by", [])) | {user["id"]}
    if set(callees) <= rejected:
        await db.webrtc_calls.update_one(
            {"id": call_id, "status": "ringing"},
            {"$set": {"status": "rejected", "rejected_by": sorted(rejected), "ended_at": now_utc()}})
    else:
        await db.webrtc_calls.update_one({"id": call_id}, {"$addToSet": {"rejected_by": user["id"]}})
    return {"ok": True}


@router.post("/me/calls/{call_id}/candidate")
async def rtc_owner_candidate(call_id: str, payload: RTCCandidateIn, user: dict = Depends(current_user)):
    await db.webrtc_calls.update_one({"id": call_id, **_callee_filter(user["id"])}, {"$push": {"callee_candidates": payload.candidate}})
    return {"ok": True}


@router.post("/me/calls/{call_id}/end")
async def rtc_owner_end(call_id: str, user: dict = Depends(current_user)):
    # Only the member who answered (or anyone while still ringing) may end it —
    # a member who lost the answer race must not hang up the winner's call.
    c = await db.webrtc_calls.find_one({"id": call_id, **_callee_filter(user["id"])})
    if not c:
        return {"ok": True}
    if c.get("answered_by") and c["answered_by"] != user["id"]:
        return {"ok": False, "detail": "Call is active with another member"}
    await db.webrtc_calls.update_one({"id": call_id}, {"$set": {"status": "ended", "ended_at": now_utc()}})
    return {"ok": True}


@router.post("/vobiz/answer")
async def vobiz_answer(token: str = ""):
    """Vobiz fetches this when the reporter answers; we return XML that simul-rings
    the owner + family with the masking DID as caller id (their numbers stay hidden)."""
    sess = await db.call_sessions.find_one({"token": token}) if token else None
    targets = (sess.get("targets") if sess else None) or ([sess["target"]] if sess and sess.get("target") else [])
    if not targets:
        return _vobiz_xml('<?xml version="1.0" encoding="UTF-8"?><Response><Speak>This call is unavailable.</Speak><Hangup/></Response>')
    did = comms.vobiz_did()
    base = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    action = f"{base}/api/vobiz/dial-result?token={token}"
    rec_cb = f"{base}/api/vobiz/recording?token={token}"
    await db.call_sessions.update_one({"token": token}, {"$set": {"used": True, "bridged_at": now_utc()}})
    numbers = "".join(f"<Number>{comms.e164(t)}</Number>" for t in targets)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>'
           '<Response>'
           '<Speak>Please hold. Connecting you privately to the vehicle owner.</Speak>'
           f'<Record fileFormat="mp3" recordSession="true" maxLength="3600" callbackUrl="{rec_cb}" callbackMethod="POST" redirect="false" playBeep="false"/>'
           f'<Dial callerId="{did}" timeout="35" timeLimit="3600" action="{action}" method="POST" redirect="false">'
           f'{numbers}</Dial>'
           '<Speak>The owner is not available right now. Please try again later.</Speak><Hangup/></Response>')
    return _vobiz_xml(xml)


@router.post("/vobiz/recording")
async def vobiz_recording(request: Request, token: str = ""):
    """Vobiz posts here when the call recording is ready. Store the URL on the
    matching call record so admins can review disputed reports."""
    try:
        form = dict(await request.form())
    except Exception:
        form = {}
    url = (form.get("RecordUrl") or form.get("RecordingUrl") or form.get("recording_url")
           or form.get("RecordFile") or form.get("Url") or "")
    dur = 0
    try:
        dur = int(float(form.get("RecordingDuration") or form.get("Duration") or 0))
    except Exception:
        dur = 0
    if token and url:
        upd = {"recording_url": url}
        if dur:
            upd["recording_duration"] = dur
        await db.call_records.update_one({"call_token": token}, {"$set": upd})
    await db.call_records.insert_one({"id": new_id(), "kind": "vobiz_recording", "call_token": token, "detail": form, "created_at": now_utc()})
    return {"status": "received"}


@router.post("/vobiz/dial-result")
async def vobiz_dial_result(request: Request, token: str = ""):
    try:
        form = dict(await request.form())
    except Exception:
        form = {}
    dur = 0
    try:
        dur = int(float(form.get("BillDuration") or form.get("Duration") or 0))
    except Exception:
        dur = 0
    final = (form.get("DialStatus") or form.get("CallStatus") or "completed")
    if token:
        await db.call_records.update_one(
            {"call_token": token},
            {"$set": {"duration_sec": dur, "final_status": final, "completed_at": now_utc()}},
        )
    await db.call_records.insert_one({"id": new_id(), "kind": "vobiz_dial_result", "call_token": token, "detail": form, "created_at": now_utc()})
    return _vobiz_xml('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>')


@router.post("/vobiz/hangup")
async def vobiz_hangup(request: Request, token: str = ""):
    try:
        form = dict(await request.form())
    except Exception:
        form = {}
    dur = 0
    try:
        dur = int(float(form.get("BillDuration") or form.get("Duration") or 0))
    except Exception:
        dur = 0
    if token and dur:
        await db.call_records.update_one({"call_token": token}, {"$set": {"duration_sec": dur}})
    await db.call_records.insert_one({"id": new_id(), "kind": "vobiz_hangup", "call_token": token, "detail": form, "created_at": now_utc()})
    return {"status": "received"}


@router.get("/admin/call-records")
async def admin_call_records(_: dict = Depends(require_admin), provider: Optional[str] = None, limit: int = 200):
    """Admin monitor of masked call attempts (Vobiz/MSG91/mock). Phone numbers
    are masked; owner/target numbers are never returned in full."""
    filt: dict = {"kind": {"$in": ["incident", "tag_guardian"]}}
    if provider:
        filt["provider"] = provider
    out = []
    async for r in db.call_records.find(filt).sort("created_at", -1).limit(min(limit, 500)):
        out.append({
            "id": r["id"], "kind": r.get("kind"), "provider": r.get("provider", "mock"),
            "status": r.get("status"), "final_status": r.get("final_status"),
            "duration_sec": r.get("duration_sec", 0),
            "reporter_phone": _mask_phone(r.get("reporter_phone")),
            "subject": r.get("number_plate"),
            "recording_url": r.get("recording_url"),
            "created_at": r.get("created_at"),
        })
    async def _c(f):
        return await db.call_records.count_documents(f)
    stats = {
        "total": await _c({"kind": {"$in": ["incident", "tag_guardian"]}}),
        "vobiz": await _c({"provider": "vobiz", "kind": {"$in": ["incident", "tag_guardian"]}}),
        "mock": await _c({"provider": "mock", "kind": {"$in": ["incident", "tag_guardian"]}}),
        "connected": await _c({"final_status": {"$regex": "complet", "$options": "i"}}),
    }
    return {"count": len(out), "results": out, "stats": stats}
