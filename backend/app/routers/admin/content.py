from __future__ import annotations

from datetime import timedelta
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.schemas import ContactStatusIn, FAQIn, PlanIn, PlanOut, SupportReplyIn, VendorIn, VendorOrderIn, VendorPaymentIn
from app.security import require_admin
from app.utils import clean, new_id, now_utc, plan_out

router = APIRouter()


@router.get("/admin/intruder-events")
async def admin_intruder_events(_: dict = Depends(require_admin), limit: int = 100):
    items = []
    async for e in db.intruder_events.find({}).sort("created_at", -1).limit(min(limit, 300)):
        e = clean(e)
        owner = await db.users.find_one({"id": e.get("user_id")})
        e["owner_name"] = (owner or {}).get("name")
        e["owner_phone"] = (owner or {}).get("phone")
        e["has_photo"] = bool(e.get("photo_base64"))
        items.append(e)
    return {"count": len(items), "items": items}


def _vendor_out(v: dict) -> dict:
    return {
        "id": v["id"], "name": v["name"],
        "contact_name": v.get("contact_name"),
        "phone": v.get("phone"), "email": v.get("email"),
        "address": v.get("address"), "city": v.get("city"),
        "state": v.get("state"), "gstin": v.get("gstin"),
        "notes": v.get("notes"),
        "created_at": v["created_at"],
    }


async def _vendor_totals(vendor_id: str) -> dict:
    pipe_orders = [
        {"$match": {"vendor_id": vendor_id}},
        {"$group": {
            "_id": None,
            "orders_count": {"$sum": 1},
            "total_billed": {"$sum": "$total_paise"},
            "total_qty": {"$sum": "$qty"},
        }},
    ]
    pipe_pay = [
        {"$match": {"vendor_id": vendor_id}},
        {"$group": {"_id": None, "total_paid": {"$sum": "$amount_paise"}}},
    ]
    o = await db.vendor_orders.aggregate(pipe_orders).to_list(1)
    p = await db.vendor_payments.aggregate(pipe_pay).to_list(1)
    billed = int(o[0]["total_billed"]) if o else 0
    paid = int(p[0]["total_paid"]) if p else 0
    return {
        "orders_count": int(o[0]["orders_count"]) if o else 0,
        "total_qty": int(o[0]["total_qty"]) if o else 0,
        "total_billed_paise": billed,
        "total_paid_paise": paid,
        "outstanding_paise": max(0, billed - paid),
    }


@router.post("/admin/vendors")
async def admin_vendor_create(body: VendorIn, admin: dict = Depends(require_admin)):
    doc = {
        "id": new_id(), **body.model_dump(),
        "created_at": now_utc(), "created_by": admin["id"],
    }
    await db.vendors.insert_one(doc)
    return _vendor_out(doc)


@router.get("/admin/vendors")
async def admin_vendors_list(_: dict = Depends(require_admin), q: Optional[str] = None, limit: int = 200):
    filt: dict = {}
    if q:
        filt = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
        ]}
    items = []
    async for v in db.vendors.find(filt).sort("created_at", -1).limit(limit):
        t = await _vendor_totals(v["id"])
        # Actual QR this dealer holds (from inventory) — the assign-to-dealer
        # flow hands QRs over without creating a billing order, so this, not
        # the orders' total_qty, is the real "QR given" number.
        qr_assigned = await db.qr_inventory.count_documents({"sold_to_vendor": v["name"]})
        items.append({**_vendor_out(v), **t, "qr_assigned": qr_assigned})
    return {"count": len(items), "items": items}


@router.get("/admin/vendors/summary")
async def admin_vendors_summary(_: dict = Depends(require_admin)):
    """Global tally across every vendor — used on admin dashboard cards."""
    pipe_orders = [{"$group": {
        "_id": None,
        "billed": {"$sum": "$total_paise"},
        "qty": {"$sum": "$qty"},
        "orders": {"$sum": 1},
    }}]
    pipe_pay = [{"$group": {"_id": None, "paid": {"$sum": "$amount_paise"}}}]
    o = await db.vendor_orders.aggregate(pipe_orders).to_list(1)
    p = await db.vendor_payments.aggregate(pipe_pay).to_list(1)
    v_count = await db.vendors.count_documents({})
    billed = int(o[0]["billed"]) if o else 0
    paid = int(p[0]["paid"]) if p else 0
    qr_assigned_total = await db.qr_inventory.count_documents({"sold_to_vendor": {"$ne": None}})
    return {
        "vendors": v_count,
        "orders": int(o[0]["orders"]) if o else 0,
        "total_qty": int(o[0]["qty"]) if o else 0,
        "qr_assigned_total": qr_assigned_total,
        "total_billed_paise": billed,
        "total_paid_paise": paid,
        "outstanding_paise": max(0, billed - paid),
    }


@router.get("/admin/vendors/{vendor_id}")
async def admin_vendor_detail(vendor_id: str, _: dict = Depends(require_admin)):
    v = await db.vendors.find_one({"id": vendor_id})
    if not v:
        raise HTTPException(404, "Vendor not found")
    totals = await _vendor_totals(vendor_id)
    orders = []
    async for o in db.vendor_orders.find({"vendor_id": vendor_id}).sort("created_at", -1):
        paid = 0
        async for p in db.vendor_payments.find({"order_id": o["id"]}):
            paid += p["amount_paise"]
        orders.append({
            "id": o["id"], "batch_id": o.get("batch_id"),
            "serial_from": o.get("serial_from"), "serial_to": o.get("serial_to"),
            "qty": o["qty"], "unit_price_paise": o["unit_price_paise"],
            "total_paise": o["total_paise"], "notes": o.get("notes"),
            "paid_paise": paid,
            "outstanding_paise": max(0, o["total_paise"] - paid),
            "payment_status": "paid" if paid >= o["total_paise"] else ("partial" if paid > 0 else "unpaid"),
            "created_at": o["created_at"],
        })
    payments = []
    async for p in db.vendor_payments.find({"vendor_id": vendor_id}).sort("paid_at", -1):
        payments.append({
            "id": p["id"], "order_id": p.get("order_id"),
            "amount_paise": p["amount_paise"], "method": p["method"],
            "reference": p.get("reference"), "notes": p.get("notes"),
            "paid_at": p["paid_at"],
        })
    return {"vendor": _vendor_out(v), "totals": totals, "orders": orders, "payments": payments}


@router.patch("/admin/vendors/{vendor_id}")
async def admin_vendor_update(vendor_id: str, body: VendorIn, _: dict = Depends(require_admin)):
    r = await db.vendors.update_one({"id": vendor_id}, {"$set": body.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    v = await db.vendors.find_one({"id": vendor_id})
    return _vendor_out(v)


@router.delete("/admin/vendors/{vendor_id}")
async def admin_vendor_delete(vendor_id: str, _: dict = Depends(require_admin)):
    n = await db.vendor_orders.count_documents({"vendor_id": vendor_id})
    if n:
        raise HTTPException(400, f"Cannot delete: vendor has {n} orders. Archive instead.")
    r = await db.vendors.delete_one({"id": vendor_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Vendor not found")
    return {"ok": True}


@router.post("/admin/vendors/{vendor_id}/orders")
async def admin_vendor_order_create(vendor_id: str, body: VendorOrderIn, admin: dict = Depends(require_admin)):
    v = await db.vendors.find_one({"id": vendor_id})
    if not v:
        raise HTTPException(404, "Vendor not found")
    total = body.qty * body.unit_price_paise
    order = {
        "id": new_id(), "vendor_id": vendor_id,
        "batch_id": body.batch_id,
        "serial_from": body.serial_from, "serial_to": body.serial_to,
        "qty": body.qty, "unit_price_paise": body.unit_price_paise,
        "total_paise": total, "notes": body.notes,
        "created_at": now_utc(), "created_by": admin["id"],
    }
    await db.vendor_orders.insert_one(order)
    order.pop("_id", None)

    # Optionally mark the serial range in qr_inventory as sold to this vendor.
    marked = 0
    if body.mark_batch_sold and body.serial_from and body.serial_to:
        r = await db.qr_inventory.update_many(
            {
                "serial_no": {"$gte": body.serial_from, "$lte": body.serial_to},
                "status": "unclaimed",
            },
            {"$set": {
                "status": "sold",
                "sold_to_vendor": v["name"],
                "sold_vendor_id": vendor_id,
                "sold_at": now_utc(),
            }},
        )
        marked = r.modified_count
    return {"order": {**order, "paid_paise": 0, "outstanding_paise": total,
                       "payment_status": "unpaid"},
            "serials_marked_sold": marked}


@router.get("/admin/vendors/{vendor_id}/orders")
async def admin_vendor_orders_list(vendor_id: str, _: dict = Depends(require_admin)):
    items = []
    async for o in db.vendor_orders.find({"vendor_id": vendor_id}).sort("created_at", -1):
        paid = 0
        async for p in db.vendor_payments.find({"order_id": o["id"]}):
            paid += p["amount_paise"]
        items.append({
            "id": o["id"], "batch_id": o.get("batch_id"),
            "serial_from": o.get("serial_from"), "serial_to": o.get("serial_to"),
            "qty": o["qty"], "unit_price_paise": o["unit_price_paise"],
            "total_paise": o["total_paise"],
            "paid_paise": paid,
            "outstanding_paise": max(0, o["total_paise"] - paid),
            "payment_status": "paid" if paid >= o["total_paise"] else ("partial" if paid > 0 else "unpaid"),
            "notes": o.get("notes"), "created_at": o["created_at"],
        })
    return {"count": len(items), "items": items}


@router.post("/admin/vendors/{vendor_id}/orders/{order_id}/payments")
async def admin_vendor_payment_record(
    vendor_id: str, order_id: str, body: VendorPaymentIn,
    admin: dict = Depends(require_admin),
):
    o = await db.vendor_orders.find_one({"id": order_id, "vendor_id": vendor_id})
    if not o:
        raise HTTPException(404, "Order not found")
    doc = {
        "id": new_id(), "vendor_id": vendor_id, "order_id": order_id,
        "amount_paise": body.amount_paise, "method": body.method,
        "reference": body.reference, "notes": body.notes,
        "paid_at": now_utc(), "recorded_by": admin["id"],
    }
    await db.vendor_payments.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "payment": doc}


@router.get("/admin/vehicles")
async def admin_vehicles(_: dict = Depends(require_admin), q: Optional[str] = None, limit: int = 200):
    filt: dict = {}
    if q:
        filt = {"number_plate": {"$regex": q, "$options": "i"}}
    items = []
    async for v in db.vehicles.find(filt).sort("created_at", -1).limit(limit):
        owner = await db.users.find_one({"id": v["owner_id"]}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
        contacts = await db.contacts.count_documents({"vehicle_id": v["id"]})
        items.append({
            "id": v["id"],
            "number_plate": v["number_plate"],
            "vehicle_type": v["vehicle_type"],
            "make_model": v.get("make_model"),
            "qr_id": v["qr_id"],
            "speed_limit_kmh": v.get("speed_limit_kmh", 80),
            "lost_mode": bool(v.get("lost_mode", False)),
            "owner": owner or {"name": "?", "email": "?", "phone": "?"},
            "contacts": contacts,
            "created_at": v["created_at"],
        })
    return {"count": len(items), "results": items}


@router.get("/admin/alerts")
async def admin_alerts(
    _: dict = Depends(require_admin),
    type: Optional[str] = None,
    q: Optional[str] = None,
    days: int = 30,
    limit: int = 500,
):
    filt: dict = {}
    if type:
        if type == "accident":
            filt["type"] = {"$regex": "^accident"}
        else:
            filt["type"] = type
    if q:
        filt["number_plate"] = {"$regex": q, "$options": "i"}
    if days > 0:
        filt["created_at"] = {"$gte": now_utc() - timedelta(days=days)}
    items = []
    async for a in db.alerts.find(filt).sort("created_at", -1).limit(limit):
        items.append({
            "id": a["id"],
            "vehicle_id": a["vehicle_id"],
            "number_plate": a["number_plate"],
            "type": a["type"],
            "scanner_note": a.get("scanner_note"),
            "scanner_lat": a.get("scanner_lat"),
            "scanner_lng": a.get("scanner_lng"),
            "created_at": a["created_at"],
            "contact_channels_count": len(a.get("contact_channels", [])),
        })
    return {"count": len(items), "results": items}


@router.get("/admin/alerts/export")
async def admin_alerts_export(
    _: dict = Depends(require_admin),
    type: Optional[str] = None,
    days: int = 30,
):
    from fastapi.responses import Response
    filt: dict = {}
    if type:
        if type == "accident":
            filt["type"] = {"$regex": "^accident"}
        else:
            filt["type"] = type
    if days > 0:
        filt["created_at"] = {"$gte": now_utc() - timedelta(days=days)}
    lines = ["id,number_plate,type,note,latitude,longitude,notified_count,created_at"]
    async for a in db.alerts.find(filt).sort("created_at", -1):
        note = (a.get("scanner_note") or "").replace('"', "'").replace(",", ";")
        lines.append(
            ",".join([
                a["id"],
                a["number_plate"],
                a["type"],
                f'"{note}"',
                str(a.get("scanner_lat", "")),
                str(a.get("scanner_lng", "")),
                str(len(a.get("contact_channels", []))),
                a["created_at"].isoformat() if hasattr(a["created_at"], "isoformat") else str(a["created_at"]),
            ])
        )
    csv = "\n".join(lines)
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=neksaathi_alerts.csv"},
    )


@router.get("/admin/plans", response_model=List[PlanOut])
async def admin_list_plans(_: dict = Depends(require_admin)):
    items = []
    async for p in db.plans.find({}).sort("price_cents", 1):
        items.append(plan_out(clean(p)))
    return items


@router.post("/admin/plans", response_model=PlanOut)
async def admin_create_plan(payload: PlanIn, _: dict = Depends(require_admin)):
    existing = await db.plans.find_one({"code": payload.code})
    if existing:
        raise HTTPException(status_code=409, detail="Plan code already exists")
    data = payload.model_dump(); data["interval"] = "year"   # yearly only
    doc = {"id": new_id(), "created_at": now_utc(), **data}
    if payload.popular:
        await db.plans.update_many({}, {"$set": {"popular": False}})
    await db.plans.insert_one(dict(doc))
    return plan_out(doc)


@router.put("/admin/plans/{plan_id}", response_model=PlanOut)
async def admin_update_plan(plan_id: str, payload: PlanIn, _: dict = Depends(require_admin)):
    row = await db.plans.find_one({"id": plan_id})
    if not row:
        raise HTTPException(status_code=404, detail="Plan not found")
    update = payload.model_dump(); update["interval"] = "year"   # yearly only
    if payload.popular:
        await db.plans.update_many({"id": {"$ne": plan_id}}, {"$set": {"popular": False}})
    await db.plans.update_one({"id": plan_id}, {"$set": update})
    row.update(update)
    return plan_out(clean(row))


@router.delete("/admin/plans/{plan_id}")
async def admin_delete_plan(plan_id: str, _: dict = Depends(require_admin)):
    # Soft-delete by marking inactive so historical subscriptions stay valid.
    row = await db.plans.find_one({"id": plan_id})
    if not row:
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.plans.update_one({"id": plan_id}, {"$set": {"active": False}})
    return {"deleted": True}


@router.get("/admin/subscriptions")
async def admin_list_subscriptions(_: dict = Depends(require_admin), limit: int = 200):
    items = []
    async for s in db.subscriptions.find({}).sort("created_at", -1).limit(limit):
        u = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "email": 1, "name": 1})
        items.append({
            "id": s["id"],
            "user": u or {"email": "?", "name": "?"},
            "plan_code": s["plan_code"],
            "status": s["status"],
            "current_period_end": s.get("current_period_end"),
            "created_at": s["created_at"],
            "dry_run": bool(s.get("dry_run", False)),
        })
    return {"count": len(items), "results": items}


@router.get("/admin/support/tickets")
async def admin_list_tickets(
    _: dict = Depends(require_admin),
    status_filter: Optional[str] = None,
    limit: int = 200,
):
    filt: dict = {}
    if status_filter:
        filt["status"] = status_filter
    items = []
    async for t in db.support_tickets.find(filt).sort("created_at", -1).limit(limit):
        items.append(clean(t))
    return {"count": len(items), "results": items}


@router.patch("/admin/support/tickets/{ticket_id}")
async def admin_reply_ticket(ticket_id: str, payload: SupportReplyIn, admin: dict = Depends(require_admin)):
    t = await db.support_tickets.find_one({"id": ticket_id})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    reply = {
        "id": new_id(),
        "by": "admin",
        "by_name": admin["name"],
        "body": payload.reply.strip(),
        "created_at": now_utc(),
    }
    update: dict = {"$push": {"replies": reply}, "$set": {"updated_at": now_utc()}}
    if payload.status:
        update["$set"]["status"] = payload.status
    await db.support_tickets.update_one({"id": ticket_id}, update)
    t = await db.support_tickets.find_one({"id": ticket_id})
    return clean(t)


@router.get("/admin/contacts")
async def admin_list_contacts(_: dict = Depends(require_admin), limit: int = 200):
    items = []
    async for c in db.contact_enquiries.find({}).sort("created_at", -1).limit(limit):
        items.append(clean(c))
    return {"count": len(items), "results": items}


@router.patch("/admin/contacts/{enquiry_id}")
async def admin_update_contact(enquiry_id: str, payload: ContactStatusIn, _: dict = Depends(require_admin)):
    r = await db.contact_enquiries.update_one({"id": enquiry_id}, {"$set": {"status": payload.status, "updated_at": now_utc()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return {"ok": True, "status": payload.status}


@router.get("/admin/inbox/summary")
async def admin_inbox_summary(_: dict = Depends(require_admin)):
    """Lightweight counts for the admin nav badge: open tickets + new enquiries."""
    open_tickets = await db.support_tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    new_enquiries = await db.contact_enquiries.count_documents({"status": {"$in": ["new", "in_progress"]}})
    return {"open_tickets": open_tickets, "new_enquiries": new_enquiries, "total": open_tickets + new_enquiries}


@router.get("/admin/notifications")
async def admin_notifications(_: dict = Depends(require_admin), channel: Optional[str] = None,
                              status_filter: Optional[str] = None, limit: int = 100):
    query: dict = {}
    if channel and channel != "all":
        query["channel"] = channel
    if status_filter and status_filter != "all":
        query["status"] = status_filter
    items = []
    async for n in db.notifications.find(query).sort("created_at", -1).limit(min(limit, 300)):
        items.append(clean(n))
    # Aggregate counts for the dashboard cards.
    stats = {"total": 0, "sent": 0, "mock": 0, "failed": 0, "skipped": 0, "whatsapp": 0, "sms": 0}
    async for n in db.notifications.find({}):
        stats["total"] += 1
        st = n.get("status", "")
        if st in stats:
            stats[st] += 1
        ch = n.get("channel", "")
        if ch in stats:
            stats[ch] += 1
    return {"stats": stats, "items": items}


@router.get("/admin/faqs")
async def admin_list_faqs(_: dict = Depends(require_admin)):
    items = []
    async for f in db.faqs.find({}).sort([("order", 1)]):
        items.append(clean(f))
    return items


@router.post("/admin/faqs")
async def admin_create_faq(payload: FAQIn, _: dict = Depends(require_admin)):
    doc = {"id": new_id(), "created_at": now_utc(), **payload.model_dump()}
    await db.faqs.insert_one(dict(doc))
    return clean(doc)


@router.put("/admin/faqs/{faq_id}")
async def admin_update_faq(faq_id: str, payload: FAQIn, _: dict = Depends(require_admin)):
    row = await db.faqs.find_one({"id": faq_id})
    if not row:
        raise HTTPException(status_code=404, detail="FAQ not found")
    update = payload.model_dump()
    await db.faqs.update_one({"id": faq_id}, {"$set": update})
    row.update(update)
    return clean(row)


@router.delete("/admin/faqs/{faq_id}")
async def admin_delete_faq(faq_id: str, _: dict = Depends(require_admin)):
    r = await db.faqs.delete_one({"id": faq_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return {"deleted": True}


@router.get("/admin/incidents")
async def admin_incidents(_: dict = Depends(require_admin), type: Optional[str] = None, status: Optional[str] = None, days: int = 30, limit: int = 500):
    filt: dict = {}
    if type:
        filt["type"] = type
    if status:
        filt["status"] = status
    if days > 0:
        filt["created_at"] = {"$gte": now_utc() - timedelta(days=days)}
    results = []
    async for inc in db.incidents.find(filt).sort("created_at", -1).limit(limit):
        results.append({
            "id": inc["id"], "type": inc["type"], "number_plate": inc["number_plate"],
            "status": inc["status"], "owner_response": inc.get("owner_response"),
            "call_attempted": inc.get("call_attempted", False), "resolved": inc.get("resolved", False),
            "scanner_phone": inc.get("scanner_phone"), "created_at": inc["created_at"],
            "evidence_photo_base64": inc.get("evidence_photo_base64"),
            "reporter_photo_base64": inc.get("reporter_photo_base64"),
        })
    async def _c(f):
        return await db.incidents.count_documents(f)
    stats = {
        "total": await _c({}),
        "wrong_parking": await _c({"type": "wrong_parking"}),
        "accident": await _c({"type": "accident"}),
        "theft": await _c({"type": "theft"}),
        "active": await _c({"resolved": False}),
        "resolved": await _c({"resolved": True}),
    }
    return {"count": len(results), "results": results, "stats": stats}
