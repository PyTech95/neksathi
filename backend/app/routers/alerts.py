from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import AlertOut
from app.security import current_user
from app.utils import _visible_vehicle_ids, clean

router = APIRouter()


def _alerts_query(user: dict, visible) -> dict:
    query: dict = {"$or": [{"user_id": user["id"]}]}
    if visible:
        query["$or"].append({"vehicle_id": {"$in": visible}})
    return query


@router.get("/alerts", response_model=List[AlertOut])
async def list_alerts(user: dict = Depends(current_user), limit: int = 100, skip: int = 0):
    # `skip` lets the notification bell page through 6 at a time ("View more")
    # instead of loading the whole feed at once. Backward compatible: without
    # skip/limit it still returns the latest 100, newest first.
    visible = await _visible_vehicle_ids(user["id"])
    query = _alerts_query(user, visible)
    limit = max(1, min(limit, 100))
    skip = max(0, skip)
    items = []
    async for a in db.alerts.find(query).sort("created_at", -1).skip(skip).limit(limit):
        items.append(AlertOut(**clean(a)))
    return items


@router.get("/alerts/count")
async def alerts_count(user: dict = Depends(current_user), since: Optional[str] = None):
    """Lightweight counts for the bell badge: total alerts, and how many are
    newer than the client's last-seen time (`since`, ISO 8601). No documents are
    returned, so the badge stays cheap even with thousands of alerts."""
    visible = await _visible_vehicle_ids(user["id"])
    query = _alerts_query(user, visible)
    total = await db.alerts.count_documents(query)
    unread = total
    if since:
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            q2 = dict(query)
            q2["created_at"] = {"$gt": dt}
            unread = await db.alerts.count_documents(q2)
        except Exception:
            unread = total
    return {"total": total, "unread": unread}
