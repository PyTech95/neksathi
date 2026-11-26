"""My Story merges the user's SOS photos, audio evidence and SOS videos into one
newest-first timeline, with a media URL per item and no media bytes."""
import asyncio
from datetime import timedelta

from mongomock_motor import AsyncMongoMockClient

from app.routers import safety as sf
from app.utils import now_utc


def _db(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(sf, "db", db)
    return db


def test_story_merges_and_orders(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        base = now_utc()
        await db.sos_events.insert_one({"id": "S1", "user_id": "U1", "created_at": base - timedelta(minutes=1),
                                        "photo_base64": "data:image/jpeg;base64,abc", "latitude": 1.0, "longitude": 2.0})
        await db.sos_events.insert_one({"id": "S2", "user_id": "U1", "created_at": base - timedelta(minutes=9)})  # no photo
        await db.audio_evidence.insert_one({"id": "A1", "user_id": "U1", "created_at": base - timedelta(minutes=3), "audio_base64": "xxx", "duration_ms": 4000})
        await db.sos_videos.insert_one({"id": "V1", "user_id": "U1", "created_at": base - timedelta(minutes=5), "video_base64": "yyy"})
        # another user's media must not appear
        await db.sos_events.insert_one({"id": "SX", "user_id": "U2", "created_at": base, "photo_base64": "zz"})
        return await sf.my_story(user={"id": "U1"}, limit=40)

    res = asyncio.run(run())
    items = res["items"]
    assert res["total"] == 4 and len(items) == 4
    # newest-first: S1 (1m), A1 (3m), V1 (5m), S2 (9m)
    assert [i["id"] for i in items] == ["S1", "A1", "V1", "S2"]
    # media URLs + no raw bytes leaked
    s1 = items[0]
    assert s1["kind"] == "sos" and s1["has_photo"] is True
    assert s1["media_url"] == "/me/sos-events/S1/photo"
    assert "photo_base64" not in s1 and "audio_base64" not in str(items)
    # an SOS with no photo carries no media URL
    s2 = items[3]
    assert s2["has_photo"] is False and s2["media_url"] is None
    # audio + video URLs
    assert next(i for i in items if i["kind"] == "audio")["media_url"] == "/me/audio-evidence/A1/play"
    assert next(i for i in items if i["kind"] == "video")["media_url"] == "/sos-video/V1"


def test_story_empty(monkeypatch):
    _db(monkeypatch)
    res = asyncio.run(sf.my_story(user={"id": "NOBODY"}, limit=40))
    assert res["total"] == 0 and res["items"] == []
