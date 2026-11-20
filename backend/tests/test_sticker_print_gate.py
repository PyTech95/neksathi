"""The customer's own QR sticker must stay hidden until admin has printed it.
_self_sticker_png() renders only when the item has an order in STICKER_READY
(printed / shipped / out_for_delivery / delivered); otherwise it raises 409."""
import asyncio

import pytest
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers import commerce as cm


def _fresh(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(cm, "db", db)
    # Don't depend on request/base-url or PIL rendering for a gate test.
    monkeypatch.setattr(cm, "_scan_url", lambda product, qr_id, request=None: f"https://x/scan/{qr_id}")
    monkeypatch.setattr(cm.sticker, "render_sticker", lambda *a, **k: b"PNGBYTES")
    return db


async def _seed_vehicle(db, order_status):
    await db.vehicles.insert_one({"id": "V1", "owner_id": "U1", "qr_id": "Q1",
                                  "number_plate": "MH12AB1234"})
    await db.qr_orders.insert_one({"id": "O1", "vehicle_id": "V1", "status": order_status,
                                   "sticker_code": "024652" if order_status in cm.STICKER_READY else None})


def test_hidden_before_printed(monkeypatch):
    db = _fresh(monkeypatch)

    async def run():
        await _seed_vehicle(db, "generating")  # paid, QR generating — NOT printed yet
        with pytest.raises(HTTPException) as ei:
            await cm._self_sticker_png("vehicle", "V1", {"id": "U1"}, None)
        return ei.value

    exc = asyncio.run(run())
    assert exc.status_code == 409
    assert "printed" in str(exc.detail).lower()


def test_visible_after_printed(monkeypatch):
    db = _fresh(monkeypatch)

    async def run():
        await _seed_vehicle(db, "printed")
        png, base = await cm._self_sticker_png("vehicle", "V1", {"id": "U1"}, None)
        veh = await db.vehicles.find_one({"id": "V1"})
        return png, base, veh

    png, base, veh = asyncio.run(run())
    assert png == b"PNGBYTES"
    assert "024652" in base               # uses the real printed code
    assert veh["sticker_code"] == "024652"  # persisted on the item


def test_visible_after_delivered(monkeypatch):
    db = _fresh(monkeypatch)

    async def run():
        await _seed_vehicle(db, "delivered")
        png, _ = await cm._self_sticker_png("vehicle", "V1", {"id": "U1"}, None)
        return png

    assert asyncio.run(run()) == b"PNGBYTES"


def test_not_owner_is_404(monkeypatch):
    db = _fresh(monkeypatch)

    async def run():
        await _seed_vehicle(db, "printed")
        with pytest.raises(HTTPException) as ei:
            await cm._self_sticker_png("vehicle", "V1", {"id": "OTHER"}, None)
        return ei.value

    assert asyncio.run(run()).status_code == 404


def test_dealer_assigned_visible_without_order(monkeypatch):
    db = _fresh(monkeypatch)

    async def run():
        # Dealer assigned a pre-printed sticker from inventory: no qr_order exists,
        # but the physical sticker is already in hand, so the QR must be visible.
        await db.vehicles.insert_one({"id": "V9", "owner_id": "U1", "qr_id": "Q9",
                                      "number_plate": "DL9CAF1111", "assigned_by": "vendor",
                                      "vendor_id": "VEND1"})
        await db.qr_inventory.insert_one({"qr_id": "Q9", "serial_no": "778899", "status": "assigned"})
        png, base = await cm._self_sticker_png("vehicle", "V9", {"id": "U1"}, None)
        return png, base

    png, base = asyncio.run(run())
    assert png == b"PNGBYTES"
    assert "778899" in base  # uses the pre-printed inventory serial as the code
