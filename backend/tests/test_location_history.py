"""Family location trail: each /me/status or /me/location feeds a throttled
history (at most one point per 30 min), which the member-history endpoint reads
back, a page at a time, as the day's '9:00 here, 9:30 there' timeline."""
import asyncio
from datetime import timedelta

from mongomock_motor import AsyncMongoMockClient

from app.routers import family as fam
from app.utils import now_utc


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


def test_far_point_soon_is_throttled(monkeypatch):
    # New behaviour: trail is time-sampled every 30 min, so even a far jump within
    # 30 min is dropped — keeps the day to a handful of points, not a flood.
    db = _db(monkeypatch)

    async def run():
        await fam.record_location_history("U1", 28.60, 77.20)
        ok = await fam.record_location_history("U1", 28.70, 77.30)  # ~14 km, right away
        return ok, await db.location_history.count_documents({"user_id": "U1"})

    ok, n = asyncio.run(run())
    assert ok is False and n == 1


def test_point_after_30_min_is_recorded(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        # Seed a last point 31 minutes ago, then a new ping should be stored.
        await db.location_history.insert_one({
            "id": "P0", "user_id": "U1", "latitude": 28.60, "longitude": 77.20,
            "recorded_at": now_utc() - timedelta(minutes=31),
        })
        ok = await fam.record_location_history("U1", 28.6001, 77.2001)  # barely moved, but 31 min later
        return ok, await db.location_history.count_documents({"user_id": "U1"})

    ok, n = asyncio.run(run())
    assert ok is True and n == 2


def test_member_history_pagination(monkeypatch):
    # The timeline is served a page at a time (default 4) with a total, so the app
    # shows a few points and a "Next" button instead of a whole day at once.
    db = _db(monkeypatch)

    async def run():
        await db.families.insert_one({"id": "F1", "guardian_id": "VIEW"})
        await db.family_members.insert_one({"user_id": "VIEW", "family_id": "F1"})
        await db.family_members.insert_one({"id": "M1", "user_id": "T1", "family_id": "F1", "share_location": True, "name": "Target"})
        base = now_utc() - timedelta(hours=6)
        for i in range(10):
            await db.location_history.insert_one({
                "id": f"P{i}", "user_id": "T1", "latitude": 28.6 + i * 0.01, "longitude": 77.2,
                "recorded_at": base + timedelta(minutes=30 * i),
            })
        page1 = await fam.member_history("M1", skip=0, limit=4, user={"id": "VIEW"})
        page2 = await fam.member_history("M1", skip=4, limit=4, user={"id": "VIEW"})
        return page1, page2

    p1, p2 = asyncio.run(run())
    assert p1["shared"] is True and p1["total"] == 10 and len(p1["points"]) == 4
    assert len(p2["points"]) == 4 and p2["skip"] == 4
    # ascending by time — first page starts earliest
    assert p1["points"][0]["at"] <= p1["points"][1]["at"]


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
