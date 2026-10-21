"""Self-hosted push helper — no third-party relay, no vendor lock-in.

Public surface (kept stable so server.py keeps working):
    - Pydantic model ``RegisterPushBody``
    - Async function ``send_push(recipients, data, idempotency_key=None)``
    - APIRouter ``push_router`` exposing ``POST /register-push``

Design
------
Push is best-effort and fire-and-forget: a push failure must NEVER block the
primary operation (SOS alert, call ring, message, etc.). This module has zero
external calls by default, so the app runs fully offline/local with no keys.

Real device delivery (FCM) is wired at deploy time by setting the Firebase
environment below. When it is NOT configured, ``send_push`` simply logs and
returns — every feature still works, only the background OS notification is
skipped (foreground in-app polling continues to work).

    FCM (optional, free — Google Firebase):
        FIREBASE_CREDENTIALS_JSON   path to serviceAccount.json  (or)
        GOOGLE_APPLICATION_CREDENTIALS  path to serviceAccount.json

No vendor lock-in, no paid subscription, fully self-hosted.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("push")

push_router = APIRouter()

# --- optional FCM backend (lazy, only if firebase-admin + creds are present) --
_fcm_ready: Optional[bool] = None
_messaging = None


def _fcm_init() -> bool:
    """Initialise firebase-admin once, if available & configured. Safe no-op otherwise."""
    global _fcm_ready, _messaging
    if _fcm_ready is not None:
        return _fcm_ready
    cred_path = (
        os.environ.get("FIREBASE_CREDENTIALS_JSON")
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        or ""
    )
    if not cred_path or not os.path.exists(cred_path):
        _fcm_ready = False
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(cred_path))
        _messaging = messaging
        _fcm_ready = True
        logger.info("FCM push enabled")
    except Exception as e:  # firebase-admin not installed or bad creds
        logger.warning("FCM not available (%s) — push will no-op", e)
        _fcm_ready = False
    return _fcm_ready


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str          # "android" | "ios" | "web"
    device_token: str


# In-memory token map keeps the module self-contained. server.py also stores
# tokens on the user document (fcm_tokens) when its /me/push-token route exists;
# this route is just a harmless fallback so the app never errors on register.
_tokens: dict[str, set[str]] = {}


@push_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    """Accept a device token. Stored in-memory; no external service is called."""
    _tokens.setdefault(body.user_id, set()).add(body.device_token)
    return {"ok": True}


async def send_push(
    recipients: list[str],
    data: dict,
    idempotency_key: Optional[str] = None,
) -> None:
    """Best-effort push. Delivers via FCM if configured, else logs and returns.

    NEVER raises — callers can ``await send_push(...)`` without a try/except.
    """
    try:
        if not _fcm_init():
            logger.debug("push (no FCM configured) → %s | %s", recipients, data.get("title"))
            return
        # Collect tokens for the recipients (in-memory fallback store).
        tokens: list[str] = []
        for uid in recipients:
            tokens.extend(_tokens.get(uid, set()))
        if not tokens:
            return
        title = str(data.get("title", "Nek Sathi"))
        body_txt = str(data.get("message", ""))
        for tok in tokens:
            try:
                msg = _messaging.Message(
                    token=tok,
                    notification=_messaging.Notification(title=title, body=body_txt),
                    data={k: str(v) for k, v in data.items()},
                    android=_messaging.AndroidConfig(priority="high"),
                )
                _messaging.send(msg)
            except Exception as e:
                logger.warning("push send failed for one token: %s", e)
    except Exception as e:
        logger.warning("send_push error (ignored): %s", e)
