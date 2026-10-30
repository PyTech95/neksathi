from __future__ import annotations

from datetime import timedelta, timezone
import asyncio
import base64
import hashlib
import httpx
import os
import uuid
from typing import List, Literal, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.config import log
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import AudioEvidenceIn, AudioEvidenceOut, EmergencyContactIn, EmergencyContactOut, LinkCheckIn, LiveShareOut, LiveShareStartIn, SOSEventOut, SOSTriggerIn, UserLocationIn
from app.security import _prefs, current_user, require_admin
from app.services.fcm import send_push
from app.services.gdrive import _gdrive_autobackup
from app.services.geo import _evaluate_geofences, _haversine_km
from app.services.notify import notify_whatsapp, send_sms
from app.utils import clean, new_id, now_utc

router = APIRouter()


@router.get("/me/emergency-contacts", response_model=List[EmergencyContactOut])
async def list_emergency_contacts(user: dict = Depends(current_user)):
    items = []
    async for c in db.emergency_contacts.find({"user_id": user["id"]}).sort([("is_primary", -1), ("created_at", 1)]):
        items.append(EmergencyContactOut(**clean(c)))
    return items


@router.post("/me/emergency-contacts", response_model=EmergencyContactOut)
async def add_emergency_contact(payload: EmergencyContactIn, user: dict = Depends(current_user)):
    if payload.is_primary:
        await db.emergency_contacts.update_many({"user_id": user["id"]}, {"$set": {"is_primary": False}})
    doc = {"id": new_id(), "user_id": user["id"], "created_at": now_utc(), **payload.model_dump()}
    await db.emergency_contacts.insert_one(dict(doc))
    return EmergencyContactOut(**clean(doc))


@router.put("/me/emergency-contacts/{contact_id}", response_model=EmergencyContactOut)
async def update_emergency_contact(contact_id: str, payload: EmergencyContactIn, user: dict = Depends(current_user)):
    c = await db.emergency_contacts.find_one({"id": contact_id, "user_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    if payload.is_primary:
        await db.emergency_contacts.update_many({"user_id": user["id"]}, {"$set": {"is_primary": False}})
    await db.emergency_contacts.update_one({"id": contact_id}, {"$set": payload.model_dump()})
    c.update(payload.model_dump())
    return EmergencyContactOut(**clean(c))


@router.delete("/me/emergency-contacts/{contact_id}")
async def delete_emergency_contact(contact_id: str, user: dict = Depends(current_user)):
    r = await db.emergency_contacts.delete_one({"id": contact_id, "user_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"deleted": True}


@router.get("/me/sos-recipients")
async def get_sos_recipients(user: dict = Depends(current_user)):
    """The user's family-circle members with a `selected` flag — these are who an
    SOS goes to. SOS is sent only to selected members; none selected = no SOS."""
    fam = await db.family_members.find_one({"user_id": user["id"]})
    if not fam:
        return {"in_family": False, "items": []}
    chosen = set(user.get("sos_recipient_ids") or [])
    items = []
    async for m in db.family_members.find({"family_id": fam["family_id"]}):
        if m.get("user_id") and m["user_id"] != user["id"]:
            items.append({"user_id": m["user_id"], "name": m.get("name") or "Family",
                          "relation": m.get("relation"), "is_guardian": bool(m.get("is_guardian")),
                          "selected": m["user_id"] in chosen})
    return {"in_family": True, "items": items}


class SosRecipientsIn(BaseModel):
    user_ids: List[str] = Field(default_factory=list)


@router.put("/me/sos-recipients")
async def set_sos_recipients(payload: SosRecipientsIn, user: dict = Depends(current_user)):
    """Save which family members receive this user's SOS. Only ids that are
    actually in the user's circle are kept."""
    fam = await db.family_members.find_one({"user_id": user["id"]})
    valid = set()
    if fam:
        async for m in db.family_members.find({"family_id": fam["family_id"]}):
            if m.get("user_id") and m["user_id"] != user["id"]:
                valid.add(m["user_id"])
    ids = [u for u in dict.fromkeys(payload.user_ids) if u in valid]
    await db.users.update_one({"id": user["id"]}, {"$set": {"sos_recipient_ids": ids}})
    return {"ok": True, "user_ids": ids}


@router.post("/me/sos", response_model=SOSEventOut)
@rate_limit("6/minute")
async def trigger_sos(request: Request, payload: SOSTriggerIn, user: dict = Depends(current_user)):
    # Recipients = the family-circle members the user chose (sos_recipient_ids).
    # SOS always goes to family, never to a separate "emergency contact" list, and
    # if the user has selected nobody it is NOT sent (explicit product rule).
    fam = await db.family_members.find_one({"user_id": user["id"]})
    circle = {}
    if fam:
        async for m in db.family_members.find({"family_id": fam["family_id"]}):
            if m.get("user_id") and m["user_id"] != user["id"]:
                circle[m["user_id"]] = m
    chosen = [uid for uid in (user.get("sos_recipient_ids") or []) if uid in circle]
    if not chosen:
        raise HTTPException(status_code=400,
            detail="Choose at least one family member to receive your SOS (Safety > SOS recipients).")
    # The chosen members get BOTH a lock-screen push (app) and WhatsApp/SMS (phone).
    contacts = []
    for uid in chosen:
        m = circle[uid]
        if m.get("phone"):
            contacts.append({"name": m.get("name") or "Family", "phone": m["phone"]})
    loc_link = ""
    if payload.latitude is not None and payload.longitude is not None:
        loc_link = f" Location: https://maps.google.com/?q={payload.latitude},{payload.longitude}"
    who = user.get("name") or "A Nek Sathi user"
    extra = f" Message: {payload.message}" if payload.message else ""
    body = f"🆘 SOS! {who} needs urgent help.{loc_link}{extra} — sent via Nek Sathi."
    channels: set[str] = set()
    notified = 0
    prefs = _prefs(user)
    for c in contacts:
        phone = c.get("phone")
        if not phone:
            continue
        notified += 1
        try:
            wa = await notify_whatsapp(phone, body, meta={"kind": "sos", "user_id": user["id"]})
            if wa.get("status") in ("sent", "mock"):
                channels.add("whatsapp")
        except Exception as _e:
            log.warning("sos whatsapp failed: %s", _e)
        try:
            sm = await send_sms(phone, body, meta={"kind": "sos", "user_id": user["id"]})
            if sm.get("status") in ("sent", "mock"):
                channels.add("sms")
        except Exception as _e:
            log.warning("sos sms failed: %s", _e)
    # No push to the sender's own phone: the person in trouble must not get a
    # sound/popup (a volume-button SOS gives only a short vibration natively).
    # "app" = SOS button inside the app; anything else is a one-tap SOS from
    # outside the app (Quick Settings tile / lock screen) sent by native code.
    source = (payload.source or "app").lower().strip()
    if source not in ("app", "quick_tile", "volume_button", "notification"):
        source = "app"
    doc = {
        "id": new_id(), "user_id": user["id"],
        "latitude": payload.latitude, "longitude": payload.longitude,
        "message": payload.message, "notified": notified,
        "channels": sorted(channels), "created_at": now_utc(),
        "photo_base64": payload.photo_base64, "has_photo": bool(payload.photo_base64),
        "acknowledged": False, "escalated": False, "source": source,
    }
    await db.sos_events.insert_one(dict(doc))
    # Wake the family circle on their LOCK SCREEN (high-priority push) — they
    # must learn about an SOS even when their app is closed. Tapping opens the
    # Family page with the member's live location and Navigate.
    try:
        loc_q = (f"{payload.latitude},{payload.longitude}"
                 if payload.latitude is not None and payload.longitude is not None else "")
        await send_push(recipients=chosen, data={
            "title": f"🆘 {who} raised an SOS" + (" (quick SOS)" if source != "app" else ""),
            "message": (f"{payload.message} — " if payload.message else "") + "tap to see their location, call police or ambulance",
            "type": "sos", "sos_id": doc["id"], "action_url": "/family",
            "sender_name": who, "location": loc_q, "source": source,
            "has_photo": "1" if payload.photo_base64 else "",
        }, idempotency_key="sos-" + doc["id"], data_only=True)
    except Exception as _e:
        log.warning("sos family push failed: %s", _e)
    if payload.photo_base64:
        asyncio.create_task(_gdrive_autobackup(user["id"], payload.photo_base64, f"sos-{doc['id']}.jpg", "image/jpeg"))
    return SOSEventOut(**{k: v for k, v in clean(doc).items() if k != "photo_base64"})


async def _family_circle_ids(member_id: str) -> list[str]:
    """Every OTHER user in member_id's family circle (the phones that may be
    ringing for this member's SOS). Empty if they have no family."""
    fam = await db.family_members.find_one({"user_id": member_id})
    if not fam:
        return []
    ids = []
    async for m in db.family_members.find({"family_id": fam["family_id"]}):
        if m.get("user_id") and m["user_id"] != member_id:
            ids.append(m["user_id"])
    return ids


async def _stop_family_sirens(sender_id: str, sos_id: str):
    """Tell the family's phones to stop the SOS siren (data-only push handled by
    the native CallMessagingService -> stopSos). Best-effort."""
    try:
        ids = await _family_circle_ids(sender_id)
        if ids:
            await send_push(recipients=ids, data={"type": "sos_cancel", "sos_id": sos_id},
                            idempotency_key="soscancel-" + sos_id, data_only=True)
    except Exception as _e:
        log.warning("sos_cancel push failed: %s", _e)


@router.post("/me/sos-events/{event_id}/ack")
async def acknowledge_sos(event_id: str, user: dict = Depends(current_user)):
    """Owner marks an SOS as handled ("I'm safe") — cancels auto-escalation and
    silences the siren on the family's phones."""
    r = await db.sos_events.update_one({"id": event_id, "user_id": user["id"]},
                                       {"$set": {"acknowledged": True, "acknowledged_at": now_utc()}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="SOS event not found")
    await _stop_family_sirens(user["id"], event_id)
    return {"acknowledged": True}


@router.get("/me/sos-events", response_model=List[SOSEventOut])
async def list_sos_events(user: dict = Depends(current_user), limit: int = 30):
    items = []
    async for e in db.sos_events.find({"user_id": user["id"]}).sort("created_at", -1).limit(min(limit, 100)):
        e = clean(e)
        e["has_photo"] = bool(e.get("photo_base64"))
        e.pop("photo_base64", None)
        items.append(SOSEventOut(**e))
    return items


@router.get("/me/sos-events/{event_id}/photo")
async def get_sos_photo(event_id: str, user: dict = Depends(current_user)):
    e = await db.sos_events.find_one({"id": event_id, "user_id": user["id"]})
    if not e or not e.get("photo_base64"):
        raise HTTPException(status_code=404, detail="No photo for this SOS.")
    return {"photo_base64": e["photo_base64"]}


@router.post("/me/live-share", response_model=LiveShareOut)
async def start_live_share(payload: LiveShareStartIn, user: dict = Depends(current_user)):
    doc = {
        "id": new_id(), "user_id": user["id"], "token": uuid.uuid4().hex,
        "label": payload.label, "active": True,
        "expires_at": now_utc() + timedelta(minutes=payload.duration_min),
        "created_at": now_utc(),
    }
    await db.live_shares.insert_one(dict(doc))
    return LiveShareOut(**clean(doc))


@router.get("/me/live-shares", response_model=List[LiveShareOut])
async def list_live_shares(user: dict = Depends(current_user)):
    items = []
    async for s in db.live_shares.find({"user_id": user["id"], "active": True}).sort("created_at", -1):
        items.append(LiveShareOut(**clean(s)))
    return items


@router.post("/me/live-share/{share_id}/stop")
async def stop_live_share(share_id: str, user: dict = Depends(current_user)):
    r = await db.live_shares.update_one({"id": share_id, "user_id": user["id"]}, {"$set": {"active": False}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Share not found")
    return {"stopped": True}


@router.post("/me/location")
async def push_user_location(payload: UserLocationIn, user: dict = Depends(current_user)):
    await db.user_locations.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "latitude": payload.latitude, "longitude": payload.longitude,
                  "accuracy": payload.accuracy, "speed_kmh": payload.speed_kmh, "recorded_at": now_utc()}},
        upsert=True,
    )
    # Overspeed → family alert (same helper the Family status endpoint uses).
    if payload.speed_kmh is not None:
        try:
            from app.routers.family import _maybe_overspeed_family_alert
            await _maybe_overspeed_family_alert(user, payload.speed_kmh)
        except Exception:
            pass
    transitions = await _evaluate_geofences(user, payload.latitude, payload.longitude)
    return {"ok": True, "transitions": transitions}


@router.post("/me/audio-evidence", response_model=AudioEvidenceOut)
@rate_limit("12/minute")
async def add_audio_evidence(request: Request, payload: AudioEvidenceIn, user: dict = Depends(current_user)):
    if len(payload.audio_base64) > 14_000_000:
        raise HTTPException(status_code=400, detail="Recording too large (max ~10MB).")
    doc = {"id": new_id(), "user_id": user["id"], "audio_base64": payload.audio_base64,
           "duration_ms": payload.duration_ms, "mime": payload.mime or "audio/webm",
           "sos_event_id": payload.sos_event_id, "created_at": now_utc()}
    await db.audio_evidence.insert_one(dict(doc))
    asyncio.create_task(_gdrive_autobackup(user["id"], payload.audio_base64, f"sos-audio-{doc['id']}.webm", "audio/webm"))
    return AudioEvidenceOut(**{k: v for k, v in clean(doc).items() if k != "audio_base64"})


@router.get("/me/audio-evidence", response_model=List[AudioEvidenceOut])
async def list_audio_evidence(user: dict = Depends(current_user), limit: int = 30):
    items = []
    async for a in db.audio_evidence.find({"user_id": user["id"]}).sort("created_at", -1).limit(min(limit, 100)):
        a = clean(a); a.pop("audio_base64", None)
        items.append(AudioEvidenceOut(**a))
    return items


@router.get("/me/audio-evidence/{audio_id}/play")
async def play_audio_evidence(audio_id: str, user: dict = Depends(current_user)):
    a = await db.audio_evidence.find_one({"id": audio_id, "user_id": user["id"]})
    if not a:
        raise HTTPException(status_code=404, detail="Recording not found")
    return {"audio_base64": a["audio_base64"], "mime": a.get("mime", "audio/webm")}


@router.delete("/me/audio-evidence/{audio_id}")
async def delete_audio_evidence(audio_id: str, user: dict = Depends(current_user)):
    r = await db.audio_evidence.delete_one({"id": audio_id, "user_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Recording not found")
    return {"deleted": True}


@router.get("/public/live/{token}")
async def public_live_location(token: str):
    s = await db.live_shares.find_one({"token": token})
    if not s:
        raise HTTPException(status_code=404, detail="Link not found")
    exp = s.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    expired = bool(exp and exp < now_utc())
    active = bool(s.get("active")) and not expired
    owner = await db.users.find_one({"id": s["user_id"]})
    last = await db.user_locations.find_one({"user_id": s["user_id"]})
    out = {
        "label": s.get("label"),
        "name": ((owner or {}).get("name") or "Nek Sathi user").split(" ")[0],
        "active": active, "expired": expired,
        "expires_at": s.get("expires_at"),
        "last": None,
    }
    if active and last:
        out["last"] = {"latitude": last["latitude"], "longitude": last["longitude"], "recorded_at": last["recorded_at"]}
    return out


VT_BASE = "https://www.virustotal.com/api/v3"


def _vt_key() -> Optional[str]:
    return os.environ.get("VIRUSTOTAL_API_KEY")


def _vt_url_id(url: str) -> str:
    return base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")


@router.post("/safety/link-check")
@rate_limit("10/minute")
async def link_check(request: Request, payload: LinkCheckIn, user: dict = Depends(current_user)):
    url = payload.url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "http://" + url
    if not _vt_key():
        return {"configured": False, "message": "Safe Link Checker is not configured yet."}
    url_id = _vt_url_id(url)
    # 24h cache
    cached = await db.url_checks.find_one({"url_id": url_id})
    if cached:
        ts = cached.get("checked_at")
        if ts and (ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts) > now_utc() - timedelta(hours=24):
            return {"configured": True, "url": url, "verdict": cached["verdict"], "stats": cached["stats"], "cached": True}
    headers = {"x-apikey": _vt_key(), "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{VT_BASE}/urls", data={"url": url}, headers=headers)
            if r.status_code == 429:
                raise HTTPException(status_code=503, detail="Scanner is busy (rate limit). Try again shortly.")
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail="Scanner request failed.")
            analysis_id = r.json()["data"]["id"]
            attrs = {}
            for i in range(3):
                await asyncio.sleep(2 if i == 0 else 6)
                ar = await c.get(f"{VT_BASE}/analyses/{analysis_id}", headers=headers)
                attrs = ar.json().get("data", {}).get("attributes", {})
                if attrs.get("status") == "completed":
                    break
    except HTTPException:
        raise
    except Exception as e:
        log.warning("link-check failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not scan this link right now.")
    if attrs.get("status") != "completed":
        return {"configured": True, "url": url, "verdict": "pending", "status": attrs.get("status", "unknown")}
    stats = {k: int(v) for k, v in attrs.get("stats", {}).items()}
    verdict = "unsafe" if (stats.get("malicious", 0) > 0 or stats.get("suspicious", 0) > 0) else "safe"
    await db.url_checks.update_one(
        {"url_id": url_id},
        {"$set": {"url": url, "url_id": url_id, "verdict": verdict, "stats": stats, "checked_at": now_utc()}},
        upsert=True,
    )
    return {"configured": True, "url": url, "verdict": verdict, "stats": stats, "cached": False}


def _vt_verdict(stats: dict) -> str:
    return "unsafe" if (int(stats.get("malicious", 0)) > 0 or int(stats.get("suspicious", 0)) > 0) else "safe"


@router.post("/safety/file-check")
@rate_limit("6/minute")
async def file_check(request: Request, file: UploadFile = File(...), user: dict = Depends(current_user)):
    if not _vt_key():
        return {"configured": False, "message": "Unsafe File Checker is not configured yet."}
    contents = await file.read()
    size = len(contents)
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file.")
    if size > 30 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 30 MB).")
    sha = hashlib.sha256(contents).hexdigest()
    headers = {"x-apikey": _vt_key(), "Accept": "application/json"}
    stats = None
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            rep = await c.get(f"{VT_BASE}/files/{sha}", headers=headers)
            if rep.status_code == 200:
                stats = rep.json().get("data", {}).get("attributes", {}).get("last_analysis_stats")
            if stats is None:
                files = {"file": (file.filename or "upload.bin", contents, file.content_type or "application/octet-stream")}
                up = await c.post(f"{VT_BASE}/files", headers=headers, files=files)
                if up.status_code == 429:
                    raise HTTPException(status_code=503, detail="Scanner busy (rate limit). Try again shortly.")
                if up.status_code >= 400:
                    raise HTTPException(status_code=502, detail="Scanner upload failed.")
                analysis_id = up.json()["data"]["id"]
                attrs = {}
                for i in range(3):
                    await asyncio.sleep(3 if i == 0 else 8)
                    ar = await c.get(f"{VT_BASE}/analyses/{analysis_id}", headers=headers)
                    attrs = ar.json().get("data", {}).get("attributes", {})
                    if attrs.get("status") == "completed":
                        stats = attrs.get("stats"); break
    except HTTPException:
        raise
    except Exception as e:
        log.warning("file-check failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not scan this file right now.")
    if stats is None:
        return {"configured": True, "filename": file.filename, "sha256": sha, "verdict": "pending"}
    stats = {k: int(v) for k, v in stats.items()}
    return {"configured": True, "filename": file.filename, "size": size, "sha256": sha, "verdict": _vt_verdict(stats), "stats": stats}


@router.get("/safety/file-status/{sha}")
async def file_status(sha: str, user: dict = Depends(current_user)):
    if not _vt_key():
        return {"configured": False}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            rep = await c.get(f"{VT_BASE}/files/{sha}", headers={"x-apikey": _vt_key(), "Accept": "application/json"})
    except Exception:
        return {"verdict": "pending"}
    if rep.status_code != 200:
        return {"verdict": "pending"}
    stats = rep.json().get("data", {}).get("attributes", {}).get("last_analysis_stats")
    if not stats:
        return {"verdict": "pending"}
    stats = {k: int(v) for k, v in stats.items()}
    return {"verdict": _vt_verdict(stats), "stats": stats}


@router.get("/safety/nearby-police")
@rate_limit("20/minute")
async def nearby_police(request: Request, lat: float, lng: float, radius: int = 6000, user: dict = Depends(current_user)):
    radius = max(1000, min(radius, 25000))
    # 30-min cache keyed by rounded coords + radius to smooth Overpass hiccups.
    cache_key = f"{round(lat, 3)},{round(lng, 3)},{radius}"
    cached = await db.police_cache.find_one({"key": cache_key})
    if cached:
        ts = cached.get("checked_at")
        if ts and (ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts) > now_utc() - timedelta(minutes=30):
            return {"count": len(cached["stations"]), "stations": cached["stations"], "cached": True}
    q = (
        f"[out:json][timeout:20];"
        f'(node["amenity"="police"](around:{radius},{lat},{lng});'
        f'way["amenity"="police"](around:{radius},{lat},{lng});'
        f'relation["amenity"="police"](around:{radius},{lat},{lng}););'
        f"out center 40;"
    )
    stations = []
    elements = []
    mirrors = [
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
    ]
    headers = {"User-Agent": "NekSathi-Safety/1.0 (personal safety app)"}
    for murl in mirrors:
        try:
            async with httpx.AsyncClient(timeout=22) as c:
                r = await c.post(murl, data={"data": q}, headers=headers)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("application/json"):
                elements = r.json().get("elements", [])
                break
        except Exception as e:
            log.warning("overpass mirror %s failed: %s", murl, e)
            continue
    else:
        raise HTTPException(status_code=502, detail="Could not fetch nearby police stations. Try again.")
    for el in elements:
        p = el.get("center") if el.get("type") != "node" else el
        plat = (p or {}).get("lat") if el.get("type") != "node" else el.get("lat")
        plng = (p or {}).get("lon") if el.get("type") != "node" else el.get("lon")
        if plat is None or plng is None:
            continue
        tags = el.get("tags", {})
        stations.append({
            "id": f"{el.get('type')}/{el.get('id')}",
            "name": tags.get("name") or "Police Station",
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "address": tags.get("addr:full") or ", ".join(filter(None, [tags.get("addr:street"), tags.get("addr:city")])) or None,
            "latitude": plat, "longitude": plng,
            "distance_km": _haversine_km(lat, lng, plat, plng),
        })
    stations.sort(key=lambda s: s["distance_km"])
    result = stations[:20]
    await db.police_cache.update_one({"key": cache_key}, {"$set": {"key": cache_key, "stations": result, "checked_at": now_utc()}}, upsert=True)
    return {"count": len(result), "stations": result, "cached": False}


# ---- Emergency numbers (shown as Call Police / Call Ambulance on an SOS) -----
# Defaults are India's unified numbers; the admin can change them without a
# deploy (stored in system_config, id "emergency_numbers").
DEFAULT_EMERGENCY_NUMBERS = {
    "police": os.environ.get("POLICE_NUMBER", "112").strip() or "112",
    "ambulance": os.environ.get("AMBULANCE_NUMBER", "108").strip() or "108",
}


async def get_emergency_numbers() -> dict:
    doc = await db.system_config.find_one({"id": "emergency_numbers"}) or {}
    return {
        "police": (doc.get("police") or DEFAULT_EMERGENCY_NUMBERS["police"]),
        "ambulance": (doc.get("ambulance") or DEFAULT_EMERGENCY_NUMBERS["ambulance"]),
    }


@router.get("/public/emergency-numbers")
async def public_emergency_numbers():
    return await get_emergency_numbers()


class EmergencyNumbersIn(BaseModel):
    police: str = Field(min_length=2, max_length=20)
    ambulance: str = Field(min_length=2, max_length=20)


@router.put("/admin/emergency-numbers")
async def set_emergency_numbers(payload: EmergencyNumbersIn, user: dict = Depends(require_admin)):
    clean_p = "".join(ch for ch in payload.police if ch.isdigit() or ch == "+")
    clean_a = "".join(ch for ch in payload.ambulance if ch.isdigit() or ch == "+")
    if len(clean_p) < 2 or len(clean_a) < 2:
        raise HTTPException(status_code=400, detail="Enter valid phone numbers.")
    await db.system_config.update_one({"id": "emergency_numbers"},
                                      {"$set": {"id": "emergency_numbers", "police": clean_p, "ambulance": clean_a,
                                                "updated_at": now_utc(), "updated_by": user["id"]}}, upsert=True)
    return await get_emergency_numbers()
