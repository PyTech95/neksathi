"""Owner can pause / resume a QR. While paused: the vehicle's qr_paused flag is
set, a public scan reports qr_paused, and raising an alert is refused (403)."""
import asyncio

import pytest
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers import vehicles as ve
from app.routers import scan_public as sp
from app.ratelimit import limiter
from app.schemas import QrPauseIn, ScanAlertIn
from app.utils import now_utc


def _vehicle(**extra):
    doc = {
        "id": "V1", "owner_id": "U1", "number_plate": "MH12AB1234",
        "vehicle_type": "car", "qr_id": "QR1", "speed_limit_kmh": 80,
        "lost_mode": False, "created_at": now_utc(),
    }
    doc.update(extra)
    return doc


def test_toggle_qr_pause_sets_flag(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(ve, "db", db)

    async def run():
        await db.vehicles.insert_one(_vehicle())
        on = await ve.toggle_qr_pause("V1", QrPauseIn(paused=True), user={"id": "U1"})
        off = await ve.toggle_qr_pause("V1", QrPauseIn(paused=False), user={"id": "U1"})
        return on, off

    on, off = asyncio.run(run())
    assert on.qr_paused is True
    assert off.qr_paused is False


def test_pause_requires_ownership(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(ve, "db", db)

    async def run():
        await db.vehicles.insert_one(_vehicle())
        return await ve.toggle_qr_pause("V1", QrPauseIn(paused=True), user={"id": "SOMEONE_ELSE"})

    with pytest.raises(HTTPException) as ei:
        asyncio.run(run())
    assert ei.value.status_code == 404


def test_public_lookup_reports_paused(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(sp, "db", db)

    async def run():
        await db.users.insert_one({"id": "U1", "name": "Asha Rai"})
        await db.vehicles.insert_one(_vehicle(qr_paused=True))
        return await sp.public_qr_lookup("QR1")

    res = asyncio.run(run())
    assert res.qr_paused is True
    assert res.owner_first_name == "Asha"


def test_public_alert_refused_when_paused(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(sp, "db", db)

    async def run():
        await db.vehicles.insert_one(_vehicle(qr_paused=True))
        req = type("R", (), {"client": type("C", (), {"host": "1.2.3.4"})()})()
        return await sp.public_qr_alert(req, "QR1", ScanAlertIn(type="emergency"))

    # public_qr_alert is @rate_limit-decorated; disable the limiter just for this
    # call (restored after) so the endpoint runs its own logic without a live
    # ingress, then re-raises our 403 for a paused QR.
    prev = limiter.enabled
    limiter.enabled = False
    try:
        with pytest.raises(HTTPException) as ei:
            asyncio.run(run())
    finally:
        limiter.enabled = prev
    assert ei.value.status_code == 403
    assert "paused" in ei.value.detail.lower()
