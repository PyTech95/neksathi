from __future__ import annotations

from datetime import datetime, timedelta
import math
from app.config import log
from app.db import db
from app.security import _prefs
from app.services.fcm import send_push
from app.services.notify import notify_whatsapp
from app.utils import new_id, now_utc


def _ist_now() -> datetime:
    return now_utc() + timedelta(hours=5, minutes=30)


def _in_quiet_hours(fam: dict) -> bool:
    qs, qe = fam.get("quiet_start"), fam.get("quiet_end")
    if qs is None or qe is None or qs == qe:
        return False
    h = _ist_now().hour
    return (qs <= h < qe) if qs < qe else (h >= qs or h < qe)


async def _evaluate_geofences(user: dict, lat: float, lng: float) -> list:
    """Compare current position to the user's safe zones; log + notify on any
    enter/exit transition. Returns the transitions detected this ping."""
    transitions = []
    async for z in db.safe_zones.find({"user_id": user["id"]}):
        inside = _haversine_km(lat, lng, z["latitude"], z["longitude"]) * 1000 <= z["radius_m"]
        was_inside = bool(z.get("last_inside"))
        if inside != was_inside:
            kind = "enter" if inside else "exit"
            await db.safe_zones.update_one({"id": z["id"]}, {"$set": {"last_inside": inside}})
            ev = {"id": new_id(), "user_id": user["id"], "zone_id": z["id"], "zone_name": z.get("name", "Safe zone"),
                  "type": kind, "latitude": lat, "longitude": lng, "created_at": now_utc()}
            await db.geofence_events.insert_one(dict(ev))
            transitions.append({"zone_name": ev["zone_name"], "type": kind})
            if z.get("notify", True):
                await _geofence_fanout(user, z, kind, inside, lat, lng, ev)
    return transitions


def _haversine_km(a_lat, a_lng, b_lat, b_lng) -> float:
    from math import radians, sin, cos, asin, sqrt
    dlat = radians(b_lat - a_lat); dlng = radians(b_lng - a_lng)
    h = sin(dlat / 2) ** 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlng / 2) ** 2
    return round(2 * 6371 * asin(sqrt(h)), 2)


async def _geofence_fanout(user: dict, z: dict, kind: str, inside: bool, lat: float, lng: float, ev: dict):
    """Tell the WHOLE family circle (and the member themselves) that they entered
    or left a safe zone: an alert-feed row for everyone (so it shows in the bell +
    Alerts feed), a push to the rest of the circle, and a WhatsApp to emergency
    contacts on exit. (pt 2)"""
    verb = "entered" if inside else "left"
    who = user.get("name") or "A family member"
    zone_name = z.get("name", "a safe zone")
    msg = f"{who} {verb} the safe zone '{zone_name}'."
    now = now_utc()

    # Circle = the member first (so it lands in their own feed too) + everyone else.
    member_ids = [user["id"]]
    fam = None
    fm = await db.family_members.find_one({"user_id": user["id"]})
    if fm:
        fam = await db.families.find_one({"id": fm["family_id"]})
        async for m in db.family_members.find({"family_id": fm["family_id"]}):
            if m.get("user_id") and m["user_id"] not in member_ids:
                member_ids.append(m["user_id"])

    muted = bool(fam and z.get("id") in (fam.get("muted_zones") or []))

    # 1) Alert-feed row per circle member -> shows in /alerts + the bell.
    try:
        docs = [{"id": new_id(), "user_id": mid, "type": "geofence", "number_plate": "",
                 "scanner_note": msg, "scanner_lat": lat, "scanner_lng": lng,
                 "zone_name": zone_name, "direction": kind,
                 "actor_id": user["id"], "actor_name": who, "created_at": now}
                for mid in member_ids]
        if docs:
            await db.alerts.insert_many(docs)
    except Exception as _e:
        log.warning("geofence alert-feed insert failed: %s", _e)

    if muted:
        return

    # 2) Push the rest of the circle (the member already sees it live).
    others = [mid for mid in member_ids if mid != user["id"]]
    if others:
        try:
            await send_push(recipients=others, data={
                "type": "geofence", "title": f"\U0001F4CD {who} {verb} {zone_name}",
                "message": msg, "sender_name": who, "location": f"{lat},{lng}",
                "action_url": "/family"}, idempotency_key=ev["id"] + "-fam")
        except Exception as _e:
            log.warning("geofence family push failed: %s", _e)

    # 3) The member's own phone (respecting their push pref).
    try:
        if _prefs(user).get("push"):
            await send_push(recipients=[user["id"]], data={
                "type": "geofence", "title": f"\U0001F4CD {verb.capitalize()} {zone_name}",
                "message": msg, "action_url": "/safety"}, idempotency_key=ev["id"])
    except Exception:
        pass

    # 4) Emergency contacts get a WhatsApp on EXIT.
    if not inside:
        async for c in db.emergency_contacts.find({"user_id": user["id"]}):
            try:
                await notify_whatsapp(c.get("phone"), f"\U0001F4CD Nek Sathi safe-zone alert: {msg}",
                                      meta={"kind": "geofence", "user_id": user["id"]})
            except Exception:
                pass
