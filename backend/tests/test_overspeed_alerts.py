"""Unit tests for over-speed alerting (pt 13): a real over-limit event must
notify BOTH the driver/owner and the family circle, throttled per stretch.

Runs against mongomock (no real Mongo, no live server). We swap the router's
module-level `db` for a mongomock db and capture send_push calls."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "x")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")

import asyncio

from mongomock_motor import AsyncMongoMockClient

import app.routers.family as fam


def _fresh(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(fam, "db", db)
    calls = []

    async def fake_push(recipients, data, idempotency_key=None, **kw):
        calls.append({"recipients": list(recipients), "data": data, "key": idempotency_key})

    monkeypatch.setattr(fam, "send_push", fake_push)
    return db, calls


async def _seed_vehicle(db, owner="U1", limit=80):
    await db.vehicles.insert_one({
        "id": "v1", "owner_id": owner, "number_plate": "UP32AB1234",
        "speed_limit_kmh": limit, "created_at": 1,
    })


async def _seed_location(db, owner="U1"):
    # /me/status + /me/location upsert this before calling the helper.
    await db.user_locations.update_one({"user_id": owner}, {"$set": {"user_id": owner}}, upsert=True)


async def _seed_family(db, owner="U1", others=("U2", "U3")):
    await db.families.insert_one({"id": "f1", "guardian_id": owner, "name": "Fam"})
    await db.family_members.insert_one({"id": "m1", "family_id": "f1", "user_id": owner, "role": "guardian"})
    for i, u in enumerate(others, start=2):
        await db.family_members.insert_one({"id": f"m{i}", "family_id": "f1", "user_id": u, "role": "member"})


def test_overspeed_notifies_owner_and_family(monkeypatch):
    db, calls = _fresh(monkeypatch)

    async def run():
        await _seed_vehicle(db, limit=80)
        await _seed_location(db)
        await _seed_family(db, owner="U1", others=("U2", "U3"))
        await fam._maybe_overspeed_family_alert({"id": "U1", "name": "Ravi"}, 95.0)

    asyncio.run(run())
    assert len(calls) == 2
    self_push = [c for c in calls if c["recipients"] == ["U1"]]
    fam_push = [c for c in calls if set(c["recipients"]) == {"U2", "U3"}]
    assert self_push and self_push[0]["data"]["type"] == "overspeed_self"
    assert fam_push and fam_push[0]["data"]["type"] == "overspeed"
    assert "95" in fam_push[0]["data"]["message"]
    assert "UP32AB1234" in fam_push[0]["data"]["message"]


def test_overspeed_throttled_then_rearms_on_drop(monkeypatch):
    db, calls = _fresh(monkeypatch)

    async def run():
        await _seed_vehicle(db, limit=80)
        await _seed_location(db)
        await _seed_family(db)
        await fam._maybe_overspeed_family_alert({"id": "U1", "name": "Ravi"}, 95.0)   # fires (2)
        n1 = len(calls)
        await fam._maybe_overspeed_family_alert({"id": "U1", "name": "Ravi"}, 100.0)  # throttled
        n2 = len(calls)
        await fam._maybe_overspeed_family_alert({"id": "U1", "name": "Ravi"}, 60.0)   # under → re-arm
        await fam._maybe_overspeed_family_alert({"id": "U1", "name": "Ravi"}, 90.0)   # fires again (4)
        return n1, n2, len(calls)

    n1, n2, n3 = asyncio.run(run())
    assert n1 == 2
    assert n2 == 2       # no duplicate alert while still over-limit
    assert n3 == 4       # drop below + cross again → alerts fire anew


def test_owner_alerted_even_without_family(monkeypatch):
    db, calls = _fresh(monkeypatch)

    async def run():
        await _seed_vehicle(db, owner="U9", limit=80)
        await _seed_location(db, owner="U9")
        await fam._maybe_overspeed_family_alert({"id": "U9", "name": "Solo"}, 120.0)

    asyncio.run(run())
    assert len(calls) == 1
    assert calls[0]["recipients"] == ["U9"]
    assert calls[0]["data"]["type"] == "overspeed_self"


def test_no_vehicle_no_alert(monkeypatch):
    db, calls = _fresh(monkeypatch)
    asyncio.run(fam._maybe_overspeed_family_alert({"id": "U1"}, 200.0))
    assert calls == []


def test_under_limit_no_alert(monkeypatch):
    db, calls = _fresh(monkeypatch)

    async def run():
        await _seed_vehicle(db, limit=80)
        await _seed_location(db)
        await fam._maybe_overspeed_family_alert({"id": "U1"}, 70.0)

    asyncio.run(run())
    assert calls == []


def test_none_speed_no_alert(monkeypatch):
    db, calls = _fresh(monkeypatch)
    asyncio.run(fam._maybe_overspeed_family_alert({"id": "U1"}, None))
    assert calls == []
