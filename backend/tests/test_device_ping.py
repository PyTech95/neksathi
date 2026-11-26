"""Locate a lost device: a device can report its own location via /devices/{id}/
ping, which updates its last-known location (surfaced on DeviceOut)."""
import asyncio

import pytest
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers import devices as dv
from app.schemas import DevicePingIn
from app.utils import now_utc


def _db(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(dv, "db", db)
    return db


def test_ping_sets_last_location(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await db.devices.insert_one({"id": "D1", "user_id": "U1", "name": "My phone",
                                     "lock_threshold": 3, "created_at": now_utc()})
        out = await dv.ping_device("D1", DevicePingIn(latitude=28.61, longitude=77.20, battery=42), user={"id": "U1"})
        return out

    out = asyncio.run(run())
    assert out.last_lat == 28.61 and out.last_lng == 77.20
    assert out.last_battery == 42
    assert out.last_located_at is not None


def test_ping_requires_ownership(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await db.devices.insert_one({"id": "D1", "user_id": "U1", "name": "My phone",
                                     "lock_threshold": 3, "created_at": now_utc()})
        return await dv.ping_device("D1", DevicePingIn(latitude=1, longitude=2), user={"id": "OTHER"})

    with pytest.raises(HTTPException) as ei:
        asyncio.run(run())
    assert ei.value.status_code == 404


def test_device_out_exposes_location(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await db.devices.insert_one({"id": "D1", "user_id": "U1", "name": "P", "lock_threshold": 3,
                                     "created_at": now_utc(), "last_lat": 10.0, "last_lng": 20.0})
        return await dv.list_devices(user={"id": "U1"})

    items = asyncio.run(run())
    assert len(items) == 1 and items[0].last_lat == 10.0 and items[0].last_lng == 20.0
