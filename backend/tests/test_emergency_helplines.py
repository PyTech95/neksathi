"""Emergency helplines expanded from police+ambulance to also fire/women/child,
admin-configurable and backward compatible (an older client sending only
police+ambulance still works; unset numbers keep their defaults)."""
import asyncio

from mongomock_motor import AsyncMongoMockClient

from app.routers import safety as sf


def _db(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(sf, "db", db)
    return db


def test_defaults_include_all_five(monkeypatch):
    _db(monkeypatch)
    res = asyncio.run(sf.get_emergency_numbers())
    assert res == {"police": "112", "ambulance": "108", "fire": "101", "women": "1091", "child": "1098"}


def test_admin_can_set_new_helplines(monkeypatch):
    _db(monkeypatch)

    async def run():
        payload = sf.EmergencyNumbersIn(police="100", ambulance="102", fire="101", women="181", child="1098")
        await sf.set_emergency_numbers(payload=payload, user={"id": "ADMIN"})
        return await sf.get_emergency_numbers()

    res = asyncio.run(run())
    assert res["police"] == "100" and res["ambulance"] == "102" and res["women"] == "181"


def test_old_client_police_ambulance_only_keeps_defaults(monkeypatch):
    _db(monkeypatch)

    async def run():
        # Older admin app sends just police+ambulance; fire/women/child default in.
        payload = sf.EmergencyNumbersIn(police="100", ambulance="108")
        await sf.set_emergency_numbers(payload=payload, user={"id": "ADMIN"})
        return await sf.get_emergency_numbers()

    res = asyncio.run(run())
    assert res["police"] == "100"
    assert res["fire"] == "101" and res["women"] == "1091" and res["child"] == "1098"


def test_numbers_are_cleaned(monkeypatch):
    _db(monkeypatch)

    async def run():
        payload = sf.EmergencyNumbersIn(police="1-1-2", ambulance="108", fire="(101)")
        await sf.set_emergency_numbers(payload=payload, user={"id": "ADMIN"})
        return await sf.get_emergency_numbers()

    res = asyncio.run(run())
    assert res["police"] == "112" and res["fire"] == "101"
