"""Unit tests for SIM-removed / power-off / boot theft-event fan-out (pt 4).

The native receivers POST /devices/{id}/theft-event; this covers the backend
notification logic (owner + family + contacts) with mongomock + captured sends.
The Android receivers themselves are device-tested (can't run a JVM here)."""
import os

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("JWT_SECRET", "x")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")

import asyncio

from mongomock_motor import AsyncMongoMockClient

import app.routers.devices as dev


def _fresh(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(dev, "db", db)
    pushes, wa, sms = [], [], []

    async def fake_push(recipients, data, idempotency_key=None, **kw):
        pushes.append({"recipients": list(recipients), "data": data})

    async def fake_wa(phone, body, meta=None, **kw):
        wa.append(phone)

    async def fake_sms(phone, body, meta=None, **kw):
        sms.append(phone)

    monkeypatch.setattr(dev, "send_push", fake_push)
    monkeypatch.setattr(dev, "notify_whatsapp", fake_wa)
    monkeypatch.setattr(dev, "send_sms", fake_sms)
    monkeypatch.setattr(dev, "_prefs", lambda u: {"push": True})
    return db, pushes, wa, sms


async def _seed_family(db, owner="U1", others=("U2",)):
    await db.families.insert_one({"id": "f1", "guardian_id": owner, "name": "Fam"})
    await db.family_members.insert_one({"id": "m1", "family_id": "f1", "user_id": owner, "role": "guardian"})
    for i, u in enumerate(others, start=2):
        await db.family_members.insert_one({"id": f"m{i}", "family_id": "f1", "user_id": u, "role": "member"})
    await db.users.insert_one({"id": "U2", "name": "Sis", "phone": "+919812345678"})


def test_sim_removed_notifies_owner_family_and_contacts(monkeypatch):
    db, pushes, wa, sms = _fresh(monkeypatch)

    async def run():
        await _seed_family(db)
        await db.emergency_contacts.insert_one({"user_id": "U1", "phone": "+919900000000"})
        event = {"id": "e1", "user_id": "U1", "device_id": "d1", "type": "sim_removed",
                 "latitude": 28.6, "longitude": 77.2}
        await dev._theft_event_fanout({"id": "U1", "name": "Ravi"}, {"name": "Ravi's phone"}, event)

    asyncio.run(run())
    owner = [p for p in pushes if p["recipients"] == ["U1"]]
    fam = [p for p in pushes if p["recipients"] == ["U2"]]
    assert owner and owner[0]["data"]["type"] == "theft_event"
    assert "SIM removed" in owner[0]["data"]["title"]
    assert "maps.google.com" in owner[0]["data"]["message"]      # location included
    assert fam, "family circle should be pushed"
    assert "+919900000000" in sms and "+919812345678" in sms     # contact + family phone
    assert set(wa) == set(sms)                                   # same recipients on WhatsApp


def test_power_off_label_and_self_alert(monkeypatch):
    db, pushes, wa, sms = _fresh(monkeypatch)

    async def run():
        event = {"id": "e2", "user_id": "U1", "type": "power_off", "device_id": "d1"}
        await dev._theft_event_fanout({"id": "U1", "name": "Ravi"}, {"name": "phone"}, event)

    asyncio.run(run())
    owner = [p for p in pushes if p["recipients"] == ["U1"]]
    assert owner and "switched off" in owner[0]["data"]["title"].lower()


def test_no_family_still_alerts_owner(monkeypatch):
    db, pushes, wa, sms = _fresh(monkeypatch)

    async def run():
        event = {"id": "e3", "user_id": "U7", "type": "device_booted", "device_id": "d1"}
        await dev._theft_event_fanout({"id": "U7", "name": "Solo"}, {"name": "phone"}, event)

    asyncio.run(run())
    assert any(p["recipients"] == ["U7"] for p in pushes)       # owner alerted
    assert not any(p["recipients"] and p["recipients"] != ["U7"] for p in pushes)  # no family push


def test_unknown_type_falls_back(monkeypatch):
    db, pushes, wa, sms = _fresh(monkeypatch)

    async def run():
        event = {"id": "e4", "user_id": "U1", "type": "weird", "device_id": "d1"}
        await dev._theft_event_fanout({"id": "U1", "name": "Ravi"}, {"name": "phone"}, event)

    asyncio.run(run())
    owner = [p for p in pushes if p["recipients"] == ["U1"]]
    assert owner  # still notifies (falls back to the sim_removed label set)


# ----- NEW: family phone must SOUND a siren, not just show a notification -----

def _fresh_do(monkeypatch):
    """Like _fresh, but the fake push captures the data_only flag so we can assert
    the family alert is delivered as a wake-the-service data message."""
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(dev, "db", db)
    pushes = []

    async def fake_push(recipients, data, idempotency_key=None, data_only=False, **kw):
        pushes.append({"recipients": list(recipients), "data": data, "data_only": data_only})

    async def noop(*a, **k):
        return None

    monkeypatch.setattr(dev, "send_push", fake_push)
    monkeypatch.setattr(dev, "notify_whatsapp", noop)
    monkeypatch.setattr(dev, "send_sms", noop)
    monkeypatch.setattr(dev, "_prefs", lambda u: {"push": True})
    return db, pushes


def test_family_theft_alert_is_data_only_siren(monkeypatch):
    db, pushes = _fresh_do(monkeypatch)

    async def run():
        await _seed_family(db)
        event = {"id": "e5", "user_id": "U1", "type": "sim_removed", "device_id": "d1",
                 "latitude": 28.6, "longitude": 77.2}
        await dev._theft_event_fanout({"id": "U1", "name": "Ravi"}, {"name": "Ravi's phone"}, event)

    asyncio.run(run())
    fam = [p for p in pushes if p["recipients"] == ["U2"]]
    assert fam, "family circle should be pushed"
    # The family push must SOUND a siren: type theft_siren + data_only (so the
    # native CallMessagingService runs and plays SirenPlayer over the lock screen).
    assert fam[0]["data"]["type"] == "theft_siren"
    assert fam[0]["data_only"] is True
    assert fam[0]["data"]["location"] == "28.6,77.2"


def test_sim_removed_mirrors_to_sim_events_and_escalates(monkeypatch):
    db, pushes = _fresh_do(monkeypatch)

    async def run():
        await db.devices.insert_one({"id": "d1", "user_id": "U1", "name": "Pixel", "locked": False})
        await dev._escalate_sim_removed({"id": "U1"}, {"name": "Pixel"}, "d1", 28.6, 77.2)
        sim = [s async for s in db.sim_events.find({"user_id": "U1"})]
        d = await db.devices.find_one({"id": "d1"})
        return sim, d

    sim, d = asyncio.run(run())
    # Mirrored into the collection the UI reads, so "SIM change alerts" shows it.
    assert len(sim) == 1 and sim[0]["device_id"] == "d1" and sim[0]["latitude"] == 28.6
    # Escalated: phone locked + siren on, and a device_siren push was sent.
    assert d["locked"] is True and d["siren_active"] is True
    siren = [p for p in pushes if p["data"].get("type") == "device_siren"]
    assert siren and siren[0]["recipients"] == ["U1"] and siren[0]["data_only"] is True


def test_remote_siren_push_reaches_the_phone(monkeypatch):
    db, pushes = _fresh_do(monkeypatch)
    from app.schemas import SirenIn

    async def run():
        await db.devices.insert_one({"id": "d2", "user_id": "U1", "name": "Pixel", "siren_active": False})
        await dev.set_siren("d2", SirenIn(active=True), user={"id": "U1"})
        await dev.set_siren("d2", SirenIn(active=False), user={"id": "U1"})
        d = await db.devices.find_one({"id": "d2"})
        return d

    d = asyncio.run(run())
    assert d["siren_active"] is False  # last write wins
    on = [p for p in pushes if p["data"].get("type") == "device_siren"]
    off = [p for p in pushes if p["data"].get("type") == "device_siren_stop"]
    assert on and on[0]["data_only"] is True and on[0]["recipients"] == ["U1"]
    assert off and off[0]["data_only"] is True


def test_remote_lock_push_reaches_the_phone(monkeypatch):
    db, pushes = _fresh_do(monkeypatch)

    async def run():
        await db.devices.insert_one({"id": "d3", "user_id": "U1", "name": "Pixel", "locked": False})
        await dev.lock_device("d3", user={"id": "U1"})
        d = await db.devices.find_one({"id": "d3"})
        return d

    d = asyncio.run(run())
    assert d["locked"] is True
    lock = [p for p in pushes if p["data"].get("type") == "device_lock"]
    assert lock and lock[0]["data_only"] is True and lock[0]["recipients"] == ["U1"]
