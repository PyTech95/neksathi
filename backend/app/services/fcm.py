from __future__ import annotations

import asyncio
import logging
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db import db
from app.security import current_user

router = APIRouter()


_fcm_ready = False


_fcm_app = None


_fcm_log = logging.getLogger("safeqr.fcm")


def _fcm_init():
    global _fcm_ready, _fcm_app
    if _fcm_ready:
        return _fcm_app
    _fcm_ready = True
    try:
        import firebase_admin
        from firebase_admin import credentials as _creds
        path = os.environ.get("FCM_CREDENTIALS_FILE", "").strip()
        if not path or not os.path.exists(path):
            _fcm_log.warning("FCM_CREDENTIALS_FILE missing; FCM push disabled")
            return None
        _fcm_app = firebase_admin.get_app() if firebase_admin._apps else firebase_admin.initialize_app(_creds.Certificate(path))
    except Exception as e:
        _fcm_log.warning("FCM init failed: %s", e)
        _fcm_app = None
    return _fcm_app


async def fcm_send_to_user(owner_id, title, body, data=None, data_only=False):
    if _fcm_init() is None:
        return
    try:
        u = await db.users.find_one({"id": owner_id}, {"fcm_tokens": 1})
    except Exception:
        return
    tokens = list((u or {}).get("fcm_tokens") or [])
    if not tokens:
        return
    def _send():
        from firebase_admin import messaging
        payload = {k: str(v) for k, v in (data or {}).items()}
        if data_only:
            # DATA-ONLY, high priority: wakes our FirebaseMessagingService
            # (onMessageReceived) even when the app is backgrounded / the phone is
            # locked — required so the native full-screen incoming-call UI fires.
            # A `notification` block would instead be shown by the system tray and
            # our service would never run.
            msg = messaging.MulticastMessage(
                tokens=tokens,
                data=payload,
                android=messaging.AndroidConfig(priority="high"),
            )
        else:
            msg = messaging.MulticastMessage(
                tokens=tokens,
                notification=messaging.Notification(title=title, body=body),
                data=payload,
                android=messaging.AndroidConfig(priority="high", notification=messaging.AndroidNotification(sound="default")),
            )
        resp = messaging.send_each_for_multicast(msg)
        dead = []
        for i, r in enumerate(resp.responses):
            if not r.success:
                es = str(getattr(r, "exception", "")).lower()
                if "not-registered" in es or "not registered" in es or "invalid-registration" in es or "invalid-argument" in es:
                    dead.append(tokens[i])
        return dead
    try:
        dead = await asyncio.to_thread(_send)
        if dead:
            await db.users.update_one({"id": owner_id}, {"$pull": {"fcm_tokens": {"$in": dead}}})
    except Exception as e:
        _fcm_log.warning("FCM send failed: %s", e)


async def send_push(recipients, data, idempotency_key=None, data_only=False):
    # FCM-backed push (shadows Emergent relay) for incidents, SOS, family, calls.
    # Pass data_only=True for incoming calls so the native service shows the
    # full-screen call UI over the lock screen (see fcm_send_to_user).
    if not recipients:
        return
    title = str(data.get("title") or "Nek Sathi")
    body = str(data.get("message") or "")
    if data_only:
        payload = {k: str(v) for k, v in (data or {}).items() if v is not None}
    else:
        payload = {k: str(v) for k, v in (data or {}).items() if k not in ("title", "message") and v is not None}
    for rid in recipients:
        try:
            await fcm_send_to_user(rid, title, body, payload, data_only=data_only)
        except Exception as e:
            _fcm_log.warning("send_push->fcm failed: %s", e)


class PushTokenIn(BaseModel):
    token: str
    platform: str = "android"


@router.post("/me/push-token")
async def register_fcm_token(payload: PushTokenIn, user: dict = Depends(current_user)):
    tok = (payload.token or "").strip()
    if not tok:
        raise HTTPException(status_code=400, detail="token required")
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"fcm_tokens": tok}})
    return {"status": "ok"}
