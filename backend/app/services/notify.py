from __future__ import annotations

from typing import Optional
from app.services import comms
from app.db import db
from app.utils import new_id, now_utc


def _whatsapp_live() -> bool:
    return comms.whatsapp_live()


async def notify_whatsapp(to: Optional[str], text: str, meta: Optional[dict] = None) -> dict:
    """Send a WhatsApp message via MSG91. MOCK unless MSG91 WhatsApp creds exist.
    Always audit-logs into db.notifications so the flow is testable end-to-end."""
    if not to:
        return {"status": "skipped"}
    res = await comms.send_whatsapp(to, text)
    doc = {
        "id": new_id(), "channel": "whatsapp", "to": to, "text": text,
        "status": res.get("status", "mock"), "provider": "msg91", "meta": meta or {}, "created_at": now_utc(),
    }
    if res.get("error"):
        doc["error"] = res["error"]
    await db.notifications.insert_one(dict(doc))
    return {"status": doc["status"], "id": doc["id"]}


async def send_sms(to: Optional[str], text: str, meta: Optional[dict] = None) -> dict:
    """Send an SMS via MSG91. MOCK unless MSG91 SMS flow creds exist.
    Used as a fallback channel so emergency alerts never get missed."""
    if not to:
        return {"status": "skipped"}
    res = await comms.send_sms(to, text)
    doc = {
        "id": new_id(), "channel": "sms", "to": to, "text": text,
        "status": res.get("status", "mock"), "provider": "msg91", "meta": meta or {}, "created_at": now_utc(),
    }
    if res.get("error"):
        doc["error"] = res["error"]
    await db.notifications.insert_one(dict(doc))
    return {"status": doc["status"], "id": doc["id"]}
