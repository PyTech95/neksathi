"""Subscription expiry gate for the public QR flow: an expired (past-grace) plan
pauses alerts/calls until the owner renews. Importing the public routers here
also proves the new cross-module import adds no circular import."""
from datetime import timedelta

from app.utils import now_utc
from app.routers.commerce import plan_blocked, plan_state, GRACE_DAYS
from app.routers import incidents, scan_public, calls  # noqa: F401  (import-cycle check)


def _item(days_to_expiry: int) -> dict:
    """A vehicle/tag whose plan expires in `days_to_expiry` days (negative = past)."""
    return {"plan_name": "Yearly", "plan_expires_at": now_utc() + timedelta(days=days_to_expiry)}


def test_active_plan_is_allowed():
    d = _item(30)
    assert plan_state(d)["status"] == "active"
    assert plan_blocked(d) is None


def test_grace_period_is_allowed():
    # Expired yesterday but still inside the grace window.
    d = _item(-1)
    assert GRACE_DAYS >= 1
    assert plan_state(d)["status"] == "grace"
    assert plan_blocked(d) is None


def test_expired_past_grace_is_blocked():
    d = _item(-(GRACE_DAYS + 5))
    assert plan_state(d)["status"] == "expired"
    msg = plan_blocked(d)
    assert msg and "expired" in msg.lower() and "renew" in msg.lower()


def test_item_with_no_plan_is_not_blocked():
    # Never on a paid plan (demo/free) — don't break it.
    assert plan_state({})["status"] == "none"
    assert plan_blocked({}) is None
