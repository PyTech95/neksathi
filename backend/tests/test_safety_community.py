"""
Tests for iteration 13:
- Safe Link Checker (#9) — unconfigured VirusTotal
- Nearby Police Stations (#7) — Overpass proxy
- Community Safety Group (#26) — full CRUD
- Regression: SOS, emergency contacts, live-share, OTP request
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://qrscan-preview-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo_web@safeqr.com"
DEMO_PW = "demo1234"


@pytest.fixture(scope="session")
def demo_token():
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture(scope="session")
def second_user_headers():
    # create ephemeral second user for cross-user tests
    email = f"TEST_c_{uuid.uuid4().hex[:8]}@safeqr.com"
    pw = "Passw0rd!"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": pw, "name": "TEST User", "phone": f"+9199{uuid.uuid4().int % 100000000:08d}"}, timeout=20)
    if r.status_code not in (200, 201):
        # Try login path in case register isn't the exact route
        pytest.skip(f"register failed: {r.status_code} {r.text[:120]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        # fallback login
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
        tok = r2.json().get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}, email


# -------- Safe Link Checker --------
class TestLinkChecker:
    def test_link_check_unconfigured(self, demo_headers):
        r = requests.post(f"{API}/safety/link-check", json={"url": "https://example.com"}, headers=demo_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("configured") is False
        assert "message" in data and isinstance(data["message"], str)

    def test_link_check_requires_auth(self):
        r = requests.post(f"{API}/safety/link-check", json={"url": "https://example.com"}, timeout=20)
        assert r.status_code in (401, 403)

    def test_link_check_input_validation(self, demo_headers):
        r = requests.post(f"{API}/safety/link-check", json={"url": "ab"}, headers=demo_headers, timeout=20)
        assert r.status_code in (400, 422)


# -------- Nearby Police --------
class TestNearbyPolice:
    def test_nearby_delhi(self, demo_headers):
        r = requests.get(f"{API}/safety/nearby-police",
                         params={"lat": 28.6139, "lng": 77.2090, "radius": 8000},
                         headers=demo_headers, timeout=60)
        # Overpass mirrors can be flaky; a 502 is env, not code bug — but log it.
        if r.status_code == 502:
            pytest.xfail("All Overpass mirrors unavailable — env flakiness")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "count" in data and "stations" in data
        assert isinstance(data["stations"], list)
        if data["count"] > 0:
            s0 = data["stations"][0]
            for k in ("name", "latitude", "longitude", "distance_km"):
                assert k in s0
            # sorted by distance
            dists = [s["distance_km"] for s in data["stations"]]
            assert dists == sorted(dists)

    def test_nearby_ocean(self, demo_headers):
        r = requests.get(f"{API}/safety/nearby-police",
                         params={"lat": 0, "lng": 0, "radius": 8000},
                         headers=demo_headers, timeout=60)
        if r.status_code == 502:
            pytest.xfail("Overpass mirrors unavailable")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("count") == 0
        assert data.get("stations") == []


# -------- Community Group --------
class TestCommunity:
    def test_full_flow(self, demo_headers):
        # overview
        r = requests.get(f"{API}/community", headers=demo_headers, timeout=20)
        assert r.status_code == 200, r.text
        ov = r.json()
        for k in ("member_count", "cap", "is_member", "posts"):
            assert k in ov
        assert ov["cap"] == 100

        # join (idempotent)
        r = requests.post(f"{API}/community/join", headers=demo_headers, timeout=20)
        assert r.status_code == 200 and r.json().get("joined") is True

        r = requests.get(f"{API}/community", headers=demo_headers, timeout=20)
        assert r.json()["is_member"] is True

        # post
        text = f"TEST_post {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/community/posts", json={"text": text}, headers=demo_headers, timeout=20)
        assert r.status_code == 200, r.text
        post = r.json()
        pid = post["id"]
        assert post["text"] == text
        assert post["like_count"] == 0
        assert post["mine"] is True

        # like
        r = requests.post(f"{API}/community/posts/{pid}/like", headers=demo_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["like_count"] == 1
        assert r.json()["liked_by_me"] is True
        # unlike
        r = requests.post(f"{API}/community/posts/{pid}/like", headers=demo_headers, timeout=20)
        assert r.json()["like_count"] == 0
        assert r.json()["liked_by_me"] is False

        # delete
        r = requests.delete(f"{API}/community/posts/{pid}", headers=demo_headers, timeout=20)
        assert r.status_code == 200 and r.json().get("deleted") is True

    def test_post_requires_membership(self, second_user_headers):
        headers, _email = second_user_headers
        # ensure NOT member
        requests.post(f"{API}/community/leave", headers=headers, timeout=20)
        r = requests.post(f"{API}/community/posts", json={"text": "TEST no-member"}, headers=headers, timeout=20)
        assert r.status_code == 403

    def test_delete_others_post_forbidden(self, demo_headers, second_user_headers):
        headers2, _email = second_user_headers
        # ensure demo is member and creates a post
        requests.post(f"{API}/community/join", headers=demo_headers, timeout=20)
        r = requests.post(f"{API}/community/posts", json={"text": "TEST cross-user"}, headers=demo_headers, timeout=20)
        assert r.status_code == 200
        pid = r.json()["id"]
        # user2 joins and tries to delete
        requests.post(f"{API}/community/join", headers=headers2, timeout=20)
        r = requests.delete(f"{API}/community/posts/{pid}", headers=headers2, timeout=20)
        assert r.status_code == 403
        # cleanup by owner
        requests.delete(f"{API}/community/posts/{pid}", headers=demo_headers, timeout=20)


# -------- Regression: safety center --------
class TestRegression:
    def test_sos(self, demo_headers):
        r = requests.post(f"{API}/me/sos", json={"latitude": 28.6, "longitude": 77.2, "note": "TEST"}, headers=demo_headers, timeout=20)
        assert r.status_code in (200, 201), r.text

    def test_emergency_contacts_crud(self, demo_headers):
        # list
        r = requests.get(f"{API}/me/emergency-contacts", headers=demo_headers, timeout=20)
        assert r.status_code == 200
        # create
        r = requests.post(f"{API}/me/emergency-contacts", json={"name": "TEST_EC", "phone": "+919000000099", "relation": "friend"}, headers=demo_headers, timeout=20)
        assert r.status_code in (200, 201), r.text
        c = r.json()
        cid = c.get("id") or (c.get("contact") or {}).get("id")
        assert cid
        # update
        r = requests.put(f"{API}/me/emergency-contacts/{cid}", json={"name": "TEST_EC2", "phone": "+919000000099", "relation": "family"}, headers=demo_headers, timeout=20)
        assert r.status_code == 200, r.text
        # delete
        r = requests.delete(f"{API}/me/emergency-contacts/{cid}", headers=demo_headers, timeout=20)
        assert r.status_code in (200, 204)

    def test_live_share(self, demo_headers):
        r = requests.post(f"{API}/me/live-share", json={"duration_minutes": 15}, headers=demo_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        token = d.get("token") or d.get("share_token") or (d.get("session") or {}).get("token")
        if token:
            # post location
            r2 = requests.post(f"{API}/me/location", json={"latitude": 28.61, "longitude": 77.21}, headers=demo_headers, timeout=20)
            assert r2.status_code in (200, 201)
            r3 = requests.get(f"{API}/public/live/{token}", timeout=20)
            assert r3.status_code == 200, r3.text

    def test_otp_request_whatsapp(self):
        r = requests.post(f"{API}/auth/otp/request", json={"phone": "+919000000123"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # Expect channel key + live boolean
        assert "channel" in d
        assert "live" in d
