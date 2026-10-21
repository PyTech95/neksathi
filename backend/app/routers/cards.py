from __future__ import annotations

from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.services.vcard import build_vcard4
from app.services.vcard import vcard_filename
from app.config import log
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import CardIn, CardMessageIn, CardOut
from app.security import current_user
from app.services.fcm import send_push
from app.utils import clean, new_id, now_utc

router = APIRouter()


@router.get("/cards", response_model=List[CardOut])
async def list_cards(user: dict = Depends(current_user)):
    return [CardOut(**clean(c)) async for c in db.cards.find({"owner_id": user["id"]}).sort("created_at", -1).limit(100)]


@router.post("/cards", response_model=CardOut)
async def create_card(payload: CardIn, user: dict = Depends(current_user)):
    card = {
        "id": new_id(),
        "owner_id": user["id"],
        "qr_id": new_id(),
        "created_at": now_utc(),
        **payload.model_dump(),
    }
    await db.cards.insert_one(dict(card))
    return CardOut(**clean(card))


@router.get("/cards/{card_id}", response_model=CardOut)
async def get_card(card_id: str, user: dict = Depends(current_user)):
    c = await db.cards.find_one({"id": card_id, "owner_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    return CardOut(**clean(c))


@router.put("/cards/{card_id}", response_model=CardOut)
async def update_card(card_id: str, payload: CardIn, user: dict = Depends(current_user)):
    c = await db.cards.find_one({"id": card_id, "owner_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    updates = payload.model_dump()
    await db.cards.update_one({"id": card_id}, {"$set": updates})
    c.update(updates)
    return CardOut(**clean(c))


@router.delete("/cards/{card_id}")
async def delete_card(card_id: str, user: dict = Depends(current_user)):
    r = await db.cards.delete_one({"id": card_id, "owner_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"deleted": True}


@router.get("/public/card/{qr_id}", response_model=CardOut)
async def public_card_view(qr_id: str):
    c = await db.cards.find_one({"qr_id": qr_id})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    return CardOut(**clean(c))


@router.get("/public/card/{qr_id}/vcf")
async def public_card_vcf(qr_id: str, dl: bool = False):
    """RFC 6350 (vCard 4.0) download endpoint for Share Tap cards.

    Content-Type of ``text/vcard`` causes iOS/Android to automatically hand
    off to the Contacts app when opened from a browser — no Nek Sathi
    install required for the scanner.

    Query params:
      dl=1 → force ``Content-Disposition: attachment`` so browsers download
             the file rather than trying to render.
    """
    c = await db.cards.find_one({"qr_id": qr_id})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    body = build_vcard4(c)
    disposition = "attachment" if dl else "inline"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{vcard_filename(c)}"',
        "Cache-Control": "no-store",
    }
    return Response(
        content=body,
        media_type="text/vcard; charset=utf-8",
        headers=headers,
    )


@router.post("/public/card/{qr_id}/message")
@rate_limit("10/minute")
async def public_card_message(request: Request, qr_id: str, payload: CardMessageIn):
    c = await db.cards.find_one({"qr_id": qr_id})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    owner = await db.users.find_one({"id": c["owner_id"]})
    channels: List[str] = []
    if owner and owner.get("phone"):
        channels.append(owner["phone"])
    if c.get("phone"):
        channels.append(c["phone"])
    alert = {
        "id": new_id(),
        "card_id": c["id"],
        "vehicle_id": None,
        "user_id": c.get("owner_id"),
        "number_plate": c.get("display_name", "Card"),
        "type": "card_message",
        "scanner_note": f"From {payload.from_name}: {payload.body[:200]}"
        + (f" · reply: {payload.from_phone}" if payload.from_phone else "")
        + (f" · {payload.from_email}" if payload.from_email else ""),
        "scanner_lat": None,
        "scanner_lng": None,
        "created_at": now_utc(),
        "contact_channels": list(dict.fromkeys(channels)),
    }
    await db.alerts.insert_one(dict(alert))
    try:
        if c.get("owner_id"):
            await send_push(
                recipients=[c["owner_id"]],
                data={
                    "title": f"💬 New message from {payload.from_name}",
                    "message": payload.body[:150],
                    "action_url": "/alerts",
                },
                idempotency_key=alert["id"],
            )
    except Exception as _e:
        log.warning("push (card message) failed: %s", _e)
    return {"ok": True}
