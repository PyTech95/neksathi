"""Wallet view: token balance, its rupee value, and paginated earn/spend history
(newest first)."""
import asyncio
from datetime import timedelta

from mongomock_motor import AsyncMongoMockClient

from app.routers import commerce as cm
from app.utils import now_utc


def _db(monkeypatch):
    db = AsyncMongoMockClient()["test"]
    monkeypatch.setattr(cm, "db", db)
    return db


def test_wallet_balance_and_value(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await db.users.insert_one({"id": "U1", "tokens": 150})
        return await cm.my_wallet(user={"id": "U1"}, skip=0, limit=20)

    res = asyncio.run(run())
    assert res["tokens"] == 150
    assert res["value_rupees"] == 15.0   # 10 tokens = Rs 1
    assert res["tokens_per_rupee"] == 10
    assert res["total"] == 0 and res["history"] == []


def test_wallet_history_newest_first_and_paginates(monkeypatch):
    db = _db(monkeypatch)

    async def run():
        await db.users.insert_one({"id": "U1", "tokens": 50})
        base = now_utc()
        for i in range(25):
            await db.token_ledger.insert_one({
                "id": f"L{i}", "user_id": "U1", "delta": (10 if i % 2 == 0 else -5),
                "reason": "referral_bonus_referred" if i % 2 == 0 else "redeemed_discount",
                "created_at": base - timedelta(minutes=i),
            })
        # someone else's ledger must not leak in
        await db.token_ledger.insert_one({"id": "X", "user_id": "U2", "delta": 99, "reason": "x", "created_at": base})
        p1 = await cm.my_wallet(user={"id": "U1"}, skip=0, limit=20)
        p2 = await cm.my_wallet(user={"id": "U1"}, skip=20, limit=20)
        return p1, p2

    p1, p2 = asyncio.run(run())
    assert p1["total"] == 25 and p1["count"] == 20 and p2["count"] == 5
    # newest first (L0 is most recent)
    assert p1["history"][0]["id"] == "L0"
    assert p1["history"][0]["delta"] == 10
