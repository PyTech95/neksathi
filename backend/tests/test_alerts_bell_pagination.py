"""The notification bell pages through alerts 6 at a time (skip/limit) and shows
an unread badge via /alerts/count. These cover the paging maths + the since
filter so a user with a long feed never loads it all at once."""
import asyncio
from datetime import timedelta

from mongomock_motor import AsyncMongoMockClient

from app.routers import alerts as al
from app import utils as u
from app.utils import now_utc


def _db(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    # Both the router and _visible_vehicle_ids (in app.utils) resolve `db`.
    monkeypatch.setattr(al, "db", db)
    monkeypatch.setattr(u, "db", db)
    return db


async def _seed(db, n):
    base = now_utc()
    for i in range(n):
        await db.alerts.insert_one({
            "id": f"A{i}", "user_id": "U1", "number_plate": f"MH-{i:03d}",
            "type": "emergency", "created_at": base - timedelta(minutes=i),
        })
    return base


def test_alerts_paginate_6_at_a_time(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await _seed(db, 15)
        p1 = await al.list_alerts(user={"id": "U1"}, limit=6, skip=0)
        p2 = await al.list_alerts(user={"id": "U1"}, limit=6, skip=6)
        p3 = await al.list_alerts(user={"id": "U1"}, limit=6, skip=12)
        return p1, p2, p3

    p1, p2, p3 = asyncio.run(run())
    assert len(p1) == 6 and len(p2) == 6 and len(p3) == 3
    # newest first, and pages don't overlap
    assert p1[0].number_plate == "MH-000"
    ids = [a.id for a in (p1 + p2 + p3)]
    assert len(set(ids)) == 15


def test_alerts_limit_capped_and_floored(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await _seed(db, 3)
        # limit over the cap still works; skip below 0 is floored to 0
        big = await al.list_alerts(user={"id": "U1"}, limit=10000, skip=-5)
        return big

    res = asyncio.run(run())
    assert len(res) == 3


def test_alerts_count_total_and_unread(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        base = await _seed(db, 10)
        total = await al.alerts_count(user={"id": "U1"}, since=None)
        # "seen" cut at 4.5 minutes ago -> alerts 0..4 (5 of them) are newer
        cut = (base - timedelta(minutes=4, seconds=30)).isoformat()
        partial = await al.alerts_count(user={"id": "U1"}, since=cut)
        return total, partial

    total, partial = asyncio.run(run())
    assert total["total"] == 10 and total["unread"] == 10
    assert partial["total"] == 10 and partial["unread"] == 5


def test_alerts_count_bad_since_falls_back_to_total(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await _seed(db, 4)
        return await al.alerts_count(user={"id": "U1"}, since="not-a-date")

    res = asyncio.run(run())
    assert res["unread"] == 4
