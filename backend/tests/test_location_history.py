"""Family location trail: each /me/status or /me/location feeds a throttled
history (at most ~one point per 2 min unless the person moved ~120m+), which the
member-history endpoint reads back as the day's '9:00 here, 9:30 there' timeline."""
import asyncio

from mongomock_motor import AsyncMongoMockClient

from app.routers import family as fam


def _db(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(fam, "db", db)
    return db


def test_first_point_is_recorded(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        ok = await fam.record_location_history("U1", 28.60, 77.20, 40, 90)
        return ok, await db.location_history.count_documents({"user_id": "U1"})

    ok, n = asyncio.run(run())
    assert ok is True and n == 1


def test_near_point_soon_is_throttled(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await fam.record_location_history("U1", 28.60, 77.20)
        ok = await fam.record_location_history("U1", 28.6001, 77.2001)  # ~15 m, right away
        return ok, await db.location_history.count_documents({"user_id": "U1"})

    ok, n = asyncio.run(run())
    assert ok is False and n == 1


def test_far_point_is_recorded(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await fam.record_location_history("U1", 28.60, 77.20)
        ok = await fam.record_location_history("U1", 28.70, 77.30)  # ~14 km away
        return ok, await db.location_history.count_documents({"user_id": "U1"})

    ok, n = asyncio.run(run())
    assert ok is True and n == 2


def test_missing_coords_not_recorded(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        ok = await fam.record_location_history("U1", None, None)
        return ok, await db.location_history.count_documents({})

    ok, n = asyncio.run(run())
    assert ok is False and n == 0


def test_parse_iso_handles_z_and_bad_input():
    assert fam._parse_iso(None) is None
    assert fam._parse_iso("not-a-date") is None
    assert fam._parse_iso("2026-11-23T09:00:00Z") is not None
