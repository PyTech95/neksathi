from __future__ import annotations

import asyncio
import base64
import os
from typing import Optional
from fastapi import HTTPException
from google.oauth2.credentials import Credentials as GCredentials
from google_auth_oauthlib.flow import Flow as GFlow
from googleapiclient.discovery import build as gbuild
from googleapiclient.http import MediaInMemoryUpload
from google.auth.transport.requests import Request as GAuthRequest
from app.config import log
from app.db import db
from app.utils import now_utc


GDRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]


async def _gdrive_cfg() -> dict:
    """Google Drive OAuth config — admin-managed (DB) overrides env fallback."""
    doc = await db.app_settings.find_one({"key": "google_drive"}) or {}
    default_redirect = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") + "/api/google-drive/oauth/callback"
    default_front = (os.environ.get("PUBLIC_APP_URL", "")).rstrip("/")
    return {
        "client_id": doc.get("client_id") or os.environ.get("GOOGLE_CLIENT_ID") or "",
        "client_secret": doc.get("client_secret") or os.environ.get("GOOGLE_CLIENT_SECRET") or "",
        "redirect_uri": doc.get("redirect_uri") or os.environ.get("GOOGLE_OAUTH_REDIRECT_URI") or default_redirect,
        "frontend_url": (doc.get("frontend_url") or os.environ.get("FRONTEND_URL") or default_front).rstrip("/"),
    }


def _gdrive_client_config(cfg: dict) -> dict:
    return {"web": {
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [cfg["redirect_uri"]],
    }}


def _decode_data_url(s: str) -> bytes:
    if "," in s and s.strip().startswith("data:"):
        s = s.split(",", 1)[1]
    return base64.b64decode(s)


def _gdrive_upload_sync(token_doc: dict, data: bytes, filename: str, mime: str, client_id: str, client_secret: str) -> dict:
    creds = GCredentials(
        token=token_doc.get("access_token"), refresh_token=token_doc["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id, client_secret=client_secret,
        scopes=GDRIVE_SCOPES,
    )
    if not creds.valid or creds.expired:
        creds.refresh(GAuthRequest())
    service = gbuild("drive", "v3", credentials=creds, cache_discovery=False)
    folder_id = token_doc.get("folder_id")
    if not folder_id:
        resp = service.files().list(
            q="name='Nek Sathi' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            spaces="drive", fields="files(id,name)", pageSize=5).execute()
        folder_id = resp["files"][0]["id"] if resp.get("files") else service.files().create(
            body={"name": "Nek Sathi", "mimeType": "application/vnd.google-apps.folder"}, fields="id").execute()["id"]
    media = MediaInMemoryUpload(data, mimetype=mime, resumable=False)
    result = service.files().create(
        body={"name": filename, "parents": [folder_id], "mimeType": mime},
        media_body=media, fields="id,name,webViewLink").execute()
    return {"access_token": creds.token, "folder_id": folder_id, "file": result}


async def _gdrive_upload(user_id: str, data: bytes, filename: str, mime: str) -> dict:
    cfg = await _gdrive_cfg()
    if not (cfg["client_id"] and cfg["client_secret"]):
        raise HTTPException(status_code=400, detail="Google Drive is not configured.")
    td = await db.google_drive_tokens.find_one({"user_id": user_id})
    if not td or not td.get("refresh_token"):
        raise HTTPException(status_code=409, detail="Connect Google Drive first.")
    try:
        out = await asyncio.to_thread(_gdrive_upload_sync, td, data, filename, mime, cfg["client_id"], cfg["client_secret"])
    except Exception as e:
        msg = str(e)
        if "invalid_grant" in msg or "unauthorized" in msg.lower():
            await db.google_drive_tokens.update_one({"user_id": user_id}, {"$set": {"status": "reauth_required"}})
            raise HTTPException(status_code=401, detail="Google Drive access expired — please reconnect.")
        raise HTTPException(status_code=502, detail="Google Drive upload failed.")
    await db.google_drive_tokens.update_one(
        {"user_id": user_id}, {"$set": {"access_token": out["access_token"], "folder_id": out["folder_id"],
                                         "status": "connected", "updated_at": now_utc()}})
    return out["file"]


async def _gdrive_autobackup(user_id: str, data_url: Optional[str], filename: str, mime: str):
    """Fire-and-forget: silently upload if the user has Drive connected."""
    try:
        td = await db.google_drive_tokens.find_one({"user_id": user_id})
        if not td or not td.get("refresh_token") or not data_url:
            return
        cfg = await _gdrive_cfg()
        if not (cfg["client_id"] and cfg["client_secret"]):
            return
        data = _decode_data_url(data_url)
        out = await asyncio.to_thread(_gdrive_upload_sync, td, data, filename, mime, cfg["client_id"], cfg["client_secret"])
        await db.google_drive_tokens.update_one(
            {"user_id": user_id}, {"$set": {"access_token": out["access_token"], "folder_id": out["folder_id"]}})
    except Exception as e:
        log.warning("gdrive autobackup failed for %s: %s", user_id, e)
