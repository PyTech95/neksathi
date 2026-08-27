"""Full regression (iteration 7) - core APIs backing every page in the web app."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/") + "/api"

DEMO = ("demo@neksathi.app", "demo1234")
ADMIN = ("admin@safeqr.com", "admin1234")


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login {email} -> {r.status_code} {r.text[:300]}")
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r.json()["user"]


@pytest.fixture(scope="session")
def demo():
    return _login(*DEMO)


@pytest.fixture(scope="session")
def admin():
    return _login(*ADMIN)


# ---------- auth ----------
class TestAuth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/", timeout=30)
        assert r.status_code == 200

    def test_demo_login_non_admin(self, demo):
        _, u = demo
        assert u["email"] == DEMO[0]
        assert u["is_admin"] is False

    def test_admin_login_is_admin(self, admin):
        _, u = admin
        assert u["is_admin"] is True

    def test_me_persists(self, demo):
        s, u = demo
        r = s.get(f"{BASE_URL}/auth/me", timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == u["id"]

    def test_bad_password_rejected(self):
        r = requests.post(f"{BASE_URL}/auth/login", json={"email": DEMO[0], "password": "wrong-pass-xyz"}, timeout=30)
        assert r.status_code in (400, 401, 429), r.text[:200]

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/auth/me", timeout=30)
        assert r.status_code in (401, 403)

    def test_profile_edit_roundtrip(self, demo):
        s, u = demo
        orig = u["name"]
        r = s.put(f"{BASE_URL}/auth/me", json={"name": "TEST_Demo Rename"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Demo Rename"
        assert s.get(f"{BASE_URL}/auth/me", timeout=30).json()["name"] == "TEST_Demo Rename"
        assert s.put(f"{BASE_URL}/auth/me", json={"name": orig}, timeout=30).status_code == 200


# ---------- core page data endpoints ----------
PAGE_ENDPOINTS = [
    ("/vehicles", "dashboard"),
    ("/tags", "tags"),
    ("/cards", "cards"),
    ("/family", "family"),
    ("/family/active-sos", "family/global alarm"),
    ("/family/nudge-state", "global alarm"),
    ("/family/check-ins", "family"),
    ("/family/alert-rules", "family"),
    ("/family/zones", "family"),
    ("/me/safe-zones", "safe-zones"),
    ("/me/geofence-events", "safe-zones"),
    ("/alerts", "alerts"),
    ("/circles/temp", "circles"),
    ("/community", "community"),
    ("/plans", "subscription"),
    ("/subscriptions/me", "subscription"),
    ("/devices", "theft-protection"),
    ("/intruder-events", "theft-protection"),
    ("/sim-events", "theft-protection"),
    ("/me/emergency-contacts", "safety"),
    ("/me/sos-events", "safety"),
    ("/me/live-shares", "safety"),
    ("/me/audio-evidence", "safety"),
    ("/user/sos-videos", "safety"),
    ("/summary", "dashboard"),
    ("/blackspots", "map"),
    ("/faqs", "support"),
    ("/support/tickets/me", "support"),
]


@pytest.mark.parametrize("path,page", PAGE_ENDPOINTS)
def test_page_endpoint_ok(demo, path, page):
    s, _ = demo
    r = s.get(f"{BASE_URL}{path}", timeout=45)
    assert r.status_code == 200, f"{page} {path} -> {r.status_code} {r.text[:250]}"
    body = r.json()
    # No raw mongo _id must leak
    assert "_id" not in str(body)[:200000].replace('"_id"', "MONGOID") or True
    assert '"_id"' not in str(body), f"{path} leaks mongo _id"


def test_incidents_endpoint(demo):
    """Incidents page uses /alerts (incidents feed)."""
    s, _ = demo
    r = s.get(f"{BASE_URL}/alerts", timeout=45)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_stats(admin):
    s, _ = admin
    r = s.get(f"{BASE_URL}/admin/stats", timeout=45)
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


def test_admin_endpoint_forbidden_for_demo(demo):
    s, _ = demo
    r = s.get(f"{BASE_URL}/admin/stats", timeout=30)
    assert r.status_code in (401, 403), f"non-admin reached admin stats: {r.status_code}"


# ---------- SOS single-fire / ack ----------
class TestSos:
    def test_sos_creates_exactly_one_event_and_ack(self, demo):
        s, _ = demo
        contacts = s.get(f"{BASE_URL}/me/emergency-contacts", timeout=30).json()
        assert len(contacts) > 0, "demo account has no emergency contacts - SOS cannot fire"
        before = s.get(f"{BASE_URL}/me/sos-events", timeout=30).json()
        r = s.post(f"{BASE_URL}/me/sos", json={"latitude": 28.6139, "longitude": 77.209, "photo_base64": None}, timeout=60)
        assert r.status_code == 200, r.text[:300]
        ev = r.json()
        assert "id" in ev
        after = s.get(f"{BASE_URL}/me/sos-events", timeout=30).json()
        assert len(after) == len(before) + 1, f"expected +1 event, got {len(before)}->{len(after)}"
        assert any(e["id"] == ev["id"] for e in after)
        ack = s.post(f"{BASE_URL}/me/sos-events/{ev['id']}/ack", timeout=30)
        assert ack.status_code == 200, ack.text[:200]
        acked = [e for e in s.get(f"{BASE_URL}/me/sos-events", timeout=30).json() if e["id"] == ev["id"]][0]
        assert acked.get("acked") is True or acked.get("acknowledged") is True, acked


# ---------- OTP live mode ----------
def test_otp_request_live_no_dev_code():
    r = requests.post(f"{BASE_URL}/auth/otp/request", json={"phone": "+919999000011"}, timeout=45)
    assert r.status_code in (200, 429), r.text[:300]
    if r.status_code == 200:
        assert r.json().get("dev_code") in (None, ""), "dev_code leaked in LIVE mode"


# ---------- security / playbook checks ----------
def test_bcrypt_hash_format():
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    env = dotenv_values("/app/backend/.env")
    url, dbn = env.get("MONGO_URL"), env.get("DB_NAME")
    assert url and dbn

    async def go():
        c = AsyncIOMotorClient(url)
        u = await c[dbn]["users"].find_one({"email": DEMO[0]})
        c.close()
        return u

    u = asyncio.get_event_loop().run_until_complete(go())
    assert u, "demo user not seeded"
    h = u.get("password_hash") or u.get("hashed_password") or ""
    assert re.match(r"^\$2[aby]\$", h), f"unexpected hash prefix: {h[:8]}"


def test_cors_headers_present():
    r = requests.options(
        f"{BASE_URL}/auth/login",
        headers={"Origin": base_url.rstrip("/"), "Access-Control-Request-Method": "POST"},
        timeout=30,
    )
    assert r.status_code in (200, 204), r.status_code
    assert "access-control-allow-origin" in {k.lower() for k in r.headers}
