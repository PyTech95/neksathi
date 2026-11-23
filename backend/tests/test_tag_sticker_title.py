"""Per-type tag sticker headline: a scanned/printed tag should say what it's for
(emergency vs lost-and-found vs door) instead of every tag looking identical."""
from app.routers.commerce import _tag_sticker_title


def test_person_types_say_emergency():
    for t in ["person", "kid", "patient"]:
        assert _tag_sticker_title(t) == "IN CASE OF EMERGENCY"


def test_item_types_say_if_found():
    for t in ["bag", "luggage", "keys", "phone", "laptop", "other"]:
        assert "FOUND" in _tag_sticker_title(t)


def test_special_types():
    assert _tag_sticker_title("pet").startswith("LOST PET")
    assert _tag_sticker_title("staff") == "STAFF ID"
    assert _tag_sticker_title("door") == "SMART DOOR"


def test_unknown_falls_back():
    assert _tag_sticker_title(None) == "SAFETY QR TAG"
    assert _tag_sticker_title("zzz") == "SAFETY QR TAG"


def test_sticker_renders_with_long_title():
    # The header auto-fits, so a long per-type headline must still produce a PNG.
    from app.services import sticker
    png = sticker.render_sticker("https://x/t/abc123", "024652", title="LOST PET — PLEASE HELP")
    assert png[:4] == b"\x89PNG" and len(png) > 1000
