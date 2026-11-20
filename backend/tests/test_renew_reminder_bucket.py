"""Renewal-reminder milestone bucketing: owners get at most one reminder per
milestone (~15d, ~7d, ~1d before expiry, and on expiry), deduped on the item's
`renew_reminded` field, which renewal clears so the next cycle reminds again."""
from app.services.background import _renew_bucket


def test_too_early_no_reminder():
    assert _renew_bucket(40) is None
    assert _renew_bucket(16) is None


def test_fifteen_day_window():
    assert _renew_bucket(15) == "d15"
    assert _renew_bucket(8) == "d15"


def test_seven_day_window():
    assert _renew_bucket(7) == "d7"
    assert _renew_bucket(2) == "d7"


def test_one_day_window():
    assert _renew_bucket(1) == "d1"


def test_expired_window():
    assert _renew_bucket(0) == "expired"
    assert _renew_bucket(-5) == "expired"


def test_each_milestone_is_distinct():
    # Four distinct buckets so dedup fires each reminder exactly once per cycle.
    buckets = {_renew_bucket(15), _renew_bucket(7), _renew_bucket(1), _renew_bucket(0)}
    assert buckets == {"d15", "d7", "d1", "expired"}
