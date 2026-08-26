"""LIVE WhatsApp OTP mode tests + email/password login regression.

Covers:
  - POST /api/auth/otp/request  -> live whatsapp response, dev_code null
  - POST /api/auth/otp/verify   -> rejects wrong code (400)
  - POST /api/auth/login        -> email/password regression (demo user)
"""
import os
import re
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing from env and /app/frontend/.env")
BASE_URL = base_url.rstrip("/")

TEST_PHONE = "+919812345678"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def creds():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing /app/memory/test_credentials.md")
    rows = re.findall(r"\|\s*(\w+)\s*\|\s*(\S+@\S+)\s*\|\s*(\S+)\s*\|", p.read_text())
    return {r[0].lower(): {"email": r[1], "password": r[2]} for r in rows}


def _request_otp(client, phone, tries=5):
    """POST otp/request tolerating the 5/minute rate limit."""
    last = None
    for _ in range(tries):
        r = client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": phone})
        last = r
        if r.status_code == 429 or "rate limit" in r.text.lower():
            time.sleep(15)
            continue
        return r
    return last


# --- LIVE OTP request ---
class TestLiveOtpRequest:
    def test_request_live_whatsapp_no_dev_code(self, client):
        r = _request_otp(client, TEST_PHONE)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        d = r.json()
        assert d.get("ok") is True
        assert d.get("channel") == "whatsapp", f"expected whatsapp channel, got {d}"
        assert d.get("live") is True, f"expected live mode, got {d}"
        assert d.get("dev_code") is None, "dev_code must be null in live mode"

    def test_request_rejects_short_phone(self, client):
        r = client.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": "12"})
        assert r.status_code in (422, 429), f"{r.status_code}: {r.text[:200]}"

    def test_verify_rejects_wrong_code(self, client):
        r = client.post(f"{BASE_URL}/api/auth/otp/verify",
                        json={"phone": TEST_PHONE, "code": "000000"})
        assert r.status_code in (400, 429), f"{r.status_code}: {r.text[:300]}"
        if r.status_code == 400:
            assert "Invalid or expired" in r.json().get("detail", "")


# --- Email/password login regression ---
class TestEmailLoginRegression:
    def test_demo_login_success(self, client, creds):
        u = creds.get("user") or {"email": "demo@neksathi.app", "password": "demo1234"}
        r = client.post(f"{BASE_URL}/api/auth/login", json=u)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        d = r.json()
        assert isinstance(d.get("access_token"), str) and len(d["access_token"]) > 10
        assert d["user"]["email"] == u["email"]
        assert d["user"].get("is_admin") in (False, None)
        assert "_id" not in d["user"]
        # token works on a protected endpoint
        me = client.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {d['access_token']}"})
        assert me.status_code == 200, me.text[:200]
        assert me.json()["email"] == u["email"]

    def test_login_wrong_password(self, client, creds):
        u = creds.get("user") or {"email": "demo@neksathi.app", "password": "demo1234"}
        r = client.post(f"{BASE_URL}/api/auth/login",
                        json={"email": u["email"], "password": "wrong-pass-xyz"})
        assert r.status_code in (400, 401, 429), f"{r.status_code}: {r.text[:200]}"
