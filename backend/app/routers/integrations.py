from __future__ import annotations

from datetime import datetime, timedelta, timezone
import asyncio
import hashlib
import httpx
import jwt
import os
import secrets
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import RedirectResponse
from app.config import JWT_ALGORITHM, JWT_SECRET, log
from app.db import db
from app.schemas import DriveEvidenceIn, GDriveConfigIn
from app.security import current_user, require_admin
from app.services.gdrive import GDRIVE_SCOPES, _decode_data_url, _gdrive_cfg, _gdrive_client_config, _gdrive_upload
from app.utils import now_utc

router = APIRouter()


@router.get("/google-drive/status")
async def gdrive_status(user: dict = Depends(current_user)):
    cfg = await _gdrive_cfg()
    td = await db.google_drive_tokens.find_one({"user_id": user["id"]})
    connected = bool(td and td.get("refresh_token") and td.get("status") != "reauth_required")
    return {"configured": bool(cfg["client_id"] and cfg["client_secret"]), "connected": connected,
            "status": (td or {}).get("status") if td else None}


@router.get("/google-drive/connect-ticket")
async def gdrive_connect_ticket(user: dict = Depends(current_user)):
    cfg = await _gdrive_cfg()
    if not (cfg["client_id"] and cfg["client_secret"]):
        raise HTTPException(status_code=400, detail="Google Drive is not configured.")
    ticket = jwt.encode(
        {"sub": user["id"], "typ": "gdrive_connect", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"ticket": ticket}


@router.get("/google-drive/connect")
async def gdrive_connect(ticket: str):
    cfg = await _gdrive_cfg()
    if not (cfg["client_id"] and cfg["client_secret"]):
        raise HTTPException(status_code=400, detail="Google Drive is not configured.")
    try:
        payload = jwt.decode(ticket, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("typ") != "gdrive_connect":
            raise ValueError("bad ticket")
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired connect link.")
    state = secrets.token_urlsafe(32)
    await db.google_oauth_states.update_one(
        {"state_hash": hashlib.sha256(state.encode()).hexdigest()},
        {"$set": {"state_hash": hashlib.sha256(state.encode()).hexdigest(), "user_id": user_id,
                  "expires_at": now_utc() + timedelta(minutes=10), "used": False}}, upsert=True)
    flow = GFlow.from_client_config(_gdrive_client_config(cfg), scopes=GDRIVE_SCOPES, state=state)
    flow.redirect_uri = cfg["redirect_uri"]
    url, _ = flow.authorization_url(access_type="offline", prompt="consent", include_granted_scopes="true")
    return RedirectResponse(url)


@router.get("/google-drive/oauth/callback")
async def gdrive_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    cfg = await _gdrive_cfg()
    front = cfg["frontend_url"]
    if error or not code or not state:
        return RedirectResponse(f"{front}/settings?drive=denied")
    sd = await db.google_oauth_states.find_one_and_update(
        {"state_hash": hashlib.sha256(state.encode()).hexdigest(), "used": False,
         "expires_at": {"$gt": now_utc()}}, {"$set": {"used": True}})
    if not sd:
        return RedirectResponse(f"{front}/settings?drive=error")
    try:
        flow = GFlow.from_client_config(_gdrive_client_config(cfg), scopes=GDRIVE_SCOPES, state=state)
        flow.redirect_uri = cfg["redirect_uri"]
        await asyncio.to_thread(flow.fetch_token, code=code)
        creds = flow.credentials
    except Exception as e:
        log.warning("gdrive token exchange failed: %s", e)
        return RedirectResponse(f"{front}/settings?drive=error")
    old = await db.google_drive_tokens.find_one({"user_id": sd["user_id"]})
    refresh_token = creds.refresh_token or (old or {}).get("refresh_token")
    if not refresh_token:
        return RedirectResponse(f"{front}/settings?drive=norefresh")
    await db.google_drive_tokens.update_one(
        {"user_id": sd["user_id"]},
        {"$set": {"user_id": sd["user_id"], "access_token": creds.token, "refresh_token": refresh_token,
                  "scope": " ".join(creds.scopes or GDRIVE_SCOPES), "status": "connected",
                  "folder_id": (old or {}).get("folder_id"), "updated_at": now_utc()}}, upsert=True)
    return RedirectResponse(f"{front}/settings?drive=connected")


@router.delete("/google-drive/disconnect")
async def gdrive_disconnect(user: dict = Depends(current_user)):
    td = await db.google_drive_tokens.find_one({"user_id": user["id"]})
    if td and td.get("refresh_token"):
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                await c.post("https://oauth2.googleapis.com/revoke", params={"token": td["refresh_token"]})
        except Exception:
            pass
    await db.google_drive_tokens.delete_one({"user_id": user["id"]})
    return {"disconnected": True}


@router.post("/google-drive/evidence")
async def gdrive_evidence(payload: DriveEvidenceIn, user: dict = Depends(current_user)):
    try:
        raw = _decode_data_url(payload.data_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file data.")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    file = await _gdrive_upload(user["id"], raw, payload.filename, payload.mime_type)
    return {"uploaded": True, "file": file}


@router.get("/admin/integrations/google-drive")
async def admin_get_gdrive(_: dict = Depends(require_admin)):
    doc = await db.app_settings.find_one({"key": "google_drive"}) or {}
    cfg = await _gdrive_cfg()
    return {
        "client_id": doc.get("client_id", ""),
        "has_secret": bool(doc.get("client_secret") or os.environ.get("GOOGLE_CLIENT_SECRET")),
        "redirect_uri": doc.get("redirect_uri") or cfg["redirect_uri"],
        "frontend_url": doc.get("frontend_url") or cfg["frontend_url"],
        "default_redirect_uri": os.environ.get("PUBLIC_APP_URL", "").rstrip("/") + "/api/google-drive/oauth/callback",
        "configured": bool(cfg["client_id"] and cfg["client_secret"]),
    }


@router.put("/admin/integrations/google-drive")
async def admin_set_gdrive(payload: GDriveConfigIn, _: dict = Depends(require_admin)):
    update = {
        "key": "google_drive",
        "client_id": payload.client_id.strip(),
        "redirect_uri": payload.redirect_uri.strip(),
        "frontend_url": payload.frontend_url.strip(),
        "updated_at": now_utc(),
    }
    # Only overwrite the secret when a new (non-empty) value is provided.
    if payload.client_secret:
        update["client_secret"] = payload.client_secret.strip()
    await db.app_settings.update_one({"key": "google_drive"}, {"$set": update}, upsert=True)
    cfg = await _gdrive_cfg()
    return {"saved": True, "configured": bool(cfg["client_id"] and cfg["client_secret"])}
