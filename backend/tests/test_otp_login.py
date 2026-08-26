"""OTP login flow tests (mock mode) + email login regression."""
import os
import random
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def creds():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("no test_credentials.md")
    c = p.read_text()
    rows = re.findall(r"\|\s*(\w+)\s*\|\s*(\S+@\S+)\s*\|\s*(\S+)\s*\|", c)
    return {r[0].lower(): {"email": r[1], "password": r[2]} for r in rows}


def _phone():
    return f"+9198{random.randint(10000000, 99999999)}"


def _request_code(client, phone, tries=6):
    """Request an OTP, tolerating the 5/minute rate limit on the endpoint."""
    import time
    for _ in range(tries):
        r = client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": phone})
        if r.status_code == 200:
            return r.json()["dev_code"]
        if r.status_code == 429 or "Rate limit" in r.text:
            time.sleep(12)
            continue
        pytest.fail(f"otp/request failed {r.status_code}: {r.text[:300]}")
    pytest.fail("otp/request rate limited repeatedly")


# --- OTP request ---
class TestOtpRequest:
    def test_request_returns_dev_code_in_mock_mode(self, client):
        phone = _phone()
        r = client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": phone})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["live"] is False
        assert d["channel"] == "mock"
        assert isinstance(d["dev_code"], str) and re.fullmatch(r"\d{6}", d["dev_code"])

    def test_request_rejects_short_phone(self, client):
        r = client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": "123"})
        assert r.status_code == 422


# --- OTP verify ---
class TestOtpVerify:
    def test_verify_creates_user_and_returns_jwt(self, client):
        phone = _phone()
        req = client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": phone})
        assert req.status_code == 200, req.text
        code = req.json()["dev_code"]
        r = client.post(f"{BASE_URL}/api/auth/otp/verify", json={"phone": phone, "code": code, "name": "TEST_OtpUser"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("access_token") and isinstance(d["access_token"], str)
        assert d["user"]["name"] == "TEST_OtpUser"
        assert "_id" not in d["user"]
        # token works on an authenticated endpoint
        me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {d['access_token']}"})
        assert me.status_code == 200, me.text
        assert me.json()["name"] == "TEST_OtpUser"
        assert "_id" not in me.json()

    def test_verify_wrong_code_rejected(self, client):
        phone = _phone()
        req_code = _request_code(client, phone)
        code = req_code
        wrong = "000000" if code != "000000" else "111111"
        r = client.post(f"{BASE_URL}/api/auth/otp/verify", json={"phone": phone, "code": wrong})
        assert r.status_code == 400
        assert "Invalid" in r.json().get("detail", "")

    def test_code_is_single_use(self, client):
        phone = _phone()
        code = _request_code(client, phone)
        first = client.post(f"{BASE_URL}/api/auth/otp/verify", json={"phone": phone, "code": code})
        assert first.status_code == 200
        second = client.post(f"{BASE_URL}/api/auth/otp/verify", json={"phone": phone, "code": code})
        assert second.status_code == 400

    def test_repeat_login_same_phone_reuses_user(self, client):
        phone = _phone()
        c1 = _request_code(client, phone)
        u1 = client.post(f"{BASE_URL}/api/auth/otp/verify", json={"phone": phone, "code": c1, "name": "TEST_Repeat"}).json()["user"]
        c2 = _request_code(client, phone)
        u2 = client.post(f"{BASE_URL}/api/auth/otp/verify", json={"phone": phone, "code": c2}).json()["user"]
        assert u1["id"] == u2["id"]


# --- email login regression ---
class TestEmailLogin:
    def test_demo_user_login(self, client, creds):
        c = creds.get("user")
        if not c:
            pytest.skip("user creds missing")
        r = client.post(f"{BASE_URL}/api/auth/login", json=c)
        assert r.status_code == 200, r.text
        assert r.json().get("access_token")

    def test_admin_login(self, client, creds):
        c = creds.get("admin")
        if not c:
            pytest.skip("admin creds missing")
        r = client.post(f"{BASE_URL}/api/auth/login", json=c)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["is_admin"] is True

    def test_bad_password_rejected(self, client, creds):
        c = creds.get("user")
        r = client.post(f"{BASE_URL}/api/auth/login", json={"email": c["email"], "password": "wrong-pass-xyz"})
        assert r.status_code in (400, 401)
