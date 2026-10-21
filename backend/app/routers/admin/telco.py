from __future__ import annotations

import os
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.services import comms
from app.db import db
from app.schemas import TelcoConfigIn
from app.security import require_admin
from app.utils import now_utc

router = APIRouter()


def _mask_secret(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    return v[:4] + "•" * max(0, len(v) - 8) + v[-4:] if len(v) > 8 else "•" * len(v)


_MSG91_ENV = {
    "msg91_authkey": "MSG91_AUTHKEY",
    "msg91_otp_template_id": "MSG91_OTP_TEMPLATE_ID",
    "msg91_sms_flow_id": "MSG91_SMS_FLOW_ID",
    "msg91_sms_sender": "MSG91_SMS_SENDER",
    "msg91_whatsapp_number": "MSG91_WHATSAPP_NUMBER",
    "msg91_whatsapp_template": "MSG91_WHATSAPP_TEMPLATE",
    "msg91_whatsapp_namespace": "MSG91_WHATSAPP_NAMESPACE",
    "msg91_caller_id": "MSG91_CALLER_ID",
}


@router.get("/admin/telco-config")
async def get_telco_config(_: dict = Depends(require_admin)):
    doc = await db.system_config.find_one({"id": "telco"}) or {"id": "telco", "provider": "msg91", "sms_enabled": False}
    out = {"provider": doc.get("provider", "msg91"), "sms_enabled": bool(doc.get("sms_enabled", False)), "updated_at": doc.get("updated_at")}
    for k in _MSG91_ENV:
        val = doc.get(k)
        out[k] = _mask_secret(val) if k in ("msg91_authkey",) else val
    # Live-status snapshot so admins can see what's actually active.
    out["live"] = {"otp": comms.otp_live(), "sms": comms.sms_live(), "whatsapp": comms.whatsapp_live(), "whatsapp_otp": comms.whatsapp_otp_live(), "voice": comms.voice_live()}
    return out


@router.put("/admin/telco-config")
async def set_telco_config(payload: TelcoConfigIn, admin: dict = Depends(require_admin)):
    data = payload.model_dump()
    # provider + sms_enabled are explicit choices and always applied.
    doc = {"id": "telco", "provider": data["provider"], "sms_enabled": data["sms_enabled"],
           "updated_at": now_utc(), "updated_by": admin["id"]}
    # Secret / credential fields: only overwrite when a NEW value is supplied.
    # A blank field means "keep what's already saved" — so the admin never has
    # to re-type the masked auth key just to flip a toggle.
    for k in _MSG91_ENV:
        val = (data.get(k) or "").strip() if isinstance(data.get(k), str) else data.get(k)
        if val:
            doc[k] = val
    await db.system_config.update_one({"id": "telco"}, {"$set": doc}, upsert=True)
    # Sync into process env so comms.py picks it up immediately (no restart).
    for field, env_key in _MSG91_ENV.items():
        val = (data.get(field) or "").strip() if isinstance(data.get(field), str) else data.get(field)
        if val:
            os.environ[env_key] = val
    return {"ok": True, "provider": payload.provider}
