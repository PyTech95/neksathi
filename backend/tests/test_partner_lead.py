"""Unit tests for website Partner registration (pt 9-web): store the lead and
notify admins. mongomock + captured push (no live server)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "x")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")

import asyncio

import pytest
from pydantic import ValidationError
from mongomock_motor import AsyncMongoMockClient

import app.routers.support as sup


def _fresh(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(sup, "db", db)
    pushes = []

    async def fake_push(recipients, data, idempotency_key=None, **kw):
        pushes.append({"recipients": list(recipients), "data": data})

    monkeypatch.setattr(sup, "_send_push", fake_push)
    return db, pushes


def test_partner_lead_stored_and_admin_notified(monkeypatch):
    db, pushes = _fresh(monkeypatch)

    async def run():
        await db.users.insert_one({"id": "A1", "is_admin": True})
        p = sup.PartnerLeadIn(name="Acme", company="Acme Pvt", phone="+919812345678", partner_type="Dealer / Reseller")
        doc = await sup._save_partner_lead(p)
        stored = await db.partner_leads.find_one({"id": doc["id"]})
        return doc, stored

    doc, stored = asyncio.run(run())
    assert doc["status"] == "new" and doc["name"] == "Acme"
    assert stored and stored["phone"] == "+919812345678" and stored["partner_type"] == "Dealer / Reseller"
    assert pushes and pushes[0]["recipients"] == ["A1"]
    assert pushes[0]["data"]["type"] == "partner_lead"
    assert "Acme Pvt" in pushes[0]["data"]["message"]


def test_partner_lead_no_admins_still_saves(monkeypatch):
    db, pushes = _fresh(monkeypatch)

    async def run():
        p = sup.PartnerLeadIn(name="Solo", phone="+919800000000")
        doc = await sup._save_partner_lead(p)
        return doc, await db.partner_leads.find_one({"id": doc["id"]})

    doc, stored = asyncio.run(run())
    assert stored is not None
    assert pushes == []


def test_partner_lead_validation():
    with pytest.raises(ValidationError):
        sup.PartnerLeadIn(name="", phone="12345")          # empty name + short phone
    # a valid minimal lead constructs fine
    ok = sup.PartnerLeadIn(name="Ravi", phone="+919812345678")
    assert ok.name == "Ravi"
