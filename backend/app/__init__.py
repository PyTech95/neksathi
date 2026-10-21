"""Nek Sathi – FastAPI application factory / wiring.

Creates the FastAPI ``app``, registers middleware, the rate-limit exception
handler, every domain router (all under the ``/api`` prefix), the self-hosted
push + FCM routers, the commerce router, the admin router, the app-level
``/scan|/t|/c|/claim`` redirect routes and the startup/shutdown lifecycle.

All routes are prefixed with /api. Uses MongoDB via Motor. UUID-based IDs so JSON
serialization never touches Mongo ObjectIds. Auth is email+password with bcrypt +
JWT (HS256).
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Request
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.cors import CORSMiddleware

from app.ratelimit import limiter
from app.startup import on_startup, on_shutdown

# Domain routers
from app.routers import (
    misc, auth, vehicles, scan_public, alerts, incidents, family, circles,
    safezones, safety, tags, cards, devices, calls, integrations, dealer, org,
    support, community, billing, commerce,
)
from app.routers import admin as admin_router
from app.services.fcm import router as fcm_router
from app.services.push import push_router

app = FastAPI(title="Nek Sathi API")

# Rate limiting — the exception handler alone enforces limits (no middleware).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---- Mount every domain router under /api -------------------------------------
_API_ROUTERS = [
    misc, auth, vehicles, scan_public, alerts, incidents, family, circles,
    safezones, safety, tags, cards, devices, calls, integrations, dealer, org,
    support, community, billing, commerce,
]
for _mod in _API_ROUTERS:
    app.include_router(_mod.router, prefix="/api")

# FCM push-token endpoint + admin surface + self-hosted push fallback.
app.include_router(fcm_router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")
app.include_router(push_router, prefix="/api")


# ---------------------------------------------------------------------------
# A QR whose base was the API host (e.g. https://api.neksathi.in/scan/<id>)
# opens on FastAPI, which has no such page -> 404 {"detail":"Not Found"}.
# /scan, /t, /c, /claim are WEBSITE (React) routes. These handlers catch them on
# the API host and 307-redirect to the website so the page renders — so even
# QRs already printed with the API base keep working.
# ---------------------------------------------------------------------------
def _web_base() -> str:
    return (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_WEB_URL") or os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")


@app.api_route("/scan/{qr_id}", methods=["GET", "HEAD"])
@app.api_route("/t/{qr_id}", methods=["GET", "HEAD"])
@app.api_route("/c/{qr_id}", methods=["GET", "HEAD"])
@app.api_route("/claim/{qr_id}", methods=["GET", "HEAD"])
async def _frontend_route_redirect(qr_id: str, request: Request):
    from fastapi.responses import RedirectResponse
    from urllib.parse import urlparse
    web = _web_base()
    web_host = (urlparse(web).hostname or "").lower()
    req_host = (request.headers.get("host") or "").split(":")[0].lower()
    # Only redirect when the website is a DIFFERENT host than this API host
    # (prevents a redirect loop if they ever share a domain).
    if web and web_host and web_host != req_host:
        target = f"{web}{request.url.path}"
        if request.url.query:
            target += f"?{request.url.query}"
        return RedirectResponse(url=target, status_code=307)
    raise HTTPException(status_code=404, detail="Not Found")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_event_handler("startup", on_startup)
app.add_event_handler("shutdown", on_shutdown)
