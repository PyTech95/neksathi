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
                verb = "entered" if inside else "left"
                try:
                    if _prefs(user).get("push"):
                        await send_push(recipients=[user["id"]], data={
                            "title": f"📍 {verb.capitalize()} {z.get('name','safe zone')}",
                            "message": f"{user.get('name','You')} {verb} the safe zone '{z.get('name','')}'.",
                            "action_url": "/safety",
                        }, idempotency_key=ev["id"])
                except Exception as _e:
                    log.warning("geofence push failed: %s", _e)
                # Alert emergency contacts on EXIT (leaving a safe zone).
                if not inside:
                    async for c in db.emergency_contacts.find({"user_id": user["id"]}):
                        body = f"📍 Nek Sathi safe-zone alert: {user.get('name','Your contact')} has left the safe zone '{z.get('name','')}'."
                        try:
                            await notify_whatsapp(c.get("phone"), body, meta={"kind": "geofence", "user_id": user["id"]})
                        except Exception:
                            pass
                # Place Alerts for Kids — notify the family guardian, honouring
                # the guardian's alert rules (direction + quiet hours).
                try:
                    fm = await db.family_members.find_one({"user_id": user["id"]})
                    if fm:
                        fam = await db.families.find_one({"id": fm["family_id"]})
                        if fam and fam.get("guardian_id") and fam["guardian_id"] != user["id"] and fam.get("place_alerts_enabled", True) and z["id"] not in fam.get("muted_zones", []):
                            direction = fam.get("place_alert_direction", "both")
                            want = direction == "both" or (direction == "enter" and inside) or (direction == "exit" and not inside)
                            if want and not _in_quiet_hours(fam):
                                who = user.get("name") or "Your family member"
                                place = z.get("name", "a place")
                                msg = f"{who} {'arrived at' if inside else 'left'} {place}."
                                try:
                                    await send_push(recipients=[fam["guardian_id"]], data={
                                        "title": "📍 Place alert", "message": msg, "action_url": "/family",
                                    }, idempotency_key=ev["id"] + "-g")
                                except Exception:
                                    pass
                                guardian = await db.users.find_one({"id": fam["guardian_id"]})
                                if guardian and guardian.get("phone"):
                                    try:
                                        await notify_whatsapp(guardian["phone"], f"📍 Nek Sathi place alert: {msg}",
                                                              meta={"kind": "place_alert", "user_id": user["id"]})
                                    except Exception:
                                        pass
                except Exception as _e:
                    log.warning("place-alert failed: %s", _e)
    return transitions


def _haversine_km(a_lat, a_lng, b_lat, b_lng) -> float:
    from math import radians, sin, cos, asin, sqrt
    dlat = radians(b_lat - a_lat); dlng = radians(b_lng - a_lng)
    h = sin(dlat / 2) ** 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlng / 2) ** 2
    return round(2 * 6371 * asin(sqrt(h)), 2)
