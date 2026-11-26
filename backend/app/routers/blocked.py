from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.db import db
from app.security import current_user, canon_phone
from app.utils import clean, new_id, now_utc

router = APIRouter()


class BlockNumberIn(BaseModel):
    phone: str = Field(min_length=3, max_length=20)
    label: Optional[str] = Field(default=None, max_length=80)


class BlockedNumberOut(BaseModel):
    id: str
    phone: str
    label: Optional[str] = None
    created_at: datetime


@router.get("/me/blocked-numbers", response_model=List[BlockedNumberOut])
async def list_blocked_numbers(user: dict = Depends(current_user)):
    items = []
    async for b in db.blocked_numbers.find({"owner_id": user["id"]}).sort("created_at", -1):
        items.append(BlockedNumberOut(**clean(b)))
    return items


@router.post("/me/blocked-numbers", response_model=BlockedNumberOut)
async def add_blocked_number(payload: BlockNumberIn, user: dict = Depends(current_user)):
    norm = canon_phone(payload.phone)
    if not norm:
        raise HTTPException(status_code=400, detail="Enter a valid phone number.")
    existing = await db.blocked_numbers.find_one({"owner_id": user["id"], "phone_norm": norm})
    if existing:
        return BlockedNumberOut(**clean(existing))
    doc = {
        "id": new_id(),
        "owner_id": user["id"],
        "phone": payload.phone.strip(),
        "phone_norm": norm,
        "label": (payload.label or None),
        "created_at": now_utc(),
    }
    await db.blocked_numbers.insert_one(dict(doc))
    return BlockedNumberOut(**doc)


@router.delete("/me/blocked-numbers/{block_id}")
async def remove_blocked_number(block_id: str, user: dict = Depends(current_user)):
    r = await db.blocked_numbers.delete_one({"id": block_id, "owner_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


async def is_number_blocked(owner_id: str, phone: Optional[str]) -> bool:
    """True if `owner_id` has blocked `phone`. Used by the public scan/alert flow
    to silently drop alerts from a blocked scanner number."""
    norm = canon_phone(phone or "")
    if not norm:
        return False
    return bool(await db.blocked_numbers.find_one({"owner_id": owner_id, "phone_norm": norm}))
