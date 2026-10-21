from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import CommunityPostIn
from app.security import current_user
from app.utils import clean, new_id, now_utc

router = APIRouter()


COMMUNITY_CAP = 100


def _post_out(p: dict, uid: str) -> dict:
    likes = p.get("likes", [])
    return {
        "id": p["id"], "author_name": p.get("author_name", "Member"),
        "text": p.get("text", ""), "photo_base64": p.get("photo_base64"),
        "created_at": p.get("created_at"), "like_count": len(likes),
        "liked_by_me": uid in likes, "mine": p.get("user_id") == uid,
    }


@router.get("/community")
async def community_overview(user: dict = Depends(current_user)):
    member_count = await db.community_members.count_documents({})
    is_member = bool(await db.community_members.find_one({"user_id": user["id"]}))
    posts = []
    if is_member:
        async for p in db.community_posts.find().sort("created_at", -1).limit(60):
            posts.append(_post_out(clean(p), user["id"]))
    return {"member_count": member_count, "cap": COMMUNITY_CAP, "is_member": is_member, "posts": posts}


@router.post("/community/join")
async def community_join(user: dict = Depends(current_user)):
    if await db.community_members.find_one({"user_id": user["id"]}):
        return {"joined": True}
    if await db.community_members.count_documents({}) >= COMMUNITY_CAP:
        raise HTTPException(status_code=400, detail="This community group is full (100 members).")
    await db.community_members.insert_one({"id": new_id(), "user_id": user["id"], "name": user.get("name", "Member"), "joined_at": now_utc()})
    return {"joined": True}


@router.post("/community/leave")
async def community_leave(user: dict = Depends(current_user)):
    await db.community_members.delete_one({"user_id": user["id"]})
    return {"left": True}


@router.post("/community/posts")
@rate_limit("20/minute")
async def community_post(request: Request, payload: CommunityPostIn, user: dict = Depends(current_user)):
    if not await db.community_members.find_one({"user_id": user["id"]}):
        raise HTTPException(status_code=403, detail="Join the group to post.")
    if payload.photo_base64 and len(payload.photo_base64) > 3_500_000:
        raise HTTPException(status_code=400, detail="Photo too large (max ~2.5MB).")
    doc = {
        "id": new_id(), "user_id": user["id"], "author_name": user.get("name", "Member"),
        "text": payload.text.strip(), "photo_base64": payload.photo_base64,
        "likes": [], "created_at": now_utc(),
    }
    await db.community_posts.insert_one(dict(doc))
    return _post_out(clean(doc), user["id"])


@router.post("/community/posts/{post_id}/like")
async def community_like(post_id: str, user: dict = Depends(current_user)):
    p = await db.community_posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    likes = set(p.get("likes", []))
    likes.symmetric_difference_update({user["id"]})
    await db.community_posts.update_one({"id": post_id}, {"$set": {"likes": list(likes)}})
    return {"like_count": len(likes), "liked_by_me": user["id"] in likes}


@router.delete("/community/posts/{post_id}")
async def community_delete(post_id: str, user: dict = Depends(current_user)):
    p = await db.community_posts.find_one({"id": post_id})
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    if p["user_id"] != user["id"] and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="You can only delete your own posts.")
    await db.community_posts.delete_one({"id": post_id})
    return {"deleted": True}
