"""Emergent-managed push notification relay.

This module wraps the Emergent Push service (SuprSend passthrough) as a
non-blocking helper. Callers use ``send_push(recipients=[user_id], data={...})``
which returns fire-and-forget — a push failure NEVER blocks the primary
operation (SOS alert, doorbell ring, message delivery, etc.).

Environment:
    EMERGENT_PUSH_KEY — auto-populated by deployment pipeline (placeholder
    in dev). NEVER hardcode a real key here.

Public surface:
    - Pydantic model ``RegisterPushBody``
    - Async function ``register_device(body)`` — relays token registration
    - Async function ``send_push(recipients, data, idempotency_key=None)``
    - APIRouter ``push_router`` exposing ``POST /register-push``
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("push")

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

# Shared httpx client — module-scope so connection pooling works across
# requests. FastAPI/uvicorn cleans this up on shutdown.
_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str          # "android" | "ios"
    device_token: str


push_router = APIRouter()


@push_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    """Relay device token registration to Emergent Push service."""
    try:
        resp = await _client.post(
            "/api/v1/push/users/register", json=body.model_dump()
        )
    except httpx.HTTPError as e:
        logger.warning("push register upstream error: %s", e)
        # Do not fail login/app-open on push registration errors.
        return {"status": "deferred"}
    if resp.status_code == 401:
        logger.warning("EMERGENT_PUSH_KEY missing or invalid")
        return {"status": "deferred"}
    if resp.status_code >= 500:
        logger.warning("push provider 5xx: %s", resp.status_code)
        return {"status": "deferred"}
    if resp.status_code >= 400:
        logger.warning("push register 4xx %s: %s", resp.status_code, resp.text[:200])
        return {"status": "deferred"}
    return {"status": "registered"}


async def send_push(
    recipients: list[str],
    data: dict,
    idempotency_key: Optional[str] = None,
) -> None:
    """Trigger a push notification.

    ``data`` must include at minimum ``title`` and ``message``. Supported optional
    fields per Emergent Push data-contract:
      subtext, image_url, action_url, deeplink, channel_id, sound.

    Never raises to caller — all errors are logged. Call sites should NOT need
    to wrap in try/except, but doing so is harmless and encouraged for clarity.
    """
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        logger.warning("send_push missing title/message; dropping")
        return
    # Chunk to <=100 per relay call.
    for i in range(0, len(recipients), 100):
        chunk = recipients[i : i + 100]
        payload: dict = {"recipients": chunk, "data": data}
        if idempotency_key:
            payload["$idempotency_key"] = f"{idempotency_key}-{i//100}"
        try:
            resp = await _client.post("/api/v1/push/trigger", json=payload)
            if resp.status_code >= 400:
                logger.warning(
                    "send_push %s -> %s: %s",
                    len(chunk),
                    resp.status_code,
                    resp.text[:200],
                )
        except httpx.HTTPError as e:  # pragma: no cover
            logger.warning("send_push upstream error: %s", e)
