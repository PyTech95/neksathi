from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
import uuid
from typing import List
from app.db import db
from app.schemas import PlanOut


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def clean(doc: dict) -> dict:
    """Return a copy of a Mongo document with ``_id`` removed."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


_PLAN_GRACE_DAYS = 3


def _veh_plan_state(v: dict):
    """(status, days_left, expires_at) for a vehicle's QR plan."""
    exp = v.get("plan_expires_at")
    if exp is None:
        return ("none", 0, None)
    if getattr(exp, "tzinfo", None) is None:
        exp = exp.replace(tzinfo=timezone.utc)
    now = now_utc()
    secs = (exp - now).total_seconds()
    if secs >= 0:
        import math as _m
        return ("active", max(0, _m.ceil(secs / 86400)), exp)
    if (exp + timedelta(days=_PLAN_GRACE_DAYS) - now).total_seconds() >= 0:
        return ("grace", 0, exp)
    return ("expired", 0, exp)


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


async def _visible_vehicle_ids(user_id: str) -> List[str]:
    """Return all vehicle IDs the user can see — their own + those shared
    with them via an accepted family invite."""
    own = [v["id"] async for v in db.vehicles.find({"owner_id": user_id}, {"id": 1})]
    shared = [
        s["vehicle_id"]
        async for s in db.vehicle_shares.find(
            {"shared_with_user_id": user_id, "status": "accepted"},
            {"vehicle_id": 1},
        )
    ]
    # Family circle: every vehicle owned by anyone in my circle. Family members
    # get the incident alert / ring for these, so they must be able to open the
    # incident and respond ("I am coming", resolve) — not land on an empty list.
    fam: list = []
    fm = await db.family_members.find_one({"user_id": user_id})
    if fm:
        members = [m["user_id"] async for m in db.family_members.find({"family_id": fm["family_id"]}) if m.get("user_id")]
        if members:
            fam = [v["id"] async for v in db.vehicles.find({"owner_id": {"$in": members}}, {"id": 1})]
    return list({*own, *shared, *fam})


def plan_out(p: dict) -> PlanOut:
    return PlanOut(
        id=p["id"],
        code=p["code"],
        name=p["name"],
        description=p.get("description"),
        price_cents=p["price_cents"],
        currency=p.get("currency", "INR"),
        interval=p.get("interval", "month"),
        validity_days=int(p.get("validity_days") or (365 if p.get("interval") == "year" else 30)),
        vehicle_limit=p.get("vehicle_limit", 1),
        features=p.get("features", []),
        active=bool(p.get("active", True)),
        popular=bool(p.get("popular", False)),
    )
