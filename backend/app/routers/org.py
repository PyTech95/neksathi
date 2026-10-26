from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import OrgAccountIn, OrgActiveIn, OrgIn, OrgTagRegisterIn, UserOut
from app.security import current_user, hash_password, require_admin, to_user_out
from app.utils import clean, new_id, now_utc

router = APIRouter()


async def require_org(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_org") or not user.get("org_id"):
        raise HTTPException(status_code=403, detail="Organization access only")
    org = await db.organizations.find_one({"id": user["org_id"]})
    if org is not None and org.get("active") is False:
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Please contact the admin.")
    return user


async def _org_counts(org_id: str) -> dict:
    inv = db.qr_inventory
    issued = await inv.count_documents({"org_id": org_id})
    activated = await inv.count_documents({"org_id": org_id, "status": "assigned"})
    unclaimed = await inv.count_documents({"org_id": org_id, "status": {"$in": ["unclaimed", "sold"]}})
    return {"issued": issued, "activated": activated, "unclaimed": unclaimed}


@router.post("/admin/orgs")
async def admin_create_org(body: OrgIn, _: dict = Depends(require_admin)):
    doc = {"id": new_id(), **body.model_dump(), "account_email": None, "has_login": False, "active": True, "created_at": now_utc()}
    await db.organizations.insert_one(dict(doc))
    return clean(doc)


@router.patch("/admin/orgs/{org_id}/active")
async def admin_org_set_active(org_id: str, body: OrgActiveIn, _: dict = Depends(require_admin)):
    """Activate / deactivate an organization. A deactivated org can log in but
    can't register new tags, and scanning/claiming its tags is blocked too."""
    r = await db.organizations.update_one({"id": org_id}, {"$set": {"active": bool(body.active)}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"id": org_id, "active": bool(body.active)}


@router.get("/admin/orgs/{org_id}/batches")
async def admin_org_batches(org_id: str, _: dict = Depends(require_admin)):
    """This org's QR batches, each with used / remaining — so the admin can print
    (PDF) or export just the batch they want (e.g. only the newly generated one)."""
    org = await db.organizations.find_one({"id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    pipeline = [
        {"$match": {"org_id": org_id}},
        {"$group": {
            "_id": {"batch_id": "$batch_id", "batch_label": "$batch_label"},
            "total": {"$sum": 1},
            "used": {"$sum": {"$cond": [{"$eq": ["$status", "assigned"]}, 1, 0]}},
            "remaining": {"$sum": {"$cond": [{"$in": ["$status", ["unclaimed", "sold"]]}, 1, 0]}},
            "first": {"$min": "$created_at"},
        }},
        {"$sort": {"first": -1}},
    ]
    out = []
    async for g in db.qr_inventory.aggregate(pipeline):
        out.append({
            "batch_id": g["_id"]["batch_id"], "batch_label": g["_id"]["batch_label"],
            "total": g["total"], "used": g["used"], "remaining": g["remaining"],
            "created_at": g["first"],
        })
    return {"batches": out}


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


@router.post("/org/tags/register")
async def org_register_tag(body: OrgTagRegisterIn, user: dict = Depends(require_org)):
    """The org registers one of its own tags to a person/thing (student, pet,
    gadget…). The serial must belong to this org and still be un-handed-out.
    Type-specific extras (roll no, class, breed, IMEI…) go in `metadata`."""
    inv = await db.qr_inventory.find_one({"serial_no": body.serial_no, "org_id": user["org_id"]})
    if not inv:
        raise HTTPException(status_code=404, detail="This serial isn't one of your tags.")
    if inv.get("status") == "assigned":
        raise HTTPException(status_code=409, detail="This tag is already registered.")
    now = now_utc()
    tag_id = new_id()
    await db.tags.insert_one({
        "id": tag_id, "owner_id": user["id"], "qr_id": inv["qr_id"],
        "name": body.name.strip(), "tag_type": body.tag_type or "other",
        "description": (body.description or "").strip() or None,
        "blood_group": (body.blood_group or "").strip() or None,
        "medical_notes": (body.medical_notes or "").strip() or None,
        "guardian_name": (body.guardian_name or "").strip() or None,
        "guardian_phone": (body.guardian_phone or "").strip() or None,
        "org_id": user["org_id"],
        "lost_mode": False, "metadata": body.metadata or {}, "created_at": now,
    })
    await db.qr_inventory.update_one({"id": inv["id"]}, {"$set": {
        "status": "assigned", "assigned_to_user_id": user["id"],
        "assigned_at": now, "product_type": "tag",
    }})
    return {"ok": True, "serial_no": body.serial_no, "tag_id": tag_id}


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
