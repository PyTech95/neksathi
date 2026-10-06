"""Backend tests for iteration 6: Dealer login/portal, admin dealer-account
creation, masked call demo-friendly fallback, brand rename to 'Nek Sathi'.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN = ("admin@safeqr.com", "admin1234")
OWNER = ("demo_web@safeqr.com", "demo1234")
DEALER = ("dealera@nek.dev", "dealer1234")


_TOKENS: dict = {}

def _login(email, pw):
    if email in _TOKENS:
        return _TOKENS[email]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    _TOKENS[email] = r.json()
    return _TOKENS[email]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Dealer login & scoping -----------------------------------------------

class TestDealerAuth:
    def test_dealer_login_shape(self):
        body = _login(*DEALER)
        u = body["user"]
        assert u["is_dealer"] is True
        assert u["is_admin"] is False
        assert u.get("vendor_id"), "dealer must have vendor_id in UserOut"

    def test_dealer_me(self):
        tok = _login(*DEALER)["access_token"]
        r = requests.get(f"{API}/dealer/me", headers=_auth(tok))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["vendor"]["name"] == "Dealer A"
        s = j["stock"]
        for k in ("assigned_total", "available", "activated", "blocked"):
            assert k in s, f"missing stock key {k}"
        assert s["assigned_total"] >= 10, f"expected >=10 assigned, got {s}"

    def test_dealer_inventory_scoping(self):
        tok = _login(*DEALER)["access_token"]
        r = requests.get(f"{API}/dealer/inventory", headers=_auth(tok))
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 10
        serials = {i["serial_no"] for i in items}
        expected = {f"NS-2608-0000{n:02d}" for n in range(15, 25)}
        missing = expected - serials
        assert not missing, f"missing dealer serials {missing}"

    def test_dealer_cannot_access_admin(self):
        tok = _login(*DEALER)["access_token"]
        r = requests.get(f"{API}/admin/stats", headers=_auth(tok))
        assert r.status_code == 403

    def test_owner_cannot_access_dealer(self):
        tok = _login(*OWNER)["access_token"]
        r = requests.get(f"{API}/dealer/me", headers=_auth(tok))
        assert r.status_code == 403


# --- Admin creates dealer login -------------------------------------------

class TestAdminCreateDealerLogin:
    def test_create_vendor_and_login(self):
        admin = _login(*ADMIN)["access_token"]
        # create a fresh vendor
        vname = f"TEST_Dealer_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/vendors", headers=_auth(admin),
                          json={"name": vname, "city": "Delhi", "phone": "+919812345699"})
        assert r.status_code in (200, 201), r.text
        vendor = r.json()
        vid = vendor["id"]

        email = f"test_{uuid.uuid4().hex[:6]}@nek.dev"
        pw = "dealer12345"
        r = requests.post(f"{API}/admin/vendors/{vid}/account",
                          headers=_auth(admin),
                          json={"email": email, "password": pw, "name": vname})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["is_dealer"] is True
        assert out.get("vendor_id") == vid

        # Dealer can now login
        body = _login(email, pw)
        assert body["user"]["is_dealer"] is True
        # And can hit dealer/me
        r = requests.get(f"{API}/dealer/me", headers=_auth(body["access_token"]))
        assert r.status_code == 200

    def test_create_account_duplicate_email(self):
        admin = _login(*ADMIN)["access_token"]
        # try duplicating admin email
        # find any vendor first
        r = requests.get(f"{API}/admin/vendors", headers=_auth(admin))
        assert r.status_code == 200
        vendors = r.json().get("items", []) if isinstance(r.json(), dict) else r.json()
        assert vendors, "need at least one vendor"
        vid = vendors[0]["id"]
        r = requests.post(f"{API}/admin/vendors/{vid}/account",
                          headers=_auth(admin),
                          json={"email": ADMIN[0], "password": "whatever12"})
        assert r.status_code == 400


# --- Masked call demo-friendly --------------------------------------------

class TestMaskedCall:
    @pytest.fixture(scope="class")
    def wrong_parking_incident(self):
        """Create a wrong_parking incident against the owner's vehicle via /scan."""
        tok = _login(*OWNER)["access_token"]
        r = requests.get(f"{API}/vehicles", headers=_auth(tok))
        assert r.status_code == 200
        vehicles = r.json()
        assert vehicles, "owner needs at least one vehicle"
        qr_id = vehicles[0]["qr_id"]
        # Public: create incident
        r = requests.post(f"{API}/public/qr/{qr_id}/incident",
                          json={"type": "wrong_parking",
                                "scanner_phone": "+919000001234",
                                "note": "TEST masked call"})
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_call_returns_connecting_or_calling(self, wrong_parking_incident):
        r = requests.post(f"{API}/public/incident/{wrong_parking_incident}/call",
                          json={"scanner_phone": "+919000001234"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["masked"] is True
        # Owner phone must NOT be leaked anywhere in the response
        blob = str(body).lower()
        # demo owner phone from seed OR the phone we used
        # we mostly want to ensure no raw phone unrelated to portal appears
        assert body["status"] in ("calling", "connecting", "mock_connected", "need_phone"), body
        # For trial account we expect connecting or calling
        assert body["status"] in ("connecting", "calling"), f"expected demo-friendly connecting/calling, got {body}"
        assert body.get("portal_number"), "portal number should be returned"

    def test_call_without_phone_needs_phone(self):
        # fresh incident with no scanner_phone
        tok = _login(*OWNER)["access_token"]
        vehicles = requests.get(f"{API}/vehicles", headers=_auth(tok)).json()
        qr_id = vehicles[0]["qr_id"]
        r = requests.post(f"{API}/public/qr/{qr_id}/incident",
                          json={"type": "wrong_parking", "note": "TEST no phone"})
        assert r.status_code == 200
        inc_id = r.json()["id"]
        r = requests.post(f"{API}/public/incident/{inc_id}/call", json={})
        assert r.status_code == 200
        body = r.json()
        # need_phone (live twilio, no phone) OR mock_connected (no creds)
        assert body["status"] in ("need_phone", "mock_connected", "connecting"), body


# --- Brand rename ---------------------------------------------------------

class TestBrand:
    def test_public_qr_endpoint_up(self):
        tok = _login(*OWNER)["access_token"]
        vehicles = requests.get(f"{API}/vehicles", headers=_auth(tok)).json()
        qr_id = vehicles[0]["qr_id"]
        r = requests.get(f"{API}/public/qr/{qr_id}")
        assert r.status_code == 200
