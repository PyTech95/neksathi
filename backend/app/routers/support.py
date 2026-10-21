from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import ContactFormIn, SupportTicketIn
from app.security import current_user
from app.utils import clean, new_id, now_utc

router = APIRouter()


@router.post("/contact")
@rate_limit("5/hour")
async def contact_submit(request: Request, payload: ContactFormIn):
    doc = {
        "id": new_id(),
        "created_at": now_utc(),
        "status": "new",
        **payload.model_dump(),
    }
    await db.contact_enquiries.insert_one(dict(doc))
    return {"ok": True, "id": doc["id"]}


@router.get("/faqs")
async def list_faqs(category: Optional[str] = None):
    filt: dict = {"active": True}
    if category:
        filt["category"] = category
    items = []
    async for f in db.faqs.find(filt).sort([("order", 1), ("question", 1)]):
        items.append(clean(f))
    return items


@router.post("/support/tickets")
async def create_ticket(payload: SupportTicketIn, user: dict = Depends(current_user)):
    ticket_id = new_id()
    doc = {
        "id": ticket_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "subject": payload.subject.strip(),
        "body": payload.body.strip(),
        "priority": payload.priority,
        "status": "open",
        "replies": [],
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.support_tickets.insert_one(dict(doc))
    return clean(doc)


@router.get("/support/tickets/me")
async def my_tickets(user: dict = Depends(current_user)):
    items = []
    async for t in db.support_tickets.find({"user_id": user["id"]}).sort("created_at", -1):
        items.append(clean(t))
    return items
