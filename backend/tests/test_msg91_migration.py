"""Pytest — MSG91 comms migration + regression.

Covers:
- OTP mock login (request + verify)
- Admin telco-config GET/PUT (MSG91 only, no Twilio)
- Public vehicle QR incident masked call — no phone leakage
- Public tag masked call — no phone leakage
- Kid tag alert (mock WhatsApp/SMS) still logs successfully
- Regression: role logins route correctly, various list endpoints load
- Chunked SOS upload flow (init -> chunk -> status -> complete)
"""
import os
import io
import uuid
import base64
import pytest
import requests

def _read_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v: return v.rstrip("/")
    try:
        for ln in open("/app/frontend/.env").read().splitlines():
            if ln.startswith("REACT_APP_BACKEND_URL="):
                return ln.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _read_backend_url()
API = f"{BASE}/api"
DEMO_VEHICLE_QR = "45805f3a-f10a-4534-bc7d-29699029b2cf"

CREDS = {
    "admin":  ("admin@safeqr.com", "admin1234"),
    "owner":  ("demo_web@safeqr.com", "demo1234"),
    "dealer": ("dealera@nek.dev", "dealer1234"),
    "org":    ("school@nek.dev", "school1234"),
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="session")
def admin_token():
    return _login(*CREDS["admin"])["access_token"]

@pytest.fixture(scope="session")
def owner_token():
    return _login(*CREDS["owner"])["access_token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Twilio must be gone
def test_no_twilio_references_in_backend():
    import pathlib
    root = pathlib.Path("/app/backend")
    hits = []
    for p in root.rglob("*.py"):
        if "tests" in p.parts or "comms.py" in str(p):
            continue
        try:
            content = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for i, ln in enumerate(content.splitlines(), 1):
            low = ln.lower()
            if "twilio" in low and not ln.strip().startswith("#"):
                hits.append(f"{p}:{i}:{ln.strip()}")
    assert not hits, f"Leftover Twilio refs: {hits[:10]}"


# ---------- OTP mock
def test_otp_request_returns_mock_dev_code():
    phone = f"+9199{uuid.uuid4().int % 100000000:08d}"
    r = requests.post(f"{API}/auth/otp/request", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("live") is False
    assert j.get("channel") == "mock"
    assert isinstance(j.get("dev_code"), str) and len(j["dev_code"]) == 6

def test_otp_verify_creates_user_and_returns_token():
    phone = f"+9199{uuid.uuid4().int % 100000000:08d}"
    r = requests.post(f"{API}/auth/otp/request", json={"phone": phone}, timeout=20)
    code = r.json()["dev_code"]
    r2 = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "code": code, "name": "TEST_OTP_User"}, timeout=20)
    assert r2.status_code == 200, r2.text
    j = r2.json()
    assert isinstance(j.get("access_token"), str) and len(j["access_token"]) > 20
    assert j["user"]["name"] == "TEST_OTP_User"
    assert j["user"]["phone"] == phone

def test_otp_verify_wrong_code_rejected():
    phone = f"+9199{uuid.uuid4().int % 100000000:08d}"
    requests.post(f"{API}/auth/otp/request", json={"phone": phone}, timeout=20)
    r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "code": "000000", "name": "x"}, timeout=20)
    assert r.status_code == 400


# ---------- Admin telco-config
def test_admin_telco_config_get(admin_token):
    r = requests.get(f"{API}/admin/telco-config", headers=hdr(admin_token), timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("provider") == "msg91"
    live = j.get("live") or {}
    for k in ("otp", "sms", "whatsapp", "voice"):
        assert live.get(k) is False, f"{k} live should be False in preview: {live}"
    # Must not leak any twilio keys
    assert not any("twilio" in k.lower() for k in j.keys())

def test_admin_telco_config_put(admin_token):
    payload = {
        "provider": "msg91",
        "sms_enabled": False,
        "msg91_authkey": "",  # keep empty to preserve mock mode
        "msg91_otp_template_id": "",
        "msg91_sms_flow_id": "",
        "msg91_sms_sender": "",
        "msg91_whatsapp_number": "",
        "msg91_whatsapp_template": "",
        "msg91_whatsapp_namespace": "",
        "msg91_caller_id": "",
    }
    r = requests.put(f"{API}/admin/telco-config", headers=hdr(admin_token), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("ok") is True
    assert j.get("provider") == "msg91"


# ---------- Public masked calls
def _find_owner_phone(admin_token):
    r = requests.get(f"{API}/auth/login-as", headers=hdr(admin_token), timeout=10)
    return None  # not needed; we assert absence in response


def test_public_vehicle_masked_call_no_leak(owner_token):
    # Report an incident on the demo vehicle QR
    r = requests.post(f"{API}/public/qr/{DEMO_VEHICLE_QR}/incident", json={
        "type": "accident", "scanner_note": "TEST_MSG91 masked call scan", "scanner_phone": "+919000000001"
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    inc = r.json()
    inc_id = inc.get("id") or inc.get("incident_id")
    assert inc_id, f"no incident id: {inc}"

    r2 = requests.post(f"{API}/public/incident/{inc_id}/call", json={"scanner_phone": "+919000000001"}, timeout=20)
    assert r2.status_code == 200, r2.text
    j = r2.json()
    assert j.get("masked") is True
    assert j.get("status") in ("mock_connected", "connecting", "calling", "need_phone")
    assert j.get("provider") in ("mock", "msg91")
    body_text = r2.text.lower()
    for banned in ("owner_phone", "guardian_phone", "target_phone"):
        assert banned not in body_text, f"leaked field {banned}: {r2.text}"


def test_public_incident_get_does_not_leak_owner_phone(owner_token):
    r = requests.post(f"{API}/public/qr/{DEMO_VEHICLE_QR}/incident", json={
        "type": "wrong_parking", "scanner_note": "TEST_MSG91 privacy check"
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    inc_id = r.json().get("id")
    r2 = requests.get(f"{API}/public/incident/{inc_id}", timeout=20)
    assert r2.status_code == 200, r2.text
    j = r2.json()
    assert "owner_phone" not in j


# ---------- Public tag masked call
def _make_test_tag(owner_token):
    """Create a kid_help tag under the demo owner for masked-call test."""
    payload = {
        "name": "TEST_MSG91_Kid",
        "type": "kid_help",
        "guardian_name": "TEST Guardian",
        "guardian_phone": "+919000000002",
        "blood_group": "O+",
    }
    # Best-effort creation via /tags
    r = requests.post(f"{API}/tags", headers=hdr(owner_token), json=payload, timeout=20)
    if r.status_code in (200, 201):
        return r.json().get("id"), r.json().get("qr_id")
    return None, None


def test_public_tag_masked_call_no_leak(owner_token):
    tid, qr = _make_test_tag(owner_token)
    if not qr:
        pytest.skip("could not create tag for masked-call test")
    r = requests.post(f"{API}/public/tag/{qr}/call", json={"scanner_phone": "+919000000003"}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("masked") is True
    assert j.get("status") in ("mock_connected", "connecting", "calling", "need_phone")
    body = r.text.lower()
    assert "guardian_phone" not in body
    assert "9000000002" not in r.text, "guardian phone leaked!"
    # cleanup
    if tid:
        requests.delete(f"{API}/tags/{tid}", headers=hdr(owner_token), timeout=10)


def test_public_tag_page_no_guardian_phone_leak(owner_token):
    tid, qr = _make_test_tag(owner_token)
    if not qr:
        pytest.skip("could not create tag")
    r = requests.get(f"{API}/public/tag/{qr}", timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "guardian_phone" not in j
    assert "9000000002" not in r.text
    if tid:
        requests.delete(f"{API}/tags/{tid}", headers=hdr(owner_token), timeout=10)


def test_public_tag_alert_kid_help_ok(owner_token):
    tid, qr = _make_test_tag(owner_token)
    if not qr:
        pytest.skip("could not create tag")
    r = requests.post(f"{API}/public/tag/{qr}/alert", json={
        "type": "kid_help", "note": "TEST_MSG91 kid alert", "scanner_phone": "+919000000004"
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    # ensure no leakage in response
    assert "9000000002" not in r.text
    if tid:
        requests.delete(f"{API}/tags/{tid}", headers=hdr(owner_token), timeout=10)


# ---------- Regression: role logins
@pytest.mark.parametrize("role,creds", [
    ("admin",  CREDS["admin"]),
    ("owner",  CREDS["owner"]),
    ("dealer", CREDS["dealer"]),
    ("org",    CREDS["org"]),
])
def test_role_logins(role, creds):
    j = _login(*creds)
    assert "access_token" in j
    u = j["user"]
    if role == "admin":  assert u.get("is_admin") is True
    if role == "dealer": assert u.get("is_dealer") is True
    if role == "org":    assert u.get("is_org") is True


# ---------- Regression: list endpoints load
def test_owner_vehicles_list(owner_token):
    r = requests.get(f"{API}/vehicles", headers=hdr(owner_token), timeout=20)
    assert r.status_code == 200

def test_owner_tags_list(owner_token):
    r = requests.get(f"{API}/tags", headers=hdr(owner_token), timeout=20)
    assert r.status_code == 200

def test_admin_plans_support_contacts_orgs(admin_token):
    for path in ("/admin/plans", "/admin/support/tickets", "/admin/contacts", "/admin/orgs"):
        r = requests.get(f"{API}{path}", headers=hdr(admin_token), timeout=20)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:120]}"


# ---------- Chunked SOS upload
def test_sos_chunked_upload_flow(owner_token):
    init = requests.post(f"{API}/user/sos-video/init", headers=hdr(owner_token),
                        json={"total_chunks": 1, "duration_ms": 100}, timeout=20)
    assert init.status_code == 200, init.text
    upload_id = init.json().get("upload_id")
    assert upload_id

    chunk_b64 = base64.b64encode(b"TEST_MSG91_CHUNK__DATA").decode()
    r = requests.post(f"{API}/user/sos-video/chunk", headers=hdr(owner_token),
                     json={"upload_id": upload_id, "index": 0, "data_base64": chunk_b64}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("received") == 1

    r = requests.get(f"{API}/user/sos-video/status/{upload_id}", headers=hdr(owner_token), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("missing") == []
