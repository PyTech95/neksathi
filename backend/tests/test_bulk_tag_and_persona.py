"""Tests for bulk tag batch generation, tag claim/activation, and emergency broadcast."""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://qrscan-preview-1.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "admin@safeqr.com", "password": "admin1234"}
OWNER = {"email": "demo_web@safeqr.com", "password": "demo1234"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER)


@pytest.fixture(scope="module")
def tag_batch(admin_token):
    """Create a small tag batch with an org_name."""
    label = f"TEST_tag_{int(time.time())}"
    r = requests.post(
        f"{BASE}/api/admin/qr/generate-bulk",
        json={"count": 3, "batch_label": label, "product_type": "tag", "org_name": "TEST_School"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["count"] == 3
    assert "first_serial" in data and "last_serial" in data
    # Fetch inventory to get list of serials
    inv = requests.get(
        f"{BASE}/api/admin/qr/inventory?q={label[:0]}&limit=100",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    return {"label": label, "first": data["first_serial"], "last": data["last_serial"], "batch_id": data.get("batch_id")}


def test_generate_bulk_tag_batch(tag_batch):
    assert tag_batch["first"].startswith("NS-")


def test_public_claim_preview_returns_intended_type_and_org(tag_batch):
    r = requests.get(f"{BASE}/api/public/claim/{tag_batch['first']}", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["intended_type"] == "tag"
    assert d["org_name"] == "TEST_School"
    assert d["status"] in ("unclaimed", "sold")


def test_tag_claim_activation_with_guardian(tag_batch, owner_token):
    serial = tag_batch["first"]
    payload = {
        "serial_no": serial,
        "product_type": "tag",
        "payload": {
            "name": "TEST_Aarav",
            "tag_type": "kid",
            "blood_group": "O+",
            "medical_notes": "Peanut allergy",
            "guardian_name": "TEST_Parent",
            "guardian_phone": "+919000012345",
        },
    }
    r = requests.post(
        f"{BASE}/api/qr/claim",
        json=payload,
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["product_type"] == "tag"
    assert data.get("qr_id")
    # verify by re-fetching claim preview -> should show assigned
    r2 = requests.get(f"{BASE}/api/public/claim/{serial}", timeout=15)
    assert r2.status_code == 200
    assert r2.json()["status"] == "assigned"
    # store qr_id for next test
    pytest._tag_qr_id = data["qr_id"]
    pytest._tag_item_id = data["id"]


def test_public_tag_shows_guardian_flag_no_phone_leak():
    qr = getattr(pytest, "_tag_qr_id", None)
    assert qr, "requires prior claim test"
    r = requests.get(f"{BASE}/api/public/tag/{qr}", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["tag_type"] == "kid"
    assert d["has_guardian"] is True
    assert d.get("blood_group") == "O+"
    # phone MUST never leak in public payload
    assert "guardian_phone" not in d or d.get("guardian_phone") is None
    body_str = r.text
    assert "9000012345" not in body_str


def test_emergency_kid_help_broadcast():
    qr = getattr(pytest, "_tag_qr_id", None)
    assert qr
    r = requests.post(
        f"{BASE}/api/public/tag/{qr}/alert",
        json={"type": "kid_help", "lat": 18.5, "lng": 73.8, "message": "TEST emergency"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True or d.get("status") in ("sent", "queued", "ok")


def test_invalid_persona_route_returns_frontend_landing():
    # Frontend handles routing — hitting the API side should not matter, but verify frontend renders 200
    r = requests.get(f"{BASE}/for/xyz", timeout=15)
    assert r.status_code == 200  # SPA returns index.html for any route


# Cleanup: delete the created tag item after tests
def test_cleanup_tag(owner_token):
    tid = getattr(pytest, "_tag_item_id", None)
    if not tid:
        pytest.skip("no tag created")
    r = requests.delete(
        f"{BASE}/api/tags/{tid}",
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=15,
    )
    # 200/204 acceptable; 404 also fine if already gone
    assert r.status_code in (200, 204, 404)
