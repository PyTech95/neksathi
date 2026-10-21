from __future__ import annotations

from datetime import timedelta
import base64
import hashlib
import os
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import BlackspotIn, BlackspotOut
from app.security import current_user, require_admin
from app.utils import clean, new_id, now_utc

router = APIRouter()


@router.get("/")
async def root():
    return {"service": "Nek Sathi API", "status": "ok"}


@router.get("/blackspots", response_model=List[BlackspotOut])
async def list_blackspots(_: dict = Depends(current_user)):
    return [BlackspotOut(**clean(b)) async for b in db.blackspots.find().sort("severity", -1)]


@router.post("/admin/blackspots", response_model=BlackspotOut)
async def create_blackspot(payload: BlackspotIn, _: dict = Depends(require_admin)):
    b = {"id": new_id(), "created_at": now_utc(), **payload.model_dump()}
    await db.blackspots.insert_one(dict(b))
    return BlackspotOut(**clean(b))


@router.delete("/admin/blackspots/{bid}")
async def delete_blackspot(bid: str, _: dict = Depends(require_admin)):
    r = await db.blackspots.delete_one({"id": bid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Blackspot not found")
    return {"deleted": True}


NEARBY_MOCK = [
    {"id": "h1", "name": "City General Hospital", "type": "hospital", "phone": "+911244400400", "distance_km": 1.2, "address": "Sector 12, Main Road", "lat": 28.6205, "lng": 77.2115},
    {"id": "h2", "name": "Apollo Emergency", "type": "hospital", "phone": "+911244400500", "distance_km": 2.8, "address": "MG Road", "lat": 28.6270, "lng": 77.2245},
    {"id": "a1", "name": "108 Ambulance Service", "type": "ambulance", "phone": "108", "distance_km": 0.0, "address": "Statewide", "lat": 28.6145, "lng": 77.2090},
    {"id": "a2", "name": "Red Cross Ambulance", "type": "ambulance", "phone": "+911123456789", "distance_km": 3.4, "address": "Civil Lines", "lat": 28.6350, "lng": 77.2200},
    {"id": "p1", "name": "Central Police Station", "type": "police", "phone": "100", "distance_km": 1.8, "address": "Kotwali Chowk", "lat": 28.6100, "lng": 77.2025},
    {"id": "p2", "name": "Traffic Police Control", "type": "police", "phone": "1073", "distance_km": 4.1, "address": "Highway Junction", "lat": 28.5970, "lng": 77.2320},
]


@router.get("/nearby")
async def nearby(lat: Optional[float] = None, lng: Optional[float] = None):
    """Return nearby help centers. Currently returns static mock data —
    plug Google Places API here in phase 2."""
    return {"count": len(NEARBY_MOCK), "results": NEARBY_MOCK}


@router.get("/summary")
async def summary(user: dict = Depends(current_user)):
    vehicles = await db.vehicles.count_documents({"owner_id": user["id"]})
    vehicle_ids = [v["id"] async for v in db.vehicles.find({"owner_id": user["id"]}, {"id": 1})]
    total_alerts = 0
    emergencies = 0
    parking = 0
    accidents = 0
    if vehicle_ids:
        total_alerts = await db.alerts.count_documents({"vehicle_id": {"$in": vehicle_ids}})
        emergencies = await db.alerts.count_documents({"vehicle_id": {"$in": vehicle_ids}, "type": "emergency"})
        parking = await db.alerts.count_documents({"vehicle_id": {"$in": vehicle_ids}, "type": "wrong_parking"})
        accidents = await db.alerts.count_documents({"vehicle_id": {"$in": vehicle_ids}, "type": {"$regex": "^accident"}})
    return {
        "vehicles": vehicles,
        "total_alerts": total_alerts,
        "emergencies": emergencies,
        "wrong_parking": parking,
        "accidents": accidents,
    }


async def _user_has_pro(user_id: str) -> bool:
    """Family Pro subscribers get access to the Pro analytics dashboard.
    Admin users are treated as Pro for QA convenience."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "is_admin": 1})
    if user and user.get("is_admin"):
        return True
    sub = await db.subscriptions.find_one({
        "user_id": user_id,
        "plan_code": "family_pro",
        "status": "active",
    })
    return bool(sub)


@router.get("/analytics/access")
async def analytics_access(user: dict = Depends(current_user)):
    """Lightweight endpoint the frontend hits to know whether to show the paywall."""
    return {"pro": await _user_has_pro(user["id"])}


@router.get("/analytics")
async def analytics(user: dict = Depends(current_user), days: int = 30):
    """Owner-scoped analytics feed for the Pro dashboard.

    Returns:
    - `pro`: bool — whether the caller currently has Pro access.
    - `daily`: [{date, total, emergency, wrong_parking, speed_alert}] for the last N days.
    - `by_type`: {type: count} across all alerts in the window.
    - `heatmap`: [{lat, lng, weight}] downsampled scan locations for the map.
    - `safety_score`: {score 0-100, band string, alerts_per_vehicle_per_week}.
    - `top_vehicle`: {number_plate, alerts_count} or null.
    - `window_days`: N.
    """
    pro = await _user_has_pro(user["id"])
    days = max(1, min(days, 90))

    vehicle_ids = [v["id"] async for v in db.vehicles.find({"owner_id": user["id"]}, {"id": 1})]
    vehicles_count = len(vehicle_ids)
    now = now_utc()
    since = now - timedelta(days=days)

    daily: list[dict] = []
    by_type: dict[str, int] = {}
    heatmap: list[dict] = []
    top_vehicle: Optional[dict] = None
    total_window = 0

    if vehicle_ids:
        # Bucket by day and by type.
        buckets: dict[str, dict[str, int]] = {}
        cursor = db.alerts.find(
            {"vehicle_id": {"$in": vehicle_ids}, "created_at": {"$gte": since}},
        )
        vehicle_alert_counts: dict[str, int] = {}
        async for a in cursor:
            ts = a.get("created_at")
            if ts and hasattr(ts, "strftime"):
                key = ts.strftime("%Y-%m-%d")
            else:
                key = str(ts)[:10]
            row = buckets.setdefault(key, {})
            row["total"] = row.get("total", 0) + 1
            t = a.get("type") or "unknown"
            # normalise accident_* to accident
            norm = "accident" if t.startswith("accident") else t
            row[norm] = row.get(norm, 0) + 1
            by_type[norm] = by_type.get(norm, 0) + 1
            total_window += 1
            vid = a.get("vehicle_id")
            if vid:
                vehicle_alert_counts[vid] = vehicle_alert_counts.get(vid, 0) + 1
            lat = a.get("scanner_lat")
            lng = a.get("scanner_lng")
            if lat is not None and lng is not None:
                heatmap.append({"lat": float(lat), "lng": float(lng), "weight": 1})

        # Fill daily rows for every day in the window (0-fill missing dates).
        for i in range(days):
            d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
            row = buckets.get(d, {})
            daily.append({
                "date": d,
                "total": row.get("total", 0),
                "emergency": row.get("emergency", 0),
                "wrong_parking": row.get("wrong_parking", 0),
                "speed_alert": row.get("speed_alert", 0),
                "accident": row.get("accident", 0),
            })

        # Top vehicle (most alerts)
        if vehicle_alert_counts:
            top_id = max(vehicle_alert_counts, key=vehicle_alert_counts.get)
            top_v = await db.vehicles.find_one({"id": top_id}, {"_id": 0, "number_plate": 1})
            if top_v:
                top_vehicle = {
                    "number_plate": top_v["number_plate"],
                    "alerts_count": vehicle_alert_counts[top_id],
                }

    # Fill daily with zeros for the whole window even when the caller has no
    # vehicles yet, so the chart always renders a clean baseline.
    if not daily:
        for i in range(days):
            d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
            daily.append({
                "date": d,
                "total": 0,
                "emergency": 0,
                "wrong_parking": 0,
                "speed_alert": 0,
                "accident": 0,
            })

    # Safety score: 100 = perfect, degrades with alerts-per-vehicle-per-week.
    weeks = max(days / 7.0, 1.0)
    apvpw = (total_window / max(vehicles_count, 1)) / weeks if vehicles_count else 0.0
    # Score bands: 0 alerts → 100. 5+ per vehicle per week → 0.
    score = max(0.0, min(100.0, 100.0 - (apvpw * 20.0)))
    score_int = int(round(score))
    if score_int >= 85:
        band = "Excellent"
    elif score_int >= 65:
        band = "Good"
    elif score_int >= 40:
        band = "Watch"
    else:
        band = "At risk"

    # Downsample heatmap if huge (>300 points)
    if len(heatmap) > 300:
        step = len(heatmap) // 300
        heatmap = heatmap[::step]

    return {
        "pro": pro,
        "window_days": days,
        "vehicles": vehicles_count,
        "total_alerts": total_window,
        "daily": daily,
        "by_type": by_type,
        "heatmap": heatmap,
        "safety_score": {
            "score": score_int,
            "band": band,
            "alerts_per_vehicle_per_week": round(apvpw, 2),
        },
        "top_vehicle": top_vehicle,
        "generated_at": now.isoformat(),
    }


@router.api_route("/telephony/inbound", methods=["GET", "POST"])
async def telephony_inbound():
    xml = ("<?xml version='1.0' encoding='UTF-8'?><Response>"
           "<Say voice='alice'>Thank you for calling Nek Sathi. Please scan the vehicle Q R code and use the app to be connected privately. Goodbye.</Say>"
           "</Response>")
    return Response(content=xml, media_type="application/xml")


@router.get("/turn-credentials")
async def turn_credentials(ttl: int = 3600):
    import hmac as _hmac, hashlib as _hashlib, base64 as _b64, time as _time
    secret = os.environ.get("TURN_SECRET", "").strip()
    host = os.environ.get("TURN_HOST", "turn.neksathi.in").strip()
    ttl = max(300, min(int(ttl), 86400))
    if not secret:
        return {"iceServers": [{"urls": [f"stun:{host}:3478"]}], "ttl": 0, "configured": False}
    username = str(int(_time.time()) + ttl)
    digest = _hmac.new(secret.encode(), username.encode(), _hashlib.sha1).digest()
    credential = _b64.b64encode(digest).decode()
    return {
        "iceServers": [
            {"urls": [f"stun:{host}:3478"]},
            {"urls": [f"turn:{host}:3478?transport=udp", f"turn:{host}:3478?transport=tcp"],
             "username": username, "credential": credential},
        ],
        "ttl": ttl, "configured": True,
    }
