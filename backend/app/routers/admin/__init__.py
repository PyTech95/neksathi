"""Admin surface — combines the admin submodule routers into one router."""
from __future__ import annotations

from fastapi import APIRouter

from app.routers.admin import users, qr, telco, content

router = APIRouter()
router.include_router(users.router)
router.include_router(qr.router)
router.include_router(telco.router)
router.include_router(content.router)
