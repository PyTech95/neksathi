"""Login now accepts email OR mobile + password; the admin users list carries
each user's current plan name + validity so the admin can see who's on what."""
import asyncio
from datetime import timedelta

import pytest
from pydantic import ValidationError
from mongomock_motor import AsyncMongoMockClient

from app.schemas.auth import LoginIn
from app.routers.admin import users as au
from app.utils import now_utc


# ---- LoginIn flexibility (email or mobile) ----

def test_login_accepts_email():
    assert LoginIn(email="a@b.com", password="x").email == "a@b.com"


def test_login_accepts_mobile_in_identifier():
    assert LoginIn(identifier="9876543210", password="x").identifier == "9876543210"


def test_login_accepts_mobile_in_legacy_email_field():
    # A mobile sent in the old `email` field must no longer be rejected.
    assert LoginIn(email="9876543210", password="x").email == "9876543210"


def test_login_requires_password():
    with pytest.raises(ValidationError):
        LoginIn(email="a@b.com")


# ---- admin users list carries plan info ----

def _db(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(au, "db", db)
    return db


def test_admin_users_includes_plan(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await db.users.insert_one({"id": "U1", "email": "a@b.com", "name": "A", "phone": "999", "created_at": now_utc()})
        await db.vehicles.insert_one({"id": "V1", "owner_id": "U1", "plan_name": "Yearly",
                                      "plan_expires_at": now_utc() + timedelta(days=200)})
        return await au.admin_users(_={}, q=None, skip=0, limit=25)

    res = asyncio.run(run())
    assert res["total"] == 1
    u = res["results"][0]
    assert u["plan_name"] == "Yearly" and u["plan_expires_at"] is not None


def test_admin_users_no_plan_is_none(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await db.users.insert_one({"id": "U2", "email": "c@d.com", "name": "C", "phone": "888", "created_at": now_utc()})
        return await au.admin_users(_={}, q=None, skip=0, limit=25)

    res = asyncio.run(run())
    assert res["results"][0]["plan_name"] is None and res["results"][0]["plan_expires_at"] is None


def test_admin_users_pagination(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        for i in range(30):
            await db.users.insert_one({"id": f"U{i}", "email": f"u{i}@x.com", "name": f"U{i}", "phone": str(i), "created_at": now_utc()})
        page1 = await au.admin_users(_={}, q=None, skip=0, limit=25)
        page2 = await au.admin_users(_={}, q=None, skip=25, limit=25)
        return page1, page2

    p1, p2 = asyncio.run(run())
    assert p1["total"] == 30 and p1["count"] == 25 and p2["count"] == 5
