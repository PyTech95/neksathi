from __future__ import annotations

from datetime import timedelta
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import CirclePingIn, TempCircleIn, TempJoinIn
from app.security import current_user
from app.utils import _aware, new_id, now_utc

router = APIRouter()


async def _active_temp_circle(key: str, by: str = "code"):
    q = {"join_code": key.upper()} if by == "code" else {"id": key}
    c = await db.temp_circles.find_one(q)
    if not c or _aware(c["expires_at"]) <= now_utc():
        return None
    return c


def _circle_out(c: dict) -> dict:
    return {"id": c["id"], "name": c["name"], "join_code": c["join_code"], "owner_id": c["owner_id"],
            "owner_name": c.get("owner_name"), "expires_at": c["expires_at"]}


@router.post("/circles/temp")
async def create_temp_circle(payload: TempCircleIn, user: dict = Depends(current_user)):
    now = now_utc()
    doc = {"id": new_id(), "owner_id": user["id"], "owner_name": user.get("name"), "name": payload.name,
           "join_code": new_id().replace("-", "")[:6].upper(), "created_at": now,
           "expires_at": now + timedelta(hours=payload.hours)}
    await db.temp_circles.insert_one(dict(doc))
    await db.temp_circle_members.insert_one({"id": new_id(), "circle_id": doc["id"], "user_id": user["id"],
        "name": user.get("name") or "You", "is_owner": True, "joined_at": now,
        "latitude": None, "longitude": None, "last_seen": None})
    return {"id": doc["id"], "join_code": doc["join_code"], "expires_at": doc["expires_at"]}


@router.post("/circles/temp/join")
async def join_temp_circle(payload: TempJoinIn, user: dict = Depends(current_user)):
    c = await _active_temp_circle(payload.code, "code")
    if not c:
        raise HTTPException(status_code=404, detail="Circle not found or it has expired.")
    if not await db.temp_circle_members.find_one({"circle_id": c["id"], "user_id": user["id"]}):
        await db.temp_circle_members.insert_one({"id": new_id(), "circle_id": c["id"], "user_id": user["id"],
            "name": user.get("name") or "Member", "is_owner": False, "joined_at": now_utc(),
            "latitude": None, "longitude": None, "last_seen": None})
    return {"id": c["id"], "name": c["name"], "expires_at": c["expires_at"]}


@router.get("/circles/temp")
async def list_temp_circles(user: dict = Depends(current_user)):
    cids = [m["circle_id"] async for m in db.temp_circle_members.find({"user_id": user["id"]})]
    now = now_utc()
    out = []
    async for c in db.temp_circles.find({"id": {"$in": cids}}):
        if _aware(c["expires_at"]) <= now:
            continue
        out.append({**_circle_out(c), "is_owner": c["owner_id"] == user["id"]})
    out.sort(key=lambda x: x["expires_at"])
    return {"items": out}


@router.get("/circles/temp/{circle_id}")
async def get_temp_circle(circle_id: str, user: dict = Depends(current_user)):
    c = await _active_temp_circle(circle_id, "id")
    if not c:
        raise HTTPException(status_code=404, detail="Circle not found or it has expired.")
    if not await db.temp_circle_members.find_one({"circle_id": circle_id, "user_id": user["id"]}):
        raise HTTPException(status_code=403, detail="You're not in this circle.")
    members = []
    async for m in db.temp_circle_members.find({"circle_id": circle_id}):
        members.append({"user_id": m["user_id"], "name": m.get("name"), "is_owner": m.get("is_owner", False),
            "latitude": m.get("latitude"), "longitude": m.get("longitude"), "last_seen": m.get("last_seen"),
            "is_me": m["user_id"] == user["id"]})
    return {**_circle_out(c), "is_owner": c["owner_id"] == user["id"], "members": members}


@router.post("/circles/temp/{circle_id}/ping")
async def ping_temp_circle(circle_id: str, payload: CirclePingIn, user: dict = Depends(current_user)):
    if not await _active_temp_circle(circle_id, "id"):
        raise HTTPException(status_code=404, detail="Circle not found or it has expired.")
    r = await db.temp_circle_members.update_one({"circle_id": circle_id, "user_id": user["id"]},
        {"$set": {"latitude": payload.latitude, "longitude": payload.longitude, "last_seen": now_utc()}})
    if not r.matched_count:
        raise HTTPException(status_code=403, detail="You're not in this circle.")
    return {"ok": True}


@router.post("/circles/temp/{circle_id}/leave")
async def leave_temp_circle(circle_id: str, user: dict = Depends(current_user)):
    c = await db.temp_circles.find_one({"id": circle_id})
    if c and c["owner_id"] == user["id"]:
        await db.temp_circles.update_one({"id": circle_id}, {"$set": {"expires_at": now_utc()}})
        await db.temp_circle_members.delete_many({"circle_id": circle_id})
        return {"ended": True}
    await db.temp_circle_members.delete_one({"circle_id": circle_id, "user_id": user["id"]})
    return {"left": True}


@router.post("/circles/temp/{circle_id}/end")
async def end_temp_circle(circle_id: str, user: dict = Depends(current_user)):
    c = await db.temp_circles.find_one({"id": circle_id})
    if not c or c["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the creator can end this circle.")
    await db.temp_circles.update_one({"id": circle_id}, {"$set": {"expires_at": now_utc()}})
    return {"ended": True}
