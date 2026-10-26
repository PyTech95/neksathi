from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import DealerAccountIn, UserOut
from app.security import hash_password, require_admin, require_dealer, to_user_out
from app.utils import new_id, now_utc

router = APIRouter()


@router.post("/admin/vendors/{vendor_id}/account", response_model=UserOut)
async def admin_create_dealer_account(vendor_id: str, payload: DealerAccountIn, _: dict = Depends(require_admin)):
    vendor = await db.vendors.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Dealer not found")
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")
    user = {
        "id": new_id(), "email": email,
        "name": (payload.name or vendor.get("name") or "Dealer").strip(),
        "phone": vendor.get("phone") or "-", "password_hash": hash_password(payload.password),
        "is_admin": False, "is_dealer": True, "vendor_id": vendor_id,
        "suspended": False, "created_at": now_utc(),
    }
    await db.users.insert_one(dict(user))
    await db.vendors.update_one({"id": vendor_id}, {"$set": {"account_email": email, "has_login": True}})
    return to_user_out(user)


async def _dealer_stock(vendor_name: str) -> dict:
    async def _c(extra):
        q = {"sold_to_vendor": vendor_name}
        q.update(extra)
        return await db.qr_inventory.count_documents(q)
    return {
        "assigned_total": await _c({}),           # total QR handed to this dealer
        "available": await _c({"status": "sold"}),  # with dealer, not yet activated
        "activated": await _c({"status": "assigned"}),  # sold to a customer & activated
        "blocked": await _c({"status": "blocked"}),
    }


@router.get("/dealer/me")
async def dealer_me(user: dict = Depends(require_dealer)):
    vendor = await db.vendors.find_one({"id": user["vendor_id"]})
    if not vendor:
        raise HTTPException(status_code=404, detail="Dealer profile not found")
    stock = await _dealer_stock(vendor["name"])
    return {
        "vendor": {"id": vendor["id"], "name": vendor["name"], "city": vendor.get("city"), "phone": vendor.get("phone"),
                   "contact_name": vendor.get("contact_name"), "email": vendor.get("email"),
                   "state": vendor.get("state"), "address": vendor.get("address"), "active": vendor.get("active", True)},
        "stock": stock,
    }


@router.get("/dealer/inventory")
async def dealer_inventory(user: dict = Depends(require_dealer), status: Optional[str] = None, q: Optional[str] = None, limit: int = 200):
    vendor = await db.vendors.find_one({"id": user["vendor_id"]})
    if not vendor:
        raise HTTPException(status_code=404, detail="Dealer profile not found")
    filt: dict = {"sold_to_vendor": vendor["name"]}
    if status:
        filt["status"] = status
    if q:
        filt["serial_no"] = {"$regex": q, "$options": "i"}
    items = []
    async for d in db.qr_inventory.find(filt).sort("serial_no", 1).limit(limit):
        items.append({"id": d["id"], "serial_no": d["serial_no"], "status": d["status"], "sold_at": d.get("sold_at")})
    return {"count": len(items), "items": items}
