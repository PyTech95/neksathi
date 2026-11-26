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


def test_admin_users_phone_user_without_email_does_not_crash(monkeypatch):
    # Regression: OTP / phone-only sign-ups historically had NO `email` key, which
    # made the list endpoint 500 on u["email"] and the admin table showed empty.
    # The list must tolerate a doc missing email/name/phone/created_at.
    db = _db(monkeypatch)

    async def run():
        await db.users.insert_one({"id": "U_ok", "email": "ok@x.com", "name": "Ok", "phone": "1", "created_at": now_utc()})
        await db.users.insert_one({"id": "U_otp", "name": "Nek Sathi User", "phone": "+919999999999", "created_at": now_utc()})  # no email
        await db.users.insert_one({"id": "U_bare", "phone": "+918888888888"})  # no email/name/created_at
        return await au.admin_users(_={}, q=None, skip=0, limit=25)

    res = asyncio.run(run())
    assert res["total"] == 3 and res["count"] == 3
    by_id = {u["id"]: u for u in res["results"]}
    assert by_id["U_otp"]["email"] == "" and by_id["U_otp"]["name"] == "Nek Sathi User"
    assert by_id["U_bare"]["email"] == "" and by_id["U_bare"]["name"]  # falls back, never crashes


def test_admin_users_status_filter(monkeypatch):
    # The Users-page chips (Active / Suspended / Admins) map to a status filter.
    db = _db(monkeypatch)

    async def run():
        await db.users.insert_one({"id": "A", "email": "a@x.com", "name": "A", "phone": "1", "created_at": now_utc()})
        await db.users.insert_one({"id": "S", "email": "s@x.com", "name": "S", "phone": "2", "created_at": now_utc(), "suspended": True})
        await db.users.insert_one({"id": "AD", "email": "ad@x.com", "name": "AD", "phone": "3", "created_at": now_utc(), "is_admin": True})
        return (
            await au.admin_users(_={}, status="active"),
            await au.admin_users(_={}, status="suspended"),
            await au.admin_users(_={}, status="admin"),
        )

    active, suspended, admins = asyncio.run(run())
    assert {u["id"] for u in active["results"]} == {"A", "AD"}  # not suspended
    assert [u["id"] for u in suspended["results"]] == ["S"]
    assert [u["id"] for u in admins["results"]] == ["AD"]
