"""Nek Sathi backend entry point.

Thin shim kept so ``uvicorn server:app`` continues to work after the refactor
of the former monolith into the ``app`` package. All application code now lives
under ``app/`` (core, schemas, services, routers). This module only re-exports
the assembled FastAPI ``app`` plus a few common names for tooling / tests.
"""
from app import app
from app.db import client, db
from app.security import (
    hash_password, verify_password, create_access_token, canon_phone,
    current_user, require_admin, require_dealer, to_user_out,
)
from app.utils import now_utc, new_id, clean
from app.services.fcm import send_push

__all__ = [
    "app", "client", "db",
    "hash_password", "verify_password", "create_access_token", "canon_phone",
    "current_user", "require_admin", "require_dealer", "to_user_out",
    "now_utc", "new_id", "clean", "send_push",
]
