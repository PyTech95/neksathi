"""Owner blocklist: add/list/dedupe/remove, number matching across formats, and
the public alert flow silently dropping an alert from a blocked scanner number."""
import asyncio

import pytest
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers import blocked as bl
from app.routers import scan_public as sp
from app.ratelimit import limiter
from app.schemas import ScanAlertIn
from app.utils import now_utc


def _vehicle(**extra):
    doc = {"id": "V1", "owner_id": "U1", "number_plate": "MH12AB1234",
           "vehicle_type": "car", "qr_id": "QR1", "lost_mode": False, "created_at": now_utc()}
    doc.update(extra)
    return doc


def test_add_list_dedupe_remove(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(bl, "db", db)

    async def run():
        from app.routers.blocked import BlockNumberIn
        a = await bl.add_blocked_number(BlockNumberIn(phone="9876543210", label="spam"), user={"id": "U1"})
        # same number in a different format must dedupe to the same row
        again = await bl.add_blocked_number(BlockNumberIn(phone="+91 98765 43210"), user={"id": "U1"})
        listed = await bl.list_blocked_numbers(user={"id": "U1"})
        return a, again, listed

    a, again, listed = asyncio.run(run())
    assert a.id == again.id
    assert len(listed) == 1 and listed[0].phone == "9876543210"


def test_is_number_blocked_matches_formats(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(bl, "db", db)

    async def run():
        from app.routers.blocked import BlockNumberIn
        await bl.add_blocked_number(BlockNumberIn(phone="9876543210"), user={"id": "U1"})
        return (
            await bl.is_number_blocked("U1", "+919876543210"),
            await bl.is_number_blocked("U1", "09876543210"),
            await bl.is_number_blocked("U1", "9999999999"),
            await bl.is_number_blocked("OTHER", "9876543210"),
        )

    hit1, hit2, miss, other_owner = asyncio.run(run())
    assert hit1 is True and hit2 is True
    assert miss is False and other_owner is False


def test_remove_requires_ownership(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(bl, "db", db)

    async def run():
        from app.routers.blocked import BlockNumberIn
        row = await bl.add_blocked_number(BlockNumberIn(phone="9876543210"), user={"id": "U1"})
        return row

    row = asyncio.run(run())
    with pytest.raises(HTTPException) as ei:
        asyncio.run(bl.remove_blocked_number(row.id, user={"id": "SOMEONE"}))
    assert ei.value.status_code == 404


def test_public_alert_silently_dropped_for_blocked(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    # scan_public and blocked both resolve the same db
    monkeypatch.setattr(sp, "db", db)
    monkeypatch.setattr(bl, "db", db)

    async def run():
        from app.routers.blocked import BlockNumberIn
        await db.vehicles.insert_one(_vehicle())
        await bl.add_blocked_number(BlockNumberIn(phone="9876543210"), user={"id": "U1"})
        req = type("R", (), {"client": type("C", (), {"host": "1.2.3.4"})()})()
        res = await sp.public_qr_alert(req, "QR1", ScanAlertIn(type="emergency", scanner_phone="9876543210"))
        count = await db.alerts.count_documents({})
        return res, count

    prev = limiter.enabled
    limiter.enabled = False
    try:
        res, count = asyncio.run(run())
    finally:
        limiter.enabled = prev
    assert res["ok"] is True and res["id"] is None
    assert count == 0  # no alert persisted for a blocked number


def test_public_alert_goes_through_for_unblocked(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(sp, "db", db)
    monkeypatch.setattr(bl, "db", db)

    async def run():
        await db.vehicles.insert_one(_vehicle())
        req = type("R", (), {"client": type("C", (), {"host": "1.2.3.4"})()})()
        res = await sp.public_qr_alert(req, "QR1", ScanAlertIn(type="emergency", scanner_phone="9999999999"))
        count = await db.alerts.count_documents({})
        return res, count

    prev = limiter.enabled
    limiter.enabled = False
    try:
        res, count = asyncio.run(run())
    finally:
        limiter.enabled = prev
    assert res["ok"] is True and res["id"] is not None
    assert count == 1
