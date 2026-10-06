"""Iter13 extra — verify the vehicle-alert fan-out also reaches VEHICLE CONTACTS
(not just the owner), and respects the receives_emergency / receives_parking flags.
Creates a TEST_ contact and removes it in teardown.
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/") + "/api"
DEMO = {"email": "demo@neksathi.app", "password": "demo1234"}
LOG_PATH = "/var/log/supervisor/backend.err.log"
CONTACT_PHONE = "+919999000111"


def _log_size():
    return os.path.getsize(LOG_PATH) if os.path.exists(LOG_PATH) else 0


def _log_tail(off):
    with open(LOG_PATH, "r", errors="ignore") as fh:
        fh.seek(off)
        return fh.read()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/auth/login", json=DEMO, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"demo login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def vehicle_with_contact(client):
    vr = client.get(f"{BASE_URL}/vehicles", timeout=30)
    assert vr.status_code == 200, vr.text[:300]
    vehicles = vr.json()
    if vehicles:
        v = vehicles[0]
    else:
        cr = client.post(f"{BASE_URL}/vehicles", json={
            "number_plate": f"TEST{uuid.uuid4().hex[:5].upper()}", "vehicle_type": "car"}, timeout=30)
        assert cr.status_code == 200, cr.text[:300]
        v = cr.json()
    c = client.post(f"{BASE_URL}/vehicles/{v['id']}/contacts", json={
        "name": "TEST_contact", "phone": CONTACT_PHONE, "relation": "qa",
        "receives_emergency": True, "receives_parking": False}, timeout=30)
    assert c.status_code == 200, f"create contact {c.status_code}: {c.text[:300]}"
    contact = c.json()
    yield v, contact
    d = client.delete(f"{BASE_URL}/vehicles/{v['id']}/contacts/{contact['id']}", timeout=30)
    assert d.status_code in (200, 204, 404)


def _alert(v, atype):
    off = _log_size()
    r = requests.post(f"{BASE_URL}/public/qr/{v['qr_id']}/alert",
                      json={"type": atype, "scanner_note": "qa fanout"}, timeout=60)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
    time.sleep(2)
    return _log_tail(off)


def test_emergency_reaches_vehicle_contact(vehicle_with_contact):
    v, _ = vehicle_with_contact
    logs = _alert(v, "emergency")
    assert CONTACT_PHONE in logs, f"emergency alert did not fan out to vehicle contact. tail={logs[-1500:]}"


def test_parking_respects_opt_out(vehicle_with_contact):
    v, _ = vehicle_with_contact
    logs = _alert(v, "wrong_parking")
    assert CONTACT_PHONE not in logs, "contact with receives_parking=False was still messaged"
    assert "MSG91 WHATSAPP MOCK" in logs or "MSG91 SMS MOCK" in logs, "owner not messaged for wrong_parking"
