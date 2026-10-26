from __future__ import annotations

import asyncio
import base64
import os
import uuid
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.services.email import send_email
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import DeviceIn, DeviceOut, IntruderEventOut, IntruderIn, SimSwapIn, SirenIn
from app.security import _prefs, current_user
from app.services.fcm import send_push
from app.services.gdrive import _gdrive_autobackup
from app.services.notify import notify_whatsapp, send_sms
from app.utils import clean, new_id, now_utc

router = APIRouter()


def _device_out(d: dict) -> DeviceOut:
    return DeviceOut(**{k: v for k, v in clean(d).items() if k in DeviceOut.model_fields})


@router.post("/devices", response_model=DeviceOut)
async def register_device(payload: DeviceIn, user: dict = Depends(current_user)):
    doc = {"id": new_id(), "user_id": user["id"], "locked": False, "created_at": now_utc(),
           "last_seen": now_utc(), **payload.model_dump()}
    await db.devices.insert_one(dict(doc))
    return _device_out(doc)


@router.get("/devices", response_model=List[DeviceOut])
async def list_devices(user: dict = Depends(current_user)):
    items = []
    async for d in db.devices.find({"user_id": user["id"]}).sort("created_at", -1):
        items.append(_device_out(d))
    return items


@router.put("/devices/{device_id}", response_model=DeviceOut)
async def update_device(device_id: str, payload: DeviceIn, user: dict = Depends(current_user)):
    d = await db.devices.find_one({"id": device_id, "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.devices.update_one({"id": device_id}, {"$set": payload.model_dump()})
    d.update(payload.model_dump())
    return _device_out(d)


@router.delete("/devices/{device_id}")
async def delete_device(device_id: str, user: dict = Depends(current_user)):
    r = await db.devices.delete_one({"id": device_id, "user_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.intruder_events.delete_many({"device_id": device_id, "user_id": user["id"]})
    await db.sim_events.delete_many({"device_id": device_id, "user_id": user["id"]})
    return {"deleted": True}


@router.get("/devices/{device_id}/lock-state")
async def device_lock_state(device_id: str, user: dict = Depends(current_user)):
    d = await db.devices.find_one({"id": device_id, "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.devices.update_one({"id": device_id}, {"$set": {"last_seen": now_utc()}})
    return {"locked": bool(d.get("locked")), "lock_threshold": d.get("lock_threshold", 3)}


@router.post("/devices/{device_id}/lock")
async def lock_device(device_id: str, user: dict = Depends(current_user)):
    r = await db.devices.update_one({"id": device_id, "user_id": user["id"]}, {"$set": {"locked": True}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"locked": True}


@router.post("/devices/{device_id}/unlock")
async def unlock_device(device_id: str, user: dict = Depends(current_user)):
    r = await db.devices.update_one({"id": device_id, "user_id": user["id"]}, {"$set": {"locked": False}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"locked": False}


@router.post("/devices/{device_id}/recover")
async def recover_device(device_id: str, user: dict = Depends(current_user)):
    """Phone found safe — clear the lock and siren in one tap (e.g. after a SIM-swap escalation)."""
    r = await db.devices.update_one({"id": device_id, "user_id": user["id"]},
                                    {"$set": {"locked": False, "siren_active": False}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"locked": False, "siren_active": False}


async def _theft_fanout(user: dict, device: dict, event: dict, public_link: str):
    who = user.get("name") or "A Nek Sathi user"
    loc = ""
    if event.get("latitude") is not None:
        loc = f" Location: https://maps.google.com/?q={event['latitude']},{event['longitude']}."
    body = (f"🚨 Nek Sathi THEFT ALERT: {event['attempt_count']} failed unlock attempts on {who}'s "
            f"phone '{device.get('name','device')}'."
            f"{' The phone is now LOCKED.' if event.get('triggered_lock') else ''}"
            f"{loc} View intruder photo: {public_link}")
    # Recipients: emergency contacts + chosen guardian.
    phones = []
    async for c in db.emergency_contacts.find({"user_id": user["id"]}):
        if c.get("phone"):
            phones.append(c["phone"])
    gid = device.get("guardian_contact_id")
    if gid:
        g = await db.emergency_contacts.find_one({"id": gid, "user_id": user["id"]})
        if g and g.get("phone") and g["phone"] not in phones:
            phones.append(g["phone"])
    admin_phones, admin_emails = [], []
    if device.get("super_admin_alerts", True):
        async for a in db.users.find({"is_admin": True}):
            if a.get("phone"):
                admin_phones.append(a["phone"])
            if a.get("email"):
                admin_emails.append(a["email"])
    for p in phones + admin_phones:
        try:
            await notify_whatsapp(p, body, meta={"kind": "theft", "user_id": user["id"]})
        except Exception:
            pass
        try:
            await send_sms(p, body, meta={"kind": "theft", "user_id": user["id"]})
        except Exception:
            pass
    try:
        if _prefs(user).get("push"):
            await send_push(recipients=[user["id"]], data={
                "title": "🚨 Intruder detected", "message": f"{event['attempt_count']} failed unlocks on {device.get('name','your device')}.",
                "action_url": "/theft-protection"}, idempotency_key=event["id"])
    except Exception:
        pass
    # Fan out to the owner's family circle too — a stolen/locked phone is exactly
    # when family should get the alert and be able to see the intruder photo +
    # location (in their own Nek Sathi app and on the Family web page).
    try:
        fm = await db.family_members.find_one({"user_id": user["id"]})
        if fm:
            fam_user_ids, fam_phones = [], []
            async for m in db.family_members.find({"family_id": fm["family_id"]}):
                if m.get("user_id") and m["user_id"] != user["id"]:
                    fam_user_ids.append(m["user_id"])
                if m.get("phone"):
                    fam_phones.append(m["phone"])
            if fam_user_ids:
                async for mu in db.users.find({"id": {"$in": fam_user_ids}}):
                    if mu.get("phone"):
                        fam_phones.append(mu["phone"])
            fam_body = (f"🚨 Nek Sathi FAMILY ALERT: {event['attempt_count']} failed unlock attempts on "
                        f"{who}'s phone '{device.get('name','device')}'."
                        f"{' The phone is now LOCKED.' if event.get('triggered_lock') else ''}"
                        f"{loc} Open Nek Sathi → Family to see the intruder photo & location.")
            for p in set(fam_phones):
                try:
                    await notify_whatsapp(p, fam_body, meta={"kind": "theft_family", "user_id": user["id"]})
                except Exception:
                    pass
                try:
                    await send_sms(p, fam_body, meta={"kind": "theft_family", "user_id": user["id"]})
                except Exception:
                    pass
            if fam_user_ids:
                try:
                    await send_push(recipients=fam_user_ids, data={
                        "title": "🚨 Family alert — intruder detected",
                        "message": f"{event['attempt_count']} failed unlocks on {who}'s phone. Tap to see the photo & location.",
                        "action_url": "/family"}, idempotency_key="fam-" + event["id"])
                except Exception:
                    pass
    except Exception:
        pass
    # Email the photo inline to the owner + super admins.
    email_targets = [e for e in ([user.get("email")] + admin_emails) if e]
    if email_targets and event.get("photo_base64"):
        img = event["photo_base64"]
        if not img.startswith("data:"):
            img = "data:image/jpeg;base64," + img
        html = (f"<div style='font-family:sans-serif'><h2>🚨 Theft alert</h2>"
                f"<p>{event['attempt_count']} failed unlock attempts on <b>{who}'s</b> phone "
                f"'<b>{device.get('name','device')}</b>'.{' The phone has been locked.' if event.get('triggered_lock') else ''}</p>"
                f"<p><img src='{img}' style='max-width:320px;border-radius:8px'/></p>"
                f"<p><a href='{public_link}'>Open the intruder capture</a></p></div>")
        for e in set(email_targets):
            try:
                await send_email(e, "🚨 Nek Sathi Theft Alert", html)
            except Exception:
                pass


@router.post("/devices/{device_id}/intruder", response_model=IntruderEventOut)
@rate_limit("20/minute")
async def report_intruder(request: Request, device_id: str, payload: IntruderIn, user: dict = Depends(current_user)):
    device = await db.devices.find_one({"id": device_id, "user_id": user["id"]})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    threshold = device.get("lock_threshold", 3)
    triggered_lock = payload.attempt_count >= threshold
    if triggered_lock and not device.get("locked"):
        await db.devices.update_one({"id": device_id}, {"$set": {"locked": True}})
    event = {"id": new_id(), "user_id": user["id"], "device_id": device_id,
             "device_name": device.get("name", "device"), "photo_base64": payload.photo_base64,
             "attempt_count": payload.attempt_count, "latitude": payload.latitude, "longitude": payload.longitude,
             "view_token": uuid.uuid4().hex, "triggered_lock": triggered_lock, "created_at": now_utc(), "viewed": False}
    await db.intruder_events.insert_one(dict(event))
    front = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    public_link = f"{front}/intruder/{event['view_token']}"
    await _theft_fanout(user, device, event, public_link)
    if payload.photo_base64:
        asyncio.create_task(_gdrive_autobackup(user["id"], payload.photo_base64, f"intruder-{event['id']}.jpg", "image/jpeg"))
    out = {k: v for k, v in clean(event).items() if k in IntruderEventOut.model_fields}
    out["has_photo"] = bool(payload.photo_base64)
    return IntruderEventOut(**out)


@router.get("/intruder-events", response_model=List[IntruderEventOut])
async def list_intruder_events(user: dict = Depends(current_user), limit: int = 50):
    items = []
    async for e in db.intruder_events.find({"user_id": user["id"]}).sort("created_at", -1).limit(min(limit, 200)):
        e = clean(e); e["has_photo"] = bool(e.get("photo_base64")); e.pop("photo_base64", None)
        items.append(IntruderEventOut(**{k: v for k, v in e.items() if k in IntruderEventOut.model_fields}))
    return items


@router.get("/intruder-events/{event_id}/photo")
async def get_intruder_photo(event_id: str, user: dict = Depends(current_user)):
    e = await db.intruder_events.find_one({"id": event_id, "user_id": user["id"]})
    if not e or not e.get("photo_base64"):
        raise HTTPException(status_code=404, detail="No photo for this event.")
    return {"photo_base64": e["photo_base64"]}


@router.get("/public/intruder/{token}")
@rate_limit("30/minute")
async def public_intruder(request: Request, token: str):
    e = await db.intruder_events.find_one({"view_token": token})
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    return {"device_name": e.get("device_name"), "attempt_count": e.get("attempt_count"),
            "photo_base64": e.get("photo_base64"), "latitude": e.get("latitude"),
            "longitude": e.get("longitude"), "triggered_lock": e.get("triggered_lock"),
            "created_at": e.get("created_at")}


async def _sim_swap_fanout(user: dict, device: dict, ev: dict):
    who = user.get("name") or "A Nek Sathi user"
    loc = ""
    if ev.get("latitude") is not None:
        loc = f" Location: https://maps.google.com/?q={ev['latitude']},{ev['longitude']}."
    carrier = f" New carrier: {ev.get('carrier')}." if ev.get("carrier") else ""
    num = f" New number: {ev.get('new_number')}." if ev.get("new_number") else ""
    body = (f"🚨 Nek Sathi SIM CHANGE ALERT: the SIM in {who}'s phone '{device.get('name','device')}' was changed. "
            f"This can mean the phone was stolen. The phone has been LOCKED and its siren is now sounding.{carrier}{num}{loc}")
    phones = []
    async for c in db.emergency_contacts.find({"user_id": user["id"]}):
        if c.get("phone"):
            phones.append(c["phone"])
    gid = device.get("guardian_contact_id")
    if gid:
        g = await db.emergency_contacts.find_one({"id": gid, "user_id": user["id"]})
        if g and g.get("phone") and g["phone"] not in phones:
            phones.append(g["phone"])
    for p in phones:
        try:
            await notify_whatsapp(p, body, meta={"kind": "sim_swap", "user_id": user["id"]})
        except Exception:
            pass
        try:
            await send_sms(p, body, meta={"kind": "sim_swap", "user_id": user["id"]})
        except Exception:
            pass
    try:
        if _prefs(user).get("push"):
            await send_push(recipients=[user["id"]], data={
                "title": "🚨 SIM changed", "message": f"The SIM in {device.get('name','your device')} was changed.",
                "action_url": "/theft-protection"}, idempotency_key=ev["id"])
    except Exception:
        pass


@router.post("/devices/{device_id}/sim-swap")
@rate_limit("10/minute")
async def report_sim_swap(request: Request, device_id: str, payload: SimSwapIn, user: dict = Depends(current_user)):
    device = await db.devices.find_one({"id": device_id, "user_id": user["id"]})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    ev = {"id": new_id(), "user_id": user["id"], "device_id": device_id,
          "device_name": device.get("name", "device"), "new_number": payload.new_number,
          "carrier": payload.carrier, "imsi": payload.imsi,
          "latitude": payload.latitude, "longitude": payload.longitude, "created_at": now_utc()}
    await db.sim_events.insert_one(dict(ev))
    # Escalation: a SIM swap auto-locks the phone and sounds the siren immediately.
    await db.devices.update_one({"id": device_id}, {"$set": {"locked": True, "siren_active": True}})
    await _sim_swap_fanout(user, device, ev)
    return {"reported": True, "id": ev["id"], "locked": True, "siren_active": True}


@router.get("/sim-events")
async def list_sim_events(user: dict = Depends(current_user), limit: int = 50):
    items = []
    async for e in db.sim_events.find({"user_id": user["id"]}).sort("created_at", -1).limit(min(limit, 200)):
        items.append(clean(e))
    return {"count": len(items), "items": items}


@router.post("/devices/{device_id}/siren")
async def set_siren(device_id: str, payload: SirenIn, user: dict = Depends(current_user)):
    r = await db.devices.update_one({"id": device_id, "user_id": user["id"]},
                                    {"$set": {"siren_active": payload.active}})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"siren_active": payload.active}


@router.get("/devices/{device_id}/siren-state")
async def siren_state(device_id: str, user: dict = Depends(current_user)):
    d = await db.devices.find_one({"id": device_id, "user_id": user["id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.devices.update_one({"id": device_id}, {"$set": {"last_seen": now_utc()}})
    return {"siren_active": bool(d.get("siren_active"))}
