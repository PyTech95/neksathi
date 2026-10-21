from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import OrgAccountIn, OrgIn, UserOut
from app.security import current_user, hash_password, require_admin, to_user_out
from app.utils import clean, new_id, now_utc

router = APIRouter()


async def require_org(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_org") or not user.get("org_id"):
        raise HTTPException(status_code=403, detail="Organization access only")
    return user


async def _org_counts(org_id: str) -> dict:
    inv = db.qr_inventory
    issued = await inv.count_documents({"org_id": org_id})
    activated = await inv.count_documents({"org_id": org_id, "status": "assigned"})
    unclaimed = await inv.count_documents({"org_id": org_id, "status": {"$in": ["unclaimed", "sold"]}})
    return {"issued": issued, "activated": activated, "unclaimed": unclaimed}


@router.post("/admin/orgs")
async def admin_create_org(body: OrgIn, _: dict = Depends(require_admin)):
    doc = {"id": new_id(), **body.model_dump(), "account_email": None, "has_login": False, "created_at": now_utc()}
    await db.organizations.insert_one(dict(doc))
    return clean(doc)


@router.get("/admin/orgs")
async def admin_list_orgs(_: dict = Depends(require_admin)):
    out = []
    async for o in db.organizations.find({}).sort("created_at", -1):
        c = await _org_counts(o["id"])
        out.append({**clean(o), "counts": c})
    return {"count": len(out), "results": out}


@router.post("/admin/orgs/{org_id}/account", response_model=UserOut)
async def admin_create_org_account(org_id: str, payload: OrgAccountIn, _: dict = Depends(require_admin)):
    org = await db.organizations.find_one({"id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")
    user = {
        "id": new_id(), "email": email,
        "name": (payload.name or org.get("name") or "Organization").strip(),
        "phone": org.get("phone") or "-", "password_hash": hash_password(payload.password),
        "is_admin": False, "is_dealer": False, "is_org": True, "org_id": org_id,
        "suspended": False, "created_at": now_utc(),
    }
    await db.users.insert_one(dict(user))
    await db.organizations.update_one({"id": org_id}, {"$set": {"account_email": email, "has_login": True}})
    return to_user_out(user)


@router.get("/org/me")
async def org_me(user: dict = Depends(require_org)):
    org = await db.organizations.find_one({"id": user["org_id"]})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"org": clean(org), "counts": await _org_counts(org["id"])}


@router.get("/org/tags")
async def org_tags(user: dict = Depends(require_org), limit: int = 500):
    """Activated tags issued from this org's batches (owner PII masked)."""
    out = []
    async for t in db.tags.find({"org_id": user["org_id"]}).sort("created_at", -1).limit(limit):
        out.append({
            "id": t["id"], "name": t.get("name"), "tag_type": t.get("tag_type"),
            "guardian_name": t.get("guardian_name"), "blood_group": t.get("blood_group"),
            "lost_mode": bool(t.get("lost_mode")), "qr_id": t.get("qr_id"),
            "created_at": t.get("created_at"),
        })
    return {"count": len(out), "results": out}


@router.get("/org/inventory")
async def org_inventory(user: dict = Depends(require_org), limit: int = 500):
    """Unclaimed serials still to be handed out for this org."""
    out = []
    async for d in db.qr_inventory.find({"org_id": user["org_id"], "status": {"$in": ["unclaimed", "sold"]}}).sort("serial_no", 1).limit(limit):
        out.append({"serial_no": d["serial_no"], "status": d["status"]})
    return {"count": len(out), "results": out}


@router.get("/org/alerts")
async def org_alerts(user: dict = Depends(require_org), limit: int = 100):
    """Recent scan alerts across this org's tags."""
    tag_ids = [t["id"] async for t in db.tags.find({"org_id": user["org_id"]}, {"id": 1})]
    if not tag_ids:
        return {"count": 0, "results": []}
    out = []
    async for a in db.alerts.find({"tag_id": {"$in": tag_ids}}).sort("created_at", -1).limit(limit):
        out.append({
            "id": a["id"], "tag_id": a.get("tag_id"), "type": a.get("type"),
            "note": a.get("scanner_note"), "created_at": a.get("created_at"),
            "lat": a.get("scanner_lat"), "lng": a.get("scanner_lng"),
        })
    return {"count": len(out), "results": out}
