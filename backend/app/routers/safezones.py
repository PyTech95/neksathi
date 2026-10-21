from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import GeofenceEventOut, SafeZoneIn, SafeZoneOut
from app.security import current_user
from app.utils import clean, new_id, now_utc

router = APIRouter()


@router.get("/me/safe-zones", response_model=List[SafeZoneOut])
async def list_safe_zones(user: dict = Depends(current_user)):
    items = []
    async for z in db.safe_zones.find({"user_id": user["id"]}).sort("created_at", -1):
        items.append(SafeZoneOut(**clean(z)))
    return items


@router.post("/me/safe-zones", response_model=SafeZoneOut)
async def add_safe_zone(payload: SafeZoneIn, user: dict = Depends(current_user)):
    doc = {"id": new_id(), "user_id": user["id"], "last_inside": None, "created_at": now_utc(), **payload.model_dump()}
    await db.safe_zones.insert_one(dict(doc))
    return SafeZoneOut(**clean(doc))


@router.delete("/me/safe-zones/{zone_id}")
async def delete_safe_zone(zone_id: str, user: dict = Depends(current_user)):
    r = await db.safe_zones.delete_one({"id": zone_id, "user_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Zone not found")
    await db.geofence_events.delete_many({"zone_id": zone_id})
    return {"deleted": True}


@router.get("/me/geofence-events", response_model=List[GeofenceEventOut])
async def list_geofence_events(user: dict = Depends(current_user), limit: int = 30):
    items = []
    async for e in db.geofence_events.find({"user_id": user["id"]}).sort("created_at", -1).limit(min(limit, 100)):
        items.append(GeofenceEventOut(**clean(e)))
    return items
