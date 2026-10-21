from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import AlertOut
from app.security import current_user
from app.utils import _visible_vehicle_ids, clean

router = APIRouter()


@router.get("/alerts", response_model=List[AlertOut])
async def list_alerts(user: dict = Depends(current_user), limit: int = 100):
    visible = await _visible_vehicle_ids(user["id"])
    query: dict = {"$or": [{"user_id": user["id"]}]}
    if visible:
        query["$or"].append({"vehicle_id": {"$in": visible}})
    items = []
    async for a in db.alerts.find(query).sort("created_at", -1).limit(limit):
        items.append(AlertOut(**clean(a)))
    return items
