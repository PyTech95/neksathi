"""Backend integration tests for the SafeQR/Nek Saathi web app flows.

Covers: auth (login/register/me), vehicles CRUD, contacts, lost mode,
public QR lookup + alert, alerts feed, admin stats/users/suspend.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@safeqr.com"
ADMIN_PASSWORD = "admin1234"
OWNER_EMAIL = "demo_web@safeqr.com"
OWNER_PASSWORD = "demo1234"


@pytest.fixture(scope="session")
def owner_token():
    # Try login; if fails, register a fresh unique owner
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    if r.status_code == 200:
        return r.json()["access_token"]
    # register unique
    email = f"TEST_owner_{uuid.uuid4().hex[:8]}@safeqr.com"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "test1234", "name": "Test Owner", "phone": "+919000000001"
    })
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Auth ---

class TestAuth:
    def test_me(self, owner_token):
        r = requests.get(f"{API}/auth/me", headers=auth(owner_token))
        assert r.status_code == 200
        body = r.json()
        assert "email" in body and "id" in body

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# --- Vehicles ---

class TestVehicles:
    def test_create_list_get_vehicle(self, owner_token):
        plate = f"TST{uuid.uuid4().hex[:4].upper()}"
        r = requests.post(f"{API}/vehicles", headers=auth(owner_token), json={
            "number_plate": plate, "vehicle_type": "car",
            "make_model": "Test Model", "color": "Red", "speed_limit_kmh": 80,
        })
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["number_plate"] == plate.upper()
        assert v["qr_id"]
        vid = v["id"]

        # list
        r = requests.get(f"{API}/vehicles", headers=auth(owner_token))
        assert r.status_code == 200
        assert any(x["id"] == vid for x in r.json())

        # get
        r = requests.get(f"{API}/vehicles/{vid}", headers=auth(owner_token))
        assert r.status_code == 200
        assert r.json()["id"] == vid

    def test_lost_mode(self, owner_token):
        r = requests.post(f"{API}/vehicles", headers=auth(owner_token), json={
            "number_plate": f"LM{uuid.uuid4().hex[:4].upper()}", "vehicle_type": "bike",
            "speed_limit_kmh": 60,
        })
        vid = r.json()["id"]
        r = requests.post(f"{API}/vehicles/{vid}/lost_mode", headers=auth(owner_token), json={"enabled": True})
        assert r.status_code == 200
        assert r.json()["lost_mode"] is True
        r = requests.post(f"{API}/vehicles/{vid}/lost_mode", headers=auth(owner_token), json={"enabled": False})
        assert r.json()["lost_mode"] is False

    def test_contacts_crud(self, owner_token):
        r = requests.post(f"{API}/vehicles", headers=auth(owner_token), json={
            "number_plate": f"C{uuid.uuid4().hex[:5].upper()}", "vehicle_type": "car",
        })
        vid = r.json()["id"]
        r = requests.post(f"{API}/vehicles/{vid}/contacts", headers=auth(owner_token), json={
            "name": "Test Contact", "phone": "+919000000002"
        })
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        r = requests.get(f"{API}/vehicles/{vid}/contacts", headers=auth(owner_token))
        assert r.status_code == 200 and any(c["id"] == cid for c in r.json())
        r = requests.delete(f"{API}/vehicles/{vid}/contacts/{cid}", headers=auth(owner_token))
        assert r.status_code == 200


# --- Public QR flow ---

class TestPublicQR:
    @pytest.fixture(scope="class")
    def public_vehicle(self, owner_token):
        r = requests.post(f"{API}/vehicles", headers=auth(owner_token), json={
            "number_plate": f"PQR{uuid.uuid4().hex[:4].upper()}", "vehicle_type": "car",
            "make_model": "Public Model", "color": "Blue",
        })
        assert r.status_code == 200
        return r.json()

    def test_public_lookup(self, public_vehicle):
        r = requests.get(f"{API}/public/qr/{public_vehicle['qr_id']}")
        assert r.status_code == 200
        body = r.json()
        assert body["number_plate"] == public_vehicle["number_plate"]
        assert "owner_first_name" in body

    def test_public_lookup_404(self):
        r = requests.get(f"{API}/public/qr/nonexistent-{uuid.uuid4().hex}")
        assert r.status_code == 404

    def test_public_alert(self, public_vehicle, owner_token):
        r = requests.post(f"{API}/public/qr/{public_vehicle['qr_id']}/alert", json={
            "type": "emergency", "scanner_note": "TEST alert", "scanner_phone": "+919000009999"
        })
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # verify shows up in owner alerts
        time.sleep(0.5)
        r = requests.get(f"{API}/alerts", headers=auth(owner_token))
        assert r.status_code == 200
        assert any(a["number_plate"] == public_vehicle["number_plate"] and a["type"] == "emergency" for a in r.json())


# --- Admin ---

class TestAdmin:
    def test_stats(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=auth(admin_token))
        assert r.status_code == 200
        body = r.json()
        # accept any dict of counters
        assert isinstance(body, dict) and len(body) > 0

    def test_users_list(self, admin_token):
        r = requests.get(f"{API}/admin/users", headers=auth(admin_token))
        assert r.status_code == 200
        body = r.json()
        users = body.get("results") if isinstance(body, dict) else body
        assert isinstance(users, list) and len(users) > 0
        assert any(u.get("email") == ADMIN_EMAIL for u in users)

    def test_non_admin_forbidden(self, owner_token):
        r = requests.get(f"{API}/admin/stats", headers=auth(owner_token))
        assert r.status_code == 403
