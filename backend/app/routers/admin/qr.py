from __future__ import annotations

import base64
import io
import os
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from PIL import Image
from app.services.sticker_html import build_sticker_html, build_sticker_sheet_images
from app.services.sticker_html import VARIANTS as STICKER_VARIANTS
from app.services.sticker import render_sticker, new_sticker_code
from app.db import db
from app.schemas import BulkGenerateIn, MarkSoldIn, AssignDealerIn
from app.security import require_admin
from app.utils import new_id, now_utc

router = APIRouter()


def _next_serial(seq: int) -> str:
    """Serial format: NS-YYMM-NNNNNN (e.g. NS-2608-000042)."""
    now = now_utc()
    return f"NS-{now.strftime('%y%m')}-{seq:06d}"


@router.post("/admin/qr/generate-bulk")
async def admin_qr_bulk_generate(body: BulkGenerateIn, admin: dict = Depends(require_admin)):
    batch_id = new_id()
    batch_label = body.batch_label or f"Batch-{now_utc().strftime('%y%m%d-%H%M')}"
    org_id, org_name = body.org_id, body.org_name
    if org_id:
        org = await db.organizations.find_one({"id": org_id})
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        org_name = org["name"]
    last = await db.qr_inventory.find_one(sort=[("seq", -1)])
    start_seq = (last["seq"] + 1) if last else 1
    docs = []
    for i in range(body.count):
        seq = start_seq + i
        docs.append({
            "id": new_id(), "seq": seq, "serial_no": _next_serial(seq),
            "qr_id": new_id(), "status": "unclaimed",
            "batch_id": batch_id, "batch_label": batch_label, "notes": body.notes,
            "intended_type": body.product_type, "intended_subtype": body.product_subtype,
            "org_name": (org_name or None), "org_id": org_id,
            "assigned_to_user_id": None, "product_type": None, "assigned_at": None,
            "sold_to_vendor": None, "sold_at": None,
            "created_at": now_utc(), "created_by": admin["id"],
        })
    if docs:
        await db.qr_inventory.insert_many(docs)
    return {
        "batch_id": batch_id, "batch_label": batch_label, "count": len(docs),
        "first_serial": docs[0]["serial_no"] if docs else None,
        "last_serial": docs[-1]["serial_no"] if docs else None,
    }


@router.get("/admin/qr/inventory")
async def admin_qr_inventory(
    _: dict = Depends(require_admin),
    status: Optional[str] = None, batch_id: Optional[str] = None,  # noqa: F811
    q: Optional[str] = None, skip: int = 0, limit: int = 50,
):
    filt: dict = {}
    if status: filt["status"] = status
    if batch_id: filt["batch_id"] = batch_id
    if q: filt["serial_no"] = {"$regex": q, "$options": "i"}
    skip = max(0, skip)
    limit = max(1, min(200, limit))
    total = await db.qr_inventory.count_documents(filt)
    items = []
    async for d in db.qr_inventory.find(filt).sort("seq", -1).skip(skip).limit(limit):
        items.append({
            "id": d["id"], "serial_no": d["serial_no"], "qr_id": d["qr_id"],
            "status": d["status"], "batch_label": d.get("batch_label"),
            "batch_id": d.get("batch_id"), "product_type": d.get("product_type"),
            "sold_to_vendor": d.get("sold_to_vendor"),
            "assigned_to_user_id": d.get("assigned_to_user_id"),
            "created_at": d["created_at"], "assigned_at": d.get("assigned_at"),
        })
    return {"total": total, "count": len(items), "items": items}


@router.get("/admin/qr/batches")
async def admin_qr_batches(_: dict = Depends(require_admin)):
    pipeline = [
        {"$group": {
            "_id": {"batch_id": "$batch_id", "batch_label": "$batch_label"},
            "total": {"$sum": 1},
            "unclaimed": {"$sum": {"$cond": [{"$eq": ["$status", "unclaimed"]}, 1, 0]}},
            "sold": {"$sum": {"$cond": [{"$eq": ["$status", "sold"]}, 1, 0]}},
            "assigned": {"$sum": {"$cond": [{"$eq": ["$status", "assigned"]}, 1, 0]}},
            "first_created": {"$min": "$created_at"},
        }},
        {"$sort": {"first_created": -1}},
    ]
    out = []
    async for g in db.qr_inventory.aggregate(pipeline):
        out.append({
            "batch_id": g["_id"]["batch_id"], "batch_label": g["_id"]["batch_label"],
            "total": g["total"], "unclaimed": g["unclaimed"],
            "sold": g["sold"], "assigned": g["assigned"],
            "created_at": g["first_created"],
        })
    return {"batches": out}


@router.get("/admin/qr/batch/{batch_id}/export.csv")
async def admin_qr_batch_csv(batch_id: str, _: dict = Depends(require_admin)):
    base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") or ""
    rows = ["serial_no,qr_id,scan_url,status"]
    async for d in db.qr_inventory.find({"batch_id": batch_id}).sort("seq", 1):
        url = f"{base}/claim/{d['serial_no']}"
        rows.append(f"{d['serial_no']},{d['qr_id']},{url},{d['status']}")
    csv_body = "\n".join(rows) + "\n"
    return Response(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="qr-batch-{batch_id[:8]}.csv"'},
    )


@router.get("/admin/qr/batch/{batch_id}/stickers.html")
async def admin_qr_batch_stickers(
    batch_id: str,
    variant: str = "neon",
    per_row: int = 3,
    limit: int = 200,
):
    """Printable sticker sheet for a whole batch (dealer/vendor stock).

    Each sticker is the SAME red/black "IN CASE OF EMERGENCY" design as a single
    order sticker — its own QR (claim URL) + a unique 6-digit code — so a bulk
    batch looks identical to an individual one. Open in browser then Print /
    Save PDF. Public by design (the random batch_id guards it); limited per page.
    """
    per_row = max(1, min(5, per_row))
    limit = max(1, min(200, limit))
    base = (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_WEB_URL")
            or os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    items: list[tuple[str, str]] = []
    async for d in db.qr_inventory.find({"batch_id": batch_id}).sort("seq", 1).limit(limit):
        # a stable unique code per inventory item (generated + stored once)
        code = d.get("code")
        if not code:
            code = new_sticker_code()
            await db.qr_inventory.update_one({"id": d["id"]}, {"$set": {"code": code}})
        png = render_sticker(f"{base}/claim/{d['serial_no']}", code)
        img = Image.open(io.BytesIO(png)).convert("RGB")
        img.thumbnail((460, 690))   # shrink for a light-weight print sheet
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=85)  # JPEG keeps the sheet small; QR scans fine (ERROR_CORRECT_H)
        du = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        items.append((d["serial_no"], du))
    if not items:
        raise HTTPException(status_code=404, detail="Batch not found or empty")
    html = build_sticker_sheet_images(items, per_row=per_row)
    return Response(content=html, media_type="text/html; charset=utf-8")


@router.post("/admin/qr/mark-sold")
async def admin_qr_mark_sold(body: MarkSoldIn, _: dict = Depends(require_admin)):
    now = now_utc()
    r = await db.qr_inventory.update_many(
        {"serial_no": {"$gte": body.serial_from, "$lte": body.serial_to}, "status": "unclaimed"},
        {"$set": {"status": "sold", "sold_to_vendor": body.vendor_name, "sold_at": now}},
    )
    return {"updated": r.modified_count}


@router.post("/admin/qr/assign-dealer")
async def admin_qr_assign_dealer(body: AssignDealerIn, _: dict = Depends(require_admin)):
    """Assign a whole batch (or a serial range) of still-available QR codes to a
    dealer. Unlike mark-sold, this sets sold_vendor_id (by id), so the dealer's
    own portal and the dealer-assign flow correctly recognise this stock."""
    vendor = await db.vendors.find_one({"id": body.vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Dealer not found")
    filt: dict = {"status": "unclaimed"}
    if body.batch_id:
        filt["batch_id"] = body.batch_id
    elif body.serial_from and body.serial_to:
        filt["serial_no"] = {"$gte": body.serial_from, "$lte": body.serial_to}
    else:
        raise HTTPException(status_code=400, detail="Provide a batch or a serial range")
    now = now_utc()
    r = await db.qr_inventory.update_many(filt, {"$set": {
        "status": "sold", "sold_to_vendor": vendor["name"],
        "sold_vendor_id": vendor["id"], "sold_at": now,
    }})
    return {"assigned": r.modified_count, "vendor_name": vendor["name"], "vendor_id": vendor["id"]}


@router.post("/admin/qr/{serial_no}/block")
async def admin_qr_block(serial_no: str, payload: dict, _: dict = Depends(require_admin)):
    d = await db.qr_inventory.find_one({"serial_no": serial_no})
    if not d:
        raise HTTPException(status_code=404, detail="Serial not found")
    blocked = bool(payload.get("blocked", True))
    if blocked:
        await db.qr_inventory.update_one({"serial_no": serial_no}, {"$set": {"prev_status": d["status"], "status": "blocked"}})
        return {"serial_no": serial_no, "status": "blocked"}
    restore = d.get("prev_status") or "unclaimed"
    await db.qr_inventory.update_one({"serial_no": serial_no}, {"$set": {"status": restore}})
    return {"serial_no": serial_no, "status": restore}
