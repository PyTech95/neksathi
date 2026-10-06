"""API liveness certification (iteration 12) — verify no 404/5xx via external URL."""
import os
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")

DEMO = {"email": "demo@neksathi.app", "password": "demo1234"}
ADMIN = {"email": "admin@safeqr.com", "password": "admin1234"}


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(client):
    r = client.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"demo login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token")
    assert isinstance(tok, str) and tok
    return tok


# ---------- PUBLIC ENDPOINTS ----------
class TestPublic:
    def test_root(self, client):
        r = client.get(f"{BASE_URL}/api/", timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_faqs(self, client):
        r = client.get(f"{BASE_URL}/api/faqs", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, list) and len(data) > 0

    def test_plans(self, client):
        r = client.get(f"{BASE_URL}/api/plans", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, list) and len(data) > 0


# ---------- AUTH ----------
class TestAuth:
    def test_demo_login(self, client):
        r = client.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=30)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("access_token")
        assert body.get("user", {}).get("email") == DEMO["email"]

    def test_admin_login(self, client):
        r = client.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("access_token")

    def test_bad_body_is_422_not_404(self, client):
        r = client.post(f"{BASE_URL}/api/auth/login", json={"foo": "bar"}, timeout=30)
        assert r.status_code == 422, f"expected 422 got {r.status_code}: {r.text[:300]}"

    def test_wrong_password_401(self, client):
        r = client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": DEMO["email"], "password": "wrongpass999"},
            timeout=30,
        )
        assert r.status_code in (400, 401, 429), f"got {r.status_code}: {r.text[:300]}"

    def test_me(self, client, demo_token):
        r = client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {demo_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("email") == DEMO["email"]


# ---------- AUTHENTICATED CORE READS ----------
AUTH_GETS = [
    "/api/me/sos-events",
    "/api/me/emergency-contacts",
    "/api/family",
    "/api/vehicles",
    "/api/tags",
    "/api/cards",
    "/api/alerts",
    "/api/incidents",
    "/api/subscriptions/me",
]


@pytest.mark.parametrize("path", AUTH_GETS)
def test_authenticated_reads(client, demo_token, path):
    r = client.get(f"{BASE_URL}{path}", headers={"Authorization": f"Bearer {demo_token}"}, timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:300]}"


# ---------- WRITE SMOKE ----------
class TestWrites:
    def test_sos_create(self, client, demo_token):
        h = {"Authorization": f"Bearer {demo_token}"}
        before = client.get(f"{BASE_URL}/api/me/sos-events", headers=h, timeout=30)
        assert before.status_code == 200
        n_before = len(before.json())

        r = client.post(
            f"{BASE_URL}/api/me/sos",
            json={"latitude": 19.07, "longitude": 72.87},
            headers=h,
            timeout=60,
        )
        assert r.status_code == 200, r.text[:400]

        after = client.get(f"{BASE_URL}/api/me/sos-events", headers=h, timeout=30)
        assert after.status_code == 200
        assert len(after.json()) == n_before + 1

    def test_location_update(self, client, demo_token):
        r = client.post(
            f"{BASE_URL}/api/me/location",
            json={"latitude": 19.08, "longitude": 72.88},
            headers={"Authorization": f"Bearer {demo_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]


# ---------- STABILITY ----------
def test_faqs_stability(client):
    codes = []
    for i in range(5):
        try:
            r = client.get(f"{BASE_URL}/api/faqs", timeout=30)
            codes.append(r.status_code)
        except Exception as exc:  # network drop
            codes.append(f"ERR:{exc}")
        if i < 4:
            time.sleep(7)
    print(f"FAQ stability codes: {codes}")
    assert all(c == 200 for c in codes), f"unstable: {codes}"
