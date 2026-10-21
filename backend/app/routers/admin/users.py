from __future__ import annotations

from datetime import timedelta
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.security import require_admin
from app.utils import now_utc

router = APIRouter()


@router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    now = now_utc()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    total_users = await db.users.count_documents({})
    admins = await db.users.count_documents({"is_admin": True})
    suspended = await db.users.count_documents({"suspended": True})
    total_vehicles = await db.vehicles.count_documents({})
    total_alerts = await db.alerts.count_documents({})
    alerts_24h = await db.alerts.count_documents({"created_at": {"$gte": day_ago}})
    alerts_7d = await db.alerts.count_documents({"created_at": {"$gte": week_ago}})
    emergencies = await db.alerts.count_documents({"type": "emergency"})
    wrong_parking = await db.alerts.count_documents({"type": "wrong_parking"})
    accidents = await db.alerts.count_documents({"type": {"$regex": "^accident"}})
    sos_videos = await db.sos_videos.count_documents({})
    return {
        "users": total_users,
        "admins": admins,
        "suspended": suspended,
        "vehicles": total_vehicles,
        "alerts_total": total_alerts,
        "alerts_24h": alerts_24h,
        "alerts_7d": alerts_7d,
        "emergencies": emergencies,
        "wrong_parking": wrong_parking,
        "accidents": accidents,
        "sos_videos": sos_videos,
    }


@router.get("/admin/users")
async def admin_users(_: dict = Depends(require_admin), q: Optional[str] = None, limit: int = 100):
    filt: dict = {}
    if q:
        filt = {"$or": [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]}
    users = []
    async for u in db.users.find(filt).sort("created_at", -1).limit(limit):
        v_count = await db.vehicles.count_documents({"owner_id": u["id"]})
        users.append({
            "id": u["id"],
            "email": u["email"],
            "name": u["name"],
            "phone": u["phone"],
            "is_admin": bool(u.get("is_admin", False)),
            "suspended": bool(u.get("suspended", False)),
            "vehicles": v_count,
            "created_at": u["created_at"],
        })
    return {"count": len(users), "results": users}


@router.post("/admin/users/{user_id}/suspend")
async def admin_suspend(user_id: str, payload: dict, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    suspend = bool(payload.get("suspended", False))
    await db.users.update_one({"id": user_id}, {"$set": {"suspended": suspend}})
    return {"user_id": user_id, "suspended": suspend}
