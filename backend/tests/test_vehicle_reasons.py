"""Per-vehicle-type scan reasons: the new reasons (keys_left / bike_fallen /
load_problem, used for bikes, tractors and trucks) must be accepted by the
incident schema, carry owner notification text, and not start the 15-min window."""
import pytest
from pydantic import ValidationError

from app.schemas.incidents import IncidentCreateIn
from app.routers.incidents import INCIDENT_TITLES, _incident_body, WINDOW_TYPES

NEW = ["keys_left", "bike_fallen", "load_problem"]


def test_schema_accepts_new_reasons():
    for t in NEW:
        assert IncidentCreateIn(type=t).type == t


def test_schema_still_rejects_unknown_reason():
    with pytest.raises(ValidationError):
        IncidentCreateIn(type="not_a_real_reason")


def test_titles_and_body_cover_new_reasons():
    for t in NEW:
        assert INCIDENT_TITLES.get(t)
        body = _incident_body(t, "HR26X1234")
        assert "HR26X1234" in body and len(body) > 20


def test_new_reasons_do_not_start_the_window():
    # Only wrong_parking / vehicle_blocking run the 15-minute "please move" window.
    for t in NEW:
        assert t not in WINDOW_TYPES
