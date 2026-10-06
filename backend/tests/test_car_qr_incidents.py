"""Backend tests for the Car QR Code module: admin bulk QR gen, dealer/vendor,
mark-sold, activation/claim, public incident (wrong_parking / accident / theft),
owner respond/resolve, masked call (privacy), admin incident dashboard, block/unblock.
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


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    if r.status_code != 200:
        r = requests.post(f"{API}/auth/register", json={
            "email": OWNER_EMAIL, "password": OWNER_PASSWORD, "name": "Demo Web", "phone": "+919000000010"
        })
        assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------------- Admin QR bulk / batches / CSV / stickers ----------------

@pytest.fixture(scope="module")
def qr_batch(admin_token):
    label = f"TEST_{uuid.uuid4().hex[:6]}"
    r = requests.post(f"{API}/admin/qr/generate-bulk",
                      headers=_auth(admin_token), json={"count": 5, "batch_label": label})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["count"] == 5 and b["first_serial"] and b["last_serial"]
    assert b["first_serial"].startswith("NS-")
    return b


class TestAdminQR:
    def test_batches_list(self, admin_token, qr_batch):
        r = requests.get(f"{API}/admin/qr/batches", headers=_auth(admin_token))
        assert r.status_code == 200
        assert any(x["batch_id"] == qr_batch["batch_id"] for x in r.json()["batches"])

    def test_inventory_lists_serials(self, admin_token, qr_batch):
        r = requests.get(f"{API}/admin/qr/inventory",
                         headers=_auth(admin_token), params={"batch_id": qr_batch["batch_id"]})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 5
        assert all(i["status"] == "unclaimed" for i in items)

    def test_csv_export(self, admin_token, qr_batch):
        r = requests.get(f"{API}/admin/qr/batch/{qr_batch['batch_id']}/export.csv",
                         headers=_auth(admin_token))
        assert r.status_code == 200
        assert "serial_no,qr_id,scan_url,status" in r.text
        assert r.text.count("\n") >= 5

    def test_stickers_html_public(self, qr_batch):
        # This endpoint is public by design (per code comment)
        r = requests.get(f"{API}/admin/qr/batch/{qr_batch['batch_id']}/stickers.html")
        assert r.status_code == 200
        assert "<html" in r.text.lower() or "<!doctype" in r.text.lower()

    def test_block_and_unblock_serial(self, admin_token, qr_batch):
        # take last serial to block (leave first ones for later tests)
        inv = requests.get(f"{API}/admin/qr/inventory", headers=_auth(admin_token),
                           params={"batch_id": qr_batch["batch_id"]}).json()["items"]
        serial = inv[0]["serial_no"]  # newest (highest seq)
        r = requests.post(f"{API}/admin/qr/{serial}/block",
                          headers=_auth(admin_token), json={"blocked": True})
        assert r.status_code == 200 and r.json()["status"] == "blocked"

        # verify inventory reflects
        r2 = requests.get(f"{API}/admin/qr/inventory", headers=_auth(admin_token),
                          params={"q": serial}).json()
        assert any(i["serial_no"] == serial and i["status"] == "blocked" for i in r2["items"])

        # unblock
        r = requests.post(f"{API}/admin/qr/{serial}/block",
                          headers=_auth(admin_token), json={"blocked": False})
        assert r.status_code == 200 and r.json()["status"] in ("unclaimed", "sold", "assigned")

    def test_mark_sold_range(self, admin_token, qr_batch):
        r = requests.post(f"{API}/admin/qr/mark-sold", headers=_auth(admin_token), json={
            "serial_from": qr_batch["first_serial"],
            "serial_to": qr_batch["last_serial"],
            "vendor_name": "TEST_Dealer_A",
        })
        assert r.status_code == 200
        assert r.json()["updated"] >= 1


# ---------------- Admin Vendors (dealers) ----------------

class TestAdminVendors:
    def test_create_and_list_vendor(self, admin_token):
        name = f"TEST_Vendor_{uuid.uuid4().hex[:5]}"
        r = requests.post(f"{API}/admin/vendors", headers=_auth(admin_token), json={
            "name": name, "contact_name": "Rita", "phone": "+919000000099",
            "city": "Pune",
        })
        assert r.status_code == 200, r.text
        vid = r.json()["id"]

        r = requests.get(f"{API}/admin/vendors", headers=_auth(admin_token))
        assert r.status_code == 200
        # response may be list or {results: []}
        js = r.json()
        vendors = js if isinstance(js, list) else js.get("items") or js.get("results") or js.get("vendors") or []
        assert any(v.get("id") == vid for v in vendors)

    def test_vendor_summary(self, admin_token):
        r = requests.get(f"{API}/admin/vendors/summary", headers=_auth(admin_token))
        assert r.status_code == 200


# ---------------- QR Activation / Claim ----------------

@pytest.fixture(scope="module")
def claimed_vehicle(admin_token, owner_token):
    # Fresh batch for claim so we have a clean serial
    label = f"TEST_CLAIM_{uuid.uuid4().hex[:5]}"
    r = requests.post(f"{API}/admin/qr/generate-bulk",
                      headers=_auth(admin_token), json={"count": 2, "batch_label": label})
    assert r.status_code == 200
    b = r.json()
    serial = b["first_serial"]

    # Public preview when NOT assigned
    r = requests.get(f"{API}/public/claim/{serial}")
    assert r.status_code == 200 and r.json()["status"] in ("unclaimed", "sold")

    plate = f"TST{uuid.uuid4().hex[:4].upper()}"
    r = requests.post(f"{API}/qr/claim", headers=_auth(owner_token), json={
        "serial_no": serial,
        "product_type": "vehicle",
        "payload": {"number_plate": plate, "vehicle_type": "car", "make_model": "Swift"},
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] and data["qr_id"]

    # After activation, public preview should now say assigned + return qr_id
    r = requests.get(f"{API}/public/claim/{serial}")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "assigned"
    assert j["qr_id"] == data["qr_id"]
    return {"serial": serial, "qr_id": data["qr_id"], "vehicle_id": data["id"], "plate": plate}


class TestClaimActivation:
    def test_claim_requires_auth(self, claimed_vehicle):
        # try a fresh serial without auth
        # Use the same qr flow but without token
        r = requests.post(f"{API}/qr/claim", json={
            "serial_no": "NS-9999-999999", "product_type": "vehicle", "payload": {}
        })
        assert r.status_code in (401, 403)

    def test_claim_double_conflict(self, owner_token, claimed_vehicle):
        # Re-claim the already claimed serial → 409
        r = requests.post(f"{API}/qr/claim", headers=_auth(owner_token), json={
            "serial_no": claimed_vehicle["serial"],
            "product_type": "vehicle",
            "payload": {"number_plate": "DUPX0001"},
        })
        assert r.status_code == 409


# ---------------- Public incident lifecycle ----------------

class TestIncidentWrongParking:
    def test_full_wrong_parking_lifecycle(self, owner_token, claimed_vehicle):
        qr_id = claimed_vehicle["qr_id"]

        # 1) Public creates wrong_parking incident (no auth)
        r = requests.post(f"{API}/public/qr/{qr_id}/incident", json={
            "type": "wrong_parking",
            "scanner_note": "Blocking my driveway",
            "scanner_phone": "+919888800001",
        })
        assert r.status_code == 200, r.text
        inc = r.json()
        assert inc["id"] and inc["status"] == "alert_sent"
        assert inc["type"] == "wrong_parking"
        # PRIVACY: owner phone must NOT be present in public response
        assert "owner_phone" not in inc
        assert not any("phone" in k and "owner" in k for k in inc.keys())
        # minutes_left ≤ 15
        assert 0 < inc.get("minutes_left", 0) <= 15
        inc_id = inc["id"]

        # 2) Public poll → still alert_sent, no owner phone
        r = requests.get(f"{API}/public/incident/{inc_id}")
        assert r.status_code == 200
        p = r.json()
        assert p["status"] == "alert_sent"
        assert "owner_phone" not in p

        # 3) Owner sees it in /incidents
        r = requests.get(f"{API}/incidents", headers=_auth(owner_token))
        assert r.status_code == 200
        results = r.json()["results"]
        mine = [x for x in results if x["id"] == inc_id]
        assert mine, "Owner should see the incident"
        assert mine[0]["number_plate"] == claimed_vehicle["plate"]

        # 4) Owner responds "coming"
        r = requests.post(f"{API}/incidents/{inc_id}/respond",
                          headers=_auth(owner_token), json={"response": "coming"})
        assert r.status_code == 200 and r.json()["status"] == "coming"

        # 5) Public poll now reflects owner_coming
        r = requests.get(f"{API}/public/incident/{inc_id}")
        assert r.status_code == 200
        p = r.json()
        assert p["status"] == "coming"
        assert p.get("owner_response") == "coming"
        assert "owner_phone" not in p

        # 6) Masked call — never leaks owner number
        r = requests.post(f"{API}/public/incident/{inc_id}/call",
                          json={"scanner_phone": "+919888800001"})
        assert r.status_code == 200, r.text
        call = r.json()
        assert call["masked"] is True
        assert call.get("portal_number")
        assert call["status"] in ("mock_connected", "connecting")
        # Ensure owner phone not returned (any field)
        blob = str(call).lower()
        # sanity: portal number is present, but no user-owned phone leaks
        # (we can't know owner phone without admin fetch, but ensure no fields imply it)
        assert "owner_phone" not in call
        assert "owner_number" not in call

        # 7) Owner resolves
        r = requests.post(f"{API}/incidents/{inc_id}/resolve", headers=_auth(owner_token))
        assert r.status_code == 200 and r.json()["status"] == "resolved"

        # 8) After resolve, public status shows resolved
        r = requests.get(f"{API}/public/incident/{inc_id}")
        assert r.status_code == 200
        assert r.json()["status"] == "resolved"


class TestIncidentAccidentTheft:
    def test_accident_creates_incident(self, claimed_vehicle):
        r = requests.post(f"{API}/public/qr/{claimed_vehicle['qr_id']}/incident", json={
            "type": "accident", "scanner_note": "Hit and run", "scanner_phone": "+919888800002",
        })
        assert r.status_code == 200
        j = r.json()
        assert j["type"] == "accident" and j["status"] == "alert_sent"
        assert "owner_phone" not in j

    def test_theft_creates_incident(self, claimed_vehicle):
        r = requests.post(f"{API}/public/qr/{claimed_vehicle['qr_id']}/incident", json={
            "type": "theft", "scanner_note": "Being towed away",
        })
        assert r.status_code == 200
        j = r.json()
        assert j["type"] == "theft" and j["status"] == "alert_sent"
        assert "owner_phone" not in j

    def test_incident_bad_qr_404(self):
        r = requests.post(f"{API}/public/qr/does-not-exist-{uuid.uuid4().hex}/incident", json={
            "type": "wrong_parking"
        })
        assert r.status_code == 404


# ---------------- Admin incidents dashboard ----------------

class TestAdminIncidents:
    def test_stats_and_list(self, admin_token):
        r = requests.get(f"{API}/admin/incidents", headers=_auth(admin_token))
        assert r.status_code == 200
        js = r.json()
        assert "stats" in js and "results" in js
        s = js["stats"]
        for k in ("total", "wrong_parking", "accident", "theft", "active", "resolved"):
            assert k in s
        assert s["total"] >= 1

    def test_filter_by_type(self, admin_token):
        r = requests.get(f"{API}/admin/incidents",
                         headers=_auth(admin_token), params={"type": "wrong_parking"})
        assert r.status_code == 200
        assert all(x["type"] == "wrong_parking" for x in r.json()["results"])

    def test_admin_only(self, owner_token):
        r = requests.get(f"{API}/admin/incidents", headers=_auth(owner_token))
        assert r.status_code == 403
