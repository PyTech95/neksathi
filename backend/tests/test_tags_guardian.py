"""Backend tests for new tag features:
- Kid/Patient tag with guardian
- Public tag reveals has_guardian + guardian_name but NEVER guardian_phone
- Masked guardian call endpoint returns 'connecting' status without exposing number
- Non-person tag has no guardian_name/phone leaked
"""
import os, uuid, time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://qrscan-preview-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER = ("demo_web@safeqr.com", "demo1234")


@pytest.fixture(scope="module")
def owner_token():
    for _ in range(3):
        r = requests.post(f"{API}/auth/login", json={"email": OWNER[0], "password": OWNER[1]})
        if r.status_code == 200:
            return r.json()["access_token"]
        time.sleep(6)
    pytest.skip(f"login failed: {r.status_code} {r.text}")


def _h(tok): return {"Authorization": f"Bearer {tok}"}


class TestKidTagGuardianFlow:
    created_ids = []

    def test_create_kid_tag_with_guardian(self, owner_token):
        payload = {
            "name": f"TEST_kid_{uuid.uuid4().hex[:6]}",
            "tag_type": "kid",
            "blood_group": "O+",
            "medical_notes": "Peanut allergy",
            "guardian_name": "Test Guardian",
            "guardian_phone": "+919000012345",
        }
        r = requests.post(f"{API}/tags", headers=_h(owner_token), json=payload)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["tag_type"] == "kid"
        assert t["guardian_name"] == "Test Guardian"
        assert t["guardian_phone"] == "+919000012345"  # owner CAN see it
        assert t.get("qr_id")
        TestKidTagGuardianFlow.created_ids.append((t["id"], t["qr_id"]))

    def test_public_lookup_hides_phone_shows_flag(self, owner_token):
        tid, qr = TestKidTagGuardianFlow.created_ids[-1]
        r = requests.get(f"{API}/public/tag/{qr}")
        assert r.status_code == 200, r.text
        pub = r.json()
        assert pub["tag_type"] == "kid"
        assert pub.get("guardian_name") == "Test Guardian"
        assert pub.get("has_guardian") is True
        # guardian_phone must NEVER be in the public payload
        assert "guardian_phone" not in pub, f"LEAK: {pub}"

    def test_masked_call_returns_connecting_without_phone(self, owner_token):
        tid, qr = TestKidTagGuardianFlow.created_ids[-1]
        r = requests.post(f"{API}/public/tag/{qr}/call", json={"scanner_phone": "+919999999999"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") in ("connecting", "calling", "queued", "initiated")
        # portal number must be present, but target/guardian phone must NOT
        assert "guardian_phone" not in body
        assert "target_phone" not in body
        # confirm the +919000012345 does not appear anywhere in response
        assert "9000012345" not in str(body)

    def test_bag_tag_no_guardian_leak(self, owner_token):
        payload = {
            "name": f"TEST_bag_{uuid.uuid4().hex[:6]}",
            "tag_type": "bag",
        }
        r = requests.post(f"{API}/tags", headers=_h(owner_token), json=payload)
        assert r.status_code == 200, r.text
        t = r.json()
        qr = t["qr_id"]
        pub = requests.get(f"{API}/public/tag/{qr}").json()
        assert pub["tag_type"] == "bag"
        assert not pub.get("guardian_name")
        assert pub.get("has_guardian") is False
        assert "guardian_phone" not in pub
        TestKidTagGuardianFlow.created_ids.append((t["id"], qr))

    def test_patient_type_accepted(self, owner_token):
        r = requests.post(f"{API}/tags", headers=_h(owner_token), json={
            "name": f"TEST_patient_{uuid.uuid4().hex[:6]}",
            "tag_type": "patient",
            "guardian_name": "Nurse Jane",
            "guardian_phone": "+919000098765",
        })
        assert r.status_code == 200, r.text
        assert r.json()["tag_type"] == "patient"
        TestKidTagGuardianFlow.created_ids.append((r.json()["id"], r.json()["qr_id"]))

    def test_cleanup(self, owner_token):
        for tid, _ in TestKidTagGuardianFlow.created_ids:
            requests.delete(f"{API}/tags/{tid}", headers=_h(owner_token))
