"""Iteration 13 — vehicle QR scan alert WhatsApp/SMS fan-out (public_qr_alert)
plus regression on core APIs and the tag-alert flow.

Provider is MOCK in preview (MSG91_WHATSAPP_TEMPLATE / MSG91_SMS_FLOW_ID unset),
so success = a '[MSG91 WHATSAPP MOCK]'/'[MSG91 SMS MOCK]' log line for the owner
phone appears AFTER the alert, and a db.notifications audit doc is written.
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/") + "/api"

backend_env = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")

DEMO = {"email": "demo@neksathi.app", "password": "demo1234"}
ADMIN = {"email": "admin@safeqr.com", "password": "admin1234"}
LOG_PATH = "/var/log/supervisor/backend.err.log"


def _log_size():
    try:
        return os.path.getsize(LOG_PATH)
    except OSError:
        return 0


def _log_tail(offset):
    with open(LOG_PATH, "r", errors="ignore") as fh:
        fh.seek(offset)
        return fh.read()


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def demo_token(http):
    r = http.post(f"{BASE_URL}/auth/login", json=DEMO, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"demo login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def demo_client(demo_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {demo_token}"})
    return s


@pytest.fixture(scope="module")
def mongo():
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME unavailable")
    c = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    return c[DB_NAME]


@pytest.fixture(scope="module")
def vehicle(demo_client):
    r = demo_client.get(f"{BASE_URL}/vehicles", timeout=30)
    assert r.status_code == 200, f"GET /vehicles {r.status_code}: {r.text[:300]}"
    items = r.json()
    assert isinstance(items, list)
    if items:
        v = items[0]
    else:
        cr = demo_client.post(f"{BASE_URL}/vehicles", json={
            "number_plate": f"TEST{uuid.uuid4().hex[:5].upper()}", "vehicle_type": "car"}, timeout=30)
        assert cr.status_code == 200, f"create vehicle {cr.status_code}: {cr.text[:300]}"
        v = cr.json()
    assert v.get("qr_id"), f"vehicle has no qr_id: {v}"
    return v


@pytest.fixture(scope="module")
def owner_phone(demo_client):
    r = demo_client.get(f"{BASE_URL}/auth/me", timeout=30)
    assert r.status_code == 200, r.text[:300]
    return r.json().get("phone")


# --- Core / regression -----------------------------------------------------
class TestCoreHealth:
    def test_faqs(self, http):
        r = http.get(f"{BASE_URL}/faqs", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), list)

    def test_plans(self, http):
        r = http.get(f"{BASE_URL}/plans", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert isinstance(r.json(), (list, dict))

    def test_admin_login_and_me(self, http):
        r = http.post(f"{BASE_URL}/auth/login", json=ADMIN, timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        tok = r.json().get("access_token") or r.json().get("token")
        assert tok
        me = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert me.status_code == 200, me.text[:300]
        assert me.json().get("email") == ADMIN["email"]

    def test_demo_me(self, demo_client):
        r = demo_client.get(f"{BASE_URL}/auth/me", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("email") == DEMO["email"]

    def test_sos(self, demo_client):
        r = demo_client.post(f"{BASE_URL}/me/sos", json={}, timeout=60)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"


# --- The fix: vehicle scan alert fan-out ----------------------------------
class TestVehicleAlertFanout:
    created_alert_ids = []

    def _fire(self, vehicle, atype, note):
        off = _log_size()
        r = requests.post(
            f"{BASE_URL}/public/qr/{vehicle['qr_id']}/alert",
            json={"type": atype, "scanner_note": note,
                  "scanner_lat": 19.07, "scanner_lng": 72.87},
            headers={"Content-Type": "application/json"}, timeout=60)
        return off, r

    def test_emergency_alert_sends_whatsapp_mock(self, vehicle, owner_phone, mongo):
        note = f"qa test {uuid.uuid4().hex[:6]}"
        off, r = self._fire(vehicle, "emergency", note)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("type") == "emergency"
        assert isinstance(body.get("id"), str) and body["id"]
        self.__class__.created_alert_ids.append(body["id"])
        # no leakage of contact channels
        assert "contact_channels" not in body

        time.sleep(2)
        new_logs = _log_tail(off)
        assert "MSG91 WHATSAPP MOCK" in new_logs or "MSG91 SMS MOCK" in new_logs, \
            f"no whatsapp/sms send attempt logged after alert. tail={new_logs[-1500:]}"
        assert vehicle["number_plate"] in new_logs, "plate missing from outbound message"
        if owner_phone:
            assert owner_phone in new_logs, f"owner phone {owner_phone} not targeted"

        # audit trail in db.notifications
        docs = list(mongo.notifications.find(
            {"meta.vehicle_id": vehicle["id"], "meta.kind": "scan_alert"}).sort("created_at", -1).limit(5))
        assert docs, "no notification audit doc with meta.kind=scan_alert"
        assert docs[0]["channel"] == "whatsapp"
        assert note in docs[0]["text"]
        assert "maps.google.com/?q=19.07,72.87" in docs[0]["text"]

    def test_wrong_parking_alert_sends_whatsapp_mock(self, vehicle, owner_phone):
        off, r = self._fire(vehicle, "wrong_parking", "qa parking")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        assert r.json().get("type") == "wrong_parking"
        self.__class__.created_alert_ids.append(r.json()["id"])
        time.sleep(2)
        new_logs = _log_tail(off)
        assert "MSG91 WHATSAPP MOCK" in new_logs or "MSG91 SMS MOCK" in new_logs, \
            f"no send attempt logged for wrong_parking. tail={new_logs[-1500:]}"
        assert "Wrong parking" in new_logs

    def test_alert_persisted_and_visible_to_owner(self, demo_client, vehicle):
        assert self.created_alert_ids, "no alert created by earlier tests"
        r = demo_client.get(f"{BASE_URL}/alerts", timeout=30)
        assert r.status_code == 200, r.text[:300]
        ids = {a["id"] for a in r.json()}
        for aid in self.created_alert_ids:
            assert aid in ids, f"alert {aid} not returned by GET /alerts"
        mine = [a for a in r.json() if a["id"] == self.created_alert_ids[0]][0]
        assert mine["number_plate"] == vehicle["number_plate"]
        assert mine.get("scanner_lat") == 19.07

    def test_endpoint_fast_and_no_5xx_for_unknown_qr(self, vehicle):
        t0 = time.time()
        off, r = self._fire(vehicle, "theft", "qa theft")
        elapsed = time.time() - t0
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        assert elapsed < 20, f"alert endpoint too slow: {elapsed:.1f}s"
        bad = requests.post(f"{BASE_URL}/public/qr/does-not-exist-{uuid.uuid4().hex[:6]}/alert",
                            json={"type": "emergency"}, timeout=30)
        assert bad.status_code == 404, f"expected 404, got {bad.status_code}: {bad.text[:200]}"

    def test_invalid_type_rejected(self, vehicle):
        r = requests.post(f"{BASE_URL}/public/qr/{vehicle['qr_id']}/alert",
                          json={"type": "not_a_type"}, timeout=30)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"


# --- Tag alert regression --------------------------------------------------
class TestTagAlertRegression:
    def test_tag_alert_still_works(self, demo_client):
        r = demo_client.get(f"{BASE_URL}/tags", timeout=30)
        assert r.status_code == 200, r.text[:300]
        tags = r.json()
        if not tags:
            cr = demo_client.post(f"{BASE_URL}/tags", json={
                "name": f"TEST_tag_{uuid.uuid4().hex[:5]}", "kind": "bag"}, timeout=30)
            assert cr.status_code == 200, f"create tag {cr.status_code}: {cr.text[:300]}"
            tags = [cr.json()]
        tag = tags[0]
        assert tag.get("qr_id")
        off = _log_size()
        r = requests.post(f"{BASE_URL}/public/tag/{tag['qr_id']}/alert",
                          json={"type": "found", "scanner_note": "qa tag test",
                                "scanner_lat": 19.07, "scanner_lng": 72.87}, timeout=60)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        time.sleep(2)
        new_logs = _log_tail(off)
        assert "MSG91 WHATSAPP MOCK" in new_logs or "MSG91 SMS MOCK" in new_logs, \
            f"tag alert did not log a send attempt. tail={new_logs[-1500:]}"
