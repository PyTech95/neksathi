"""Unit tests for attaching a front-camera photo to an already-sent SOS
(volume-button SOS: alert+location go first, the photo is attached after)."""
import asyncio

from mongomock_motor import AsyncMongoMockClient

from app.routers import safety as saf


def _fresh(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(saf, "db", db)
    return db


def test_attach_photo_sets_has_photo(monkeypatch):
    db = _fresh(monkeypatch)

    async def run():
        await db.sos_events.insert_one({"id": "s1", "user_id": "U1", "has_photo": False})
        ok = await saf._attach_sos_photo("U1", "s1", "data:image/jpeg;base64,AAAA")
        ev = await db.sos_events.find_one({"id": "s1"})
        return ok, ev

    ok, ev = asyncio.run(run())
    assert ok is True
    assert ev["has_photo"] is True
    assert ev["photo_base64"] == "data:image/jpeg;base64,AAAA"


def test_attach_photo_wrong_user_is_rejected(monkeypatch):
    db = _fresh(monkeypatch)

    async def run():
        await db.sos_events.insert_one({"id": "s2", "user_id": "U1", "has_photo": False})
        # A different user must never attach a photo to someone else's SOS.
        ok = await saf._attach_sos_photo("U2", "s2", "data:image/jpeg;base64,AAAA")
        ev = await db.sos_events.find_one({"id": "s2"})
        return ok, ev

    ok, ev = asyncio.run(run())
    assert ok is False
    assert ev.get("photo_base64") is None  # untouched


def test_attach_photo_missing_event(monkeypatch):
    _fresh(monkeypatch)

    async def run():
        return await saf._attach_sos_photo("U1", "nope", "data:image/jpeg;base64,AAAA")

    assert asyncio.run(run()) is False
