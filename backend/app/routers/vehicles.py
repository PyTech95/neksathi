from __future__ import annotations

from datetime import timedelta, timezone
import os
import secrets
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.config import log
from app.db import db
from app.schemas import AccidentIn, AlertOut, CHUNK_MAX_BYTES, ContactIn, ContactOut, InviteCreateOut, LocationIn, LocationOut, LostModeIn, PublicInvitePreview, SOSChunkIn, SOSCompleteIn, SOSInitIn, SOSVideoIn, SOSVideoMeta, SharedVehicleOut, UserSOSVideoIn, VehicleIn, VehicleOut
from app.security import _prefs, current_user
from app.services.fcm import send_push
from app.utils import _veh_plan_state, clean, new_id, now_utc

router = APIRouter()


def to_vehicle_out(v: dict) -> VehicleOut:
    _ps, _dl, _exp = _veh_plan_state(v)
    return VehicleOut(
        id=v["id"],
        owner_id=v["owner_id"],
        number_plate=v["number_plate"],
        vehicle_type=v["vehicle_type"],
        brand=v.get("brand"),
        model=v.get("model"),
        make_model=v.get("make_model"),
        color=v.get("color"),
        photo_base64=v.get("photo_base64"),
        qr_id=v["qr_id"],
        speed_limit_kmh=v.get("speed_limit_kmh", 80),
        lost_mode=v.get("lost_mode", False),
        created_at=v["created_at"],
        qr_ordered=bool(v.get("qr_ordered", False)),
        qr_order_id=v.get("qr_order_id"),
        plan_status=_ps,
        plan_name=v.get("plan_name"),
        plan_days_left=_dl,
        plan_expires_at=_exp,
    )


@router.get("/vehicles", response_model=List[VehicleOut])
async def list_vehicles(user: dict = Depends(current_user)):
    cursor = db.vehicles.find({"owner_id": user["id"]}).sort("created_at", -1).limit(100)
    items = [to_vehicle_out(clean(v)) async for v in cursor]
    return items


@router.post("/vehicles", response_model=VehicleOut)
async def create_vehicle(payload: VehicleIn, user: dict = Depends(current_user)):
    v_id = new_id()
    brand = (payload.brand or "").strip() or None
    model = (payload.model or "").strip() or None
    make_model = payload.make_model or (" ".join(x for x in [brand, model] if x) or None)
    doc = {
        "id": v_id,
        "owner_id": user["id"],
        "number_plate": payload.number_plate.upper().strip(),
        "vehicle_type": payload.vehicle_type,
        "brand": brand,
        "model": model,
        "make_model": make_model,
        "color": payload.color,
        "photo_base64": payload.photo_base64,
        "qr_id": new_id(),
        "speed_limit_kmh": payload.speed_limit_kmh,
        "lost_mode": False,
        "created_at": now_utc(),
    }
    await db.vehicles.insert_one(dict(doc))
    return to_vehicle_out(doc)


@router.get("/vehicles/{vehicle_id}", response_model=VehicleOut)
async def get_vehicle(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return to_vehicle_out(clean(v))


@router.put("/vehicles/{vehicle_id}", response_model=VehicleOut)
async def update_vehicle(vehicle_id: str, payload: VehicleIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    brand = (payload.brand or "").strip() or None
    model = (payload.model or "").strip() or None
    make_model = payload.make_model or (" ".join(x for x in [brand, model] if x) or None)
    update = {
        "number_plate": payload.number_plate.upper().strip(),
        "vehicle_type": payload.vehicle_type,
        "brand": brand,
        "model": model,
        "make_model": make_model,
        "color": payload.color,
        "photo_base64": payload.photo_base64 if payload.photo_base64 is not None else v.get("photo_base64"),
        "speed_limit_kmh": payload.speed_limit_kmh,
    }
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update})
    v.update(update)
    return to_vehicle_out(clean(v))


@router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: dict = Depends(current_user)):
    existing = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    # Once a QR sticker is ordered + paid, the vehicle is locked (can't be deleted).
    if existing.get("qr_ordered"):
        raise HTTPException(status_code=400, detail="This vehicle has a paid QR order and cannot be deleted.")
    result = await db.vehicles.delete_one({"id": vehicle_id, "owner_id": user["id"]})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.contacts.delete_many({"vehicle_id": vehicle_id})
    await db.alerts.delete_many({"vehicle_id": vehicle_id})
    await db.locations.delete_many({"vehicle_id": vehicle_id})
    return {"deleted": True}


@router.post("/vehicles/{vehicle_id}/lost_mode", response_model=VehicleOut)
async def toggle_lost_mode(vehicle_id: str, payload: LostModeIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"lost_mode": payload.enabled}})
    v["lost_mode"] = payload.enabled
    return to_vehicle_out(clean(v))


@router.get("/vehicles/{vehicle_id}/contacts", response_model=List[ContactOut])
async def list_contacts(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    items = []
    async for c in db.contacts.find({"vehicle_id": vehicle_id}).sort("created_at", 1):
        items.append(ContactOut(**clean(c)))
    return items


@router.post("/vehicles/{vehicle_id}/contacts", response_model=ContactOut)
async def add_contact(vehicle_id: str, payload: ContactIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    count = await db.contacts.count_documents({"vehicle_id": vehicle_id})
    if count >= 4:
        raise HTTPException(status_code=400, detail="Maximum 4 contacts per vehicle")
    doc = {
        "id": new_id(),
        "vehicle_id": vehicle_id,
        "created_at": now_utc(),
        **payload.model_dump(),
    }
    await db.contacts.insert_one(dict(doc))
    return ContactOut(**clean(doc))


@router.delete("/vehicles/{vehicle_id}/contacts/{contact_id}")
async def delete_contact(vehicle_id: str, contact_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    r = await db.contacts.delete_one({"id": contact_id, "vehicle_id": vehicle_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"deleted": True}


@router.post("/vehicles/{vehicle_id}/location", response_model=LocationOut)
async def push_location(vehicle_id: str, payload: LocationIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    doc = {
        "id": new_id(),
        "vehicle_id": vehicle_id,
        "recorded_at": now_utc(),
        **payload.model_dump(),
    }
    await db.locations.insert_one(dict(doc))

    # Speed alert
    limit = v.get("speed_limit_kmh", 80)
    if payload.speed_kmh > limit:
        alert_doc = {
            "id": new_id(),
            "vehicle_id": vehicle_id,
            "number_plate": v["number_plate"],
            "type": "speed_alert",
            "scanner_note": f"Speed {payload.speed_kmh:.0f} km/h crossed limit {limit} km/h",
            "scanner_lat": payload.latitude,
            "scanner_lng": payload.longitude,
            "created_at": now_utc(),
            "contact_channels": [],
        }
        await db.alerts.insert_one(dict(alert_doc))
        # Fire-and-forget push notify the owner about overspeed (pref-gated).
        _p = _prefs(user)
        try:
            if _p.get("push") and _p.get("speed_alerts"):
                await send_push(
                    recipients=[user["id"]],
                    data={
                        "title": "⚡ Overspeed alert",
                        "message": f"{v['number_plate']} @ {payload.speed_kmh:.0f} km/h (limit {limit})",
                        "action_url": "/alerts",
                    },
                    idempotency_key=alert_doc["id"],
                )
        except Exception as _e:
            log.warning("push (speed alert) failed: %s", _e)

    return LocationOut(**clean(doc))


@router.get("/vehicles/{vehicle_id}/track", response_model=List[LocationOut])
async def get_track(vehicle_id: str, user: dict = Depends(current_user), limit: int = 50):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    items = []
    async for loc in db.locations.find({"vehicle_id": vehicle_id}).sort("recorded_at", -1).limit(limit):
        items.append(LocationOut(**clean(loc)))
    return items


@router.post("/vehicles/{vehicle_id}/accident", response_model=AlertOut)
async def record_accident(vehicle_id: str, payload: AccidentIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    note_bits = []
    if payload.speed_before_kmh is not None:
        note_bits.append(f"speed_before={payload.speed_before_kmh:.0f}")
    if payload.impact_g is not None:
        note_bits.append(f"impact={payload.impact_g:.2f}g")
    if payload.resolution:
        note_bits.append(f"resolution={payload.resolution}")
    alert = {
        "id": new_id(),
        "vehicle_id": vehicle_id,
        "number_plate": v["number_plate"],
        "type": (
            "accident_detected"
            if not payload.resolved
            else (f"accident_{payload.resolution}" if payload.resolution else "accident_resolved")
        ),
        "scanner_note": ", ".join(note_bits) or None,
        "scanner_lat": payload.latitude,
        "scanner_lng": payload.longitude,
        "created_at": now_utc(),
        "contact_channels": [],
    }
    await db.alerts.insert_one(dict(alert))
    # Push notify owner + family Nek Sathi accounts on unresolved accident.
    if not payload.resolved:
        try:
            recipients: set[str] = {user["id"]}
            contact_phones: set[str] = set()
            async for c in db.contacts.find({"vehicle_id": vehicle_id}, {"phone": 1}):
                if c.get("phone"):
                    contact_phones.add(c["phone"])
            if contact_phones:
                async for u in db.users.find({"phone": {"$in": list(contact_phones)}}, {"id": 1}):
                    recipients.add(u["id"])
            impact_txt = f" ({payload.impact_g:.1f}g)" if payload.impact_g else ""
            await send_push(
                recipients=list(recipients),
                data={
                    "title": f"🚑 Possible accident{impact_txt}",
                    "message": f"{v['number_plate']} - please check on the driver",
                    "action_url": "/alerts",
                },
                idempotency_key=alert["id"],
            )
        except Exception as _e:
            log.warning("push (accident) failed: %s", _e)
    return AlertOut(**clean(alert))


@router.post("/vehicles/{vehicle_id}/sos-video", response_model=SOSVideoMeta)
async def upload_sos_video(vehicle_id: str, payload: SOSVideoIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    vid_id = new_id()
    size = len(payload.video_base64)
    doc = {
        "id": vid_id,
        "vehicle_id": vehicle_id,
        "video_base64": payload.video_base64,
        "duration_ms": payload.duration_ms,
        "size_bytes": size,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "created_at": now_utc(),
    }
    await db.sos_videos.insert_one(dict(doc))
    # link into unified alerts feed
    await db.alerts.insert_one({
        "id": new_id(),
        "vehicle_id": vehicle_id,
        "number_plate": v["number_plate"],
        "type": "sos_video",
        "scanner_note": f"SOS video recorded ({payload.duration_ms / 1000:.1f}s, {size // 1024} KB)",
        "scanner_lat": payload.latitude,
        "scanner_lng": payload.longitude,
        "created_at": now_utc(),
        "contact_channels": [],
    })
    return SOSVideoMeta(
        id=vid_id,
        vehicle_id=vehicle_id,
        duration_ms=payload.duration_ms,
        size_bytes=size,
        latitude=payload.latitude,
        longitude=payload.longitude,
        created_at=doc["created_at"],
    )


@router.get("/vehicles/{vehicle_id}/sos-videos", response_model=List[SOSVideoMeta])
async def list_sos_videos(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    items: List[SOSVideoMeta] = []
    cursor = db.sos_videos.find(
        {"vehicle_id": vehicle_id}, {"_id": 0, "video_base64": 0}
    ).sort("created_at", -1)
    async for doc in cursor:
        items.append(SOSVideoMeta(**doc))
    return items


@router.get("/sos-video/{video_id}")
async def get_sos_video(video_id: str, user: dict = Depends(current_user)):
    doc = await db.sos_videos.find_one({"id": video_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found")
    # Authorisation: either the video is user-scoped (user_id matches) or it's
    # vehicle-scoped and the vehicle belongs to this user.
    authorised = False
    if doc.get("user_id") == user["id"]:
        authorised = True
    elif doc.get("vehicle_id"):
        v = await db.vehicles.find_one({"id": doc["vehicle_id"], "owner_id": user["id"]})
        if v:
            authorised = True
    if not authorised:
        raise HTTPException(status_code=403, detail="Not authorised")
    return {
        "id": doc["id"],
        "vehicle_id": doc.get("vehicle_id"),
        "duration_ms": doc.get("duration_ms", 0),
        "size_bytes": doc.get("size_bytes", 0),
        "video_base64": doc["video_base64"],
        "created_at": doc["created_at"],
    }


@router.post("/user/sos-video", response_model=SOSVideoMeta)
async def upload_user_sos_video(payload: UserSOSVideoIn, user: dict = Depends(current_user)):
    vehicle_id: Optional[str] = None
    number_plate: Optional[str] = None
    if payload.vehicle_id:
        v = await db.vehicles.find_one({"id": payload.vehicle_id, "owner_id": user["id"]})
        if v:
            vehicle_id = v["id"]
            number_plate = v["number_plate"]

    vid_id = new_id()
    size = len(payload.video_base64)
    now = now_utc()
    doc = {
        "id": vid_id,
        "user_id": user["id"],
        "vehicle_id": vehicle_id,
        "video_base64": payload.video_base64,
        "duration_ms": payload.duration_ms,
        "size_bytes": size,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "created_at": now,
    }
    await db.sos_videos.insert_one(dict(doc))

    # Fold into the unified alerts feed (so /alerts still surfaces it).
    alert_id = new_id()
    display_plate = number_plate or user.get("name", "SOS")
    await db.alerts.insert_one({
        "id": alert_id,
        "vehicle_id": vehicle_id,
        "user_id": user["id"],
        "number_plate": display_plate,
        "type": "sos_video",
        "scanner_note": f"Auto SOS recording ({payload.duration_ms / 1000:.1f}s, {size // 1024} KB)",
        "scanner_lat": payload.latitude,
        "scanner_lng": payload.longitude,
        "created_at": now,
        "contact_channels": [],
    })

    # Fan-out push to the user themselves (so their other devices see it)
    # and to family contacts of any of their vehicles that have a linked
    # Nek Sathi account (by phone match). Best-effort — never blocks.
    try:
        recipients: set[str] = {user["id"]}
        my_vehicle_ids = [v["id"] async for v in db.vehicles.find({"owner_id": user["id"]}, {"id": 1})]
        if my_vehicle_ids:
            contact_phones: set[str] = set()
            async for c in db.contacts.find({"vehicle_id": {"$in": my_vehicle_ids}}, {"phone": 1}):
                if c.get("phone"):
                    contact_phones.add(c["phone"])
            if contact_phones:
                async for u in db.users.find({"phone": {"$in": list(contact_phones)}}, {"id": 1}):
                    recipients.add(u["id"])
        title = "🚨 SOS from " + (user.get("name") or "family member")
        msg_bits: list[str] = []
        if payload.latitude is not None and payload.longitude is not None:
            msg_bits.append(f"📍 {payload.latitude:.4f},{payload.longitude:.4f}")
        msg_bits.append(f"{payload.duration_ms / 1000:.0f}s video captured")
        await send_push(
            recipients=list(recipients),
            data={
                "title": title,
                "message": " · ".join(msg_bits),
                "action_url": "/alerts",
            },
            idempotency_key=alert_id,
        )
    except Exception as _e:
        log.warning("push (user sos-video) failed: %s", _e)

    return SOSVideoMeta(
        id=vid_id,
        vehicle_id=vehicle_id,
        duration_ms=payload.duration_ms,
        size_bytes=size,
        latitude=payload.latitude,
        longitude=payload.longitude,
        created_at=now,
    )


@router.get("/user/sos-videos", response_model=List[SOSVideoMeta])
async def list_user_sos_videos(user: dict = Depends(current_user), limit: int = 50):
    items: List[SOSVideoMeta] = []
    cursor = db.sos_videos.find(
        {"user_id": user["id"]}, {"_id": 0, "video_base64": 0}
    ).sort("created_at", -1).limit(limit)
    async for doc in cursor:
        items.append(SOSVideoMeta(**doc))
    return items


SOS_ASSEMBLED_MAX_BYTES = 80 * 1024 * 1024  # ~60 MB decoded ceiling


@router.post("/user/sos-video/init")
async def sos_video_init(payload: SOSInitIn, user: dict = Depends(current_user)):
    vehicle_id = None
    if payload.vehicle_id:
        v = await db.vehicles.find_one({"id": payload.vehicle_id, "owner_id": user["id"]})
        if v:
            vehicle_id = v["id"]
    upload_id = new_id()
    await db.sos_uploads.insert_one({
        "id": upload_id, "user_id": user["id"], "vehicle_id": vehicle_id,
        "total_chunks": payload.total_chunks, "duration_ms": payload.duration_ms,
        "latitude": payload.latitude, "longitude": payload.longitude,
        "status": "uploading", "created_at": now_utc(),
    })
    return {"upload_id": upload_id, "chunk_max_bytes": CHUNK_MAX_BYTES, "total_chunks": payload.total_chunks}


@router.post("/user/sos-video/chunk")
async def sos_video_chunk(payload: SOSChunkIn, user: dict = Depends(current_user)):
    sess = await db.sos_uploads.find_one({"id": payload.upload_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Upload session not found")
    if sess.get("status") == "completed":
        raise HTTPException(status_code=409, detail="Upload already completed")
    if payload.index >= sess["total_chunks"]:
        raise HTTPException(status_code=400, detail="Chunk index out of range")
    # Idempotent upsert — retrying the same index is safe (resume support).
    await db.sos_chunks.update_one(
        {"upload_id": payload.upload_id, "index": payload.index},
        {"$set": {"upload_id": payload.upload_id, "index": payload.index,
                   "data_base64": payload.data_base64, "user_id": user["id"], "created_at": now_utc()}},
        upsert=True,
    )
    received = await db.sos_chunks.count_documents({"upload_id": payload.upload_id})
    return {"received": received, "total": sess["total_chunks"], "index": payload.index}


@router.get("/user/sos-video/status/{upload_id}")
async def sos_video_status(upload_id: str, user: dict = Depends(current_user)):
    sess = await db.sos_uploads.find_one({"id": upload_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Upload session not found")
    received = sorted([c["index"] async for c in db.sos_chunks.find({"upload_id": upload_id}, {"index": 1})])
    missing = [i for i in range(sess["total_chunks"]) if i not in set(received)]
    return {"upload_id": upload_id, "status": sess.get("status"),
            "total": sess["total_chunks"], "received": received, "missing": missing}


@router.post("/user/sos-video/complete", response_model=SOSVideoMeta)
async def sos_video_complete(payload: SOSCompleteIn, user: dict = Depends(current_user)):
    sess = await db.sos_uploads.find_one({"id": payload.upload_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Upload session not found")
    total = sess["total_chunks"]
    chunks = [c async for c in db.sos_chunks.find({"upload_id": payload.upload_id}).sort("index", 1)]
    if len(chunks) != total:
        have = {c["index"] for c in chunks}
        missing = [i for i in range(total) if i not in have]
        raise HTTPException(status_code=400, detail=f"Missing chunks: {missing[:20]}")
    video_base64 = "".join(c["data_base64"] for c in chunks)
    size = len(video_base64)
    if size > SOS_ASSEMBLED_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Assembled video exceeds size limit")

    vehicle_id = sess.get("vehicle_id")
    number_plate = None
    if vehicle_id:
        v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
        number_plate = v["number_plate"] if v else None

    vid_id, now = new_id(), now_utc()
    await db.sos_videos.insert_one({
        "id": vid_id, "user_id": user["id"], "vehicle_id": vehicle_id,
        "video_base64": video_base64, "duration_ms": sess.get("duration_ms", 0), "size_bytes": size,
        "latitude": sess.get("latitude"), "longitude": sess.get("longitude"), "created_at": now,
    })
    alert_id = new_id()
    await db.alerts.insert_one({
        "id": alert_id, "vehicle_id": vehicle_id, "user_id": user["id"],
        "number_plate": number_plate or user.get("name", "SOS"), "type": "sos_video",
        "scanner_note": f"Auto SOS recording ({sess.get('duration_ms', 0) / 1000:.1f}s, {size // 1024} KB, chunked)",
        "scanner_lat": sess.get("latitude"), "scanner_lng": sess.get("longitude"),
        "created_at": now, "contact_channels": [],
    })
    await db.sos_uploads.update_one({"id": payload.upload_id}, {"$set": {"status": "completed", "video_id": vid_id, "completed_at": now}})
    await db.sos_chunks.delete_many({"upload_id": payload.upload_id})  # free storage

    try:
        recipients: set[str] = {user["id"]}
        my_vehicle_ids = [v["id"] async for v in db.vehicles.find({"owner_id": user["id"]}, {"id": 1})]
        if my_vehicle_ids:
            phones = {c["phone"] async for c in db.contacts.find({"vehicle_id": {"$in": my_vehicle_ids}}, {"phone": 1}) if c.get("phone")}
            if phones:
                async for u in db.users.find({"phone": {"$in": list(phones)}}, {"id": 1}):
                    recipients.add(u["id"])
        await send_push(recipients=list(recipients), data={
            "title": "🚨 SOS from " + (user.get("name") or "family member"),
            "message": f"{sess.get('duration_ms', 0) / 1000:.0f}s video captured", "action_url": "/alerts",
        }, idempotency_key=alert_id)
    except Exception as _e:
        log.warning("push (chunked sos-video) failed: %s", _e)

    return SOSVideoMeta(id=vid_id, vehicle_id=vehicle_id, duration_ms=sess.get("duration_ms", 0),
                        size_bytes=size, latitude=sess.get("latitude"), longitude=sess.get("longitude"), created_at=now)


@router.post("/vehicles/{vehicle_id}/invites", response_model=InviteCreateOut)
async def create_vehicle_invite(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    token = secrets.token_urlsafe(18)
    expires_at = now_utc() + timedelta(days=7)
    await db.invites.insert_one({
        "id": new_id(),
        "token": token,
        "vehicle_id": vehicle_id,
        "owner_id": user["id"],
        "expires_at": expires_at,
        "used": False,
        "created_at": now_utc(),
    })
    base = os.environ.get("PUBLIC_APP_URL") or ""
    join_url = f"{base.rstrip('/')}/invite/{token}" if base else f"/invite/{token}"
    return InviteCreateOut(token=token, join_url=join_url, expires_at=expires_at)


@router.get("/invites/{token}", response_model=PublicInvitePreview)
async def preview_invite(token: str):
    inv = await db.invites.find_one({"token": token})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    exp = inv["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=410, detail="Invite expired")
    v = await db.vehicles.find_one({"id": inv["vehicle_id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle no longer exists")
    owner = await db.users.find_one({"id": inv["owner_id"]})
    return PublicInvitePreview(
        vehicle_number_plate=v.get("number_plate", "—"),
        invited_by_name=owner.get("name", "Owner") if owner else "Owner",
        expires_at=exp,
        already_accepted=bool(inv.get("used")),
    )


@router.post("/invites/{token}/accept")
async def accept_invite(token: str, user: dict = Depends(current_user)):
    inv = await db.invites.find_one({"token": token})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    exp = inv["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=410, detail="Invite expired")
    if inv["owner_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="You are the owner — nothing to accept")
    existing = await db.vehicle_shares.find_one({
        "vehicle_id": inv["vehicle_id"],
        "shared_with_user_id": user["id"],
    })
    if existing and existing.get("status") == "accepted":
        return {"ok": True, "already_shared": True}
    now = now_utc()
    if existing:
        await db.vehicle_shares.update_one(
            {"id": existing["id"]},
            {"$set": {"status": "accepted", "accepted_at": now}},
        )
    else:
        await db.vehicle_shares.insert_one({
            "id": new_id(),
            "vehicle_id": inv["vehicle_id"],
            "owner_id": inv["owner_id"],
            "shared_with_user_id": user["id"],
            "role": "viewer",
            "status": "accepted",
            "invite_token": token,
            "accepted_at": now,
            "created_at": now,
        })
    await db.invites.update_one({"token": token}, {"$set": {"used": True, "used_at": now}})
    # Push notify the owner that their family joined.
    try:
        await send_push(
            recipients=[inv["owner_id"]],
            data={
                "title": "👨‍👩‍👦 Family joined",
                "message": f"{user.get('name', 'A family member')} accepted your invite",
                "action_url": "/family",
            },
            idempotency_key=f"invite-accept-{token}",
        )
    except Exception as _e:
        log.warning("push (invite accept) failed: %s", _e)
    return {"ok": True, "already_shared": False}


@router.get("/shared-vehicles", response_model=List[SharedVehicleOut])
async def list_shared_vehicles(user: dict = Depends(current_user)):
    out: List[SharedVehicleOut] = []
    async for s in db.vehicle_shares.find(
        {"shared_with_user_id": user["id"], "status": "accepted"}
    ):
        v = await db.vehicles.find_one({"id": s["vehicle_id"]})
        if not v:
            continue
        owner = await db.users.find_one({"id": v["owner_id"]}) or {}
        out.append(
            SharedVehicleOut(
                id=v["id"],
                number_plate=v.get("number_plate", "—"),
                make_model=v.get("make_model"),
                vehicle_type=v.get("vehicle_type", "car"),
                photo_base64=v.get("photo_base64"),
                owner_id=v["owner_id"],
                owner_name=owner.get("name"),
                role=s.get("role", "viewer"),
            )
        )
    return out


@router.get("/vehicles/{vehicle_id}/shares")
async def list_vehicle_shares(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    out = []
    async for s in db.vehicle_shares.find({"vehicle_id": vehicle_id}):
        u = await db.users.find_one({"id": s["shared_with_user_id"]}) or {}
        out.append({
            "id": s["id"],
            "shared_with_user_id": s["shared_with_user_id"],
            "shared_with_name": u.get("name"),
            "shared_with_email": u.get("email"),
            "role": s.get("role", "viewer"),
            "status": s.get("status", "accepted"),
            "accepted_at": s.get("accepted_at"),
        })
    return out


@router.delete("/vehicles/{vehicle_id}/shares/{share_id}")
async def revoke_vehicle_share(vehicle_id: str, share_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    r = await db.vehicle_shares.delete_one({"id": share_id, "vehicle_id": vehicle_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Share not found")
    return {"revoked": True}
