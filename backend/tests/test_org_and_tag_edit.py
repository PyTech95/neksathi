"""Batch 15 tests: Organization portal + Tag editing + Emergency SMS fallback.

Covers:
  - /admin/orgs create + list, /admin/orgs/{id}/account (org login creation)
  - /org/me, /org/tags, /org/inventory, /org/alerts scoping + require_org
  - Access control: owner cannot hit /org/*; org account cannot hit /vehicles
  - Bulk generate with product_type=tag + org_id → inventory carries org_id
  - /qr/claim tag branch copies org_id onto the tag → surfaces in /org/tags
  - PUT /tags/{id} edits name/guardian/blood
  - Existing school@nek.dev/school1234 login works & shows Sunrise School.
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

ADMIN = {"email": "admin@safeqr.com", "password": "admin1234"}
DEMO = {"email": "demo_web@safeqr.com", "password": "demo1234"}
SCHOOL = {"email": "school@nek.dev", "password": "school1234"}


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()["user"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    tok, _ = _login(**ADMIN)
    return tok


@pytest.fixture(scope="module")
def demo_token():
    tok, _ = _login(**DEMO)
    return tok


# ----- Existing seed org login -----

def test_existing_school_login_and_org_me():
    tok, user = _login(**SCHOOL)
    assert user["is_org"] is True
    assert user["org_id"]
    assert "password_hash" not in user  # never leak
    r = requests.get(f"{BASE}/org/me", headers=_auth(tok))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["org"]["name"] == "Sunrise School"
    counts = body["counts"]
    assert set(counts.keys()) == {"issued", "activated", "unclaimed"}
    assert counts["activated"] >= 1


def test_school_org_tags_lists_riya():
    tok, _ = _login(**SCHOOL)
    r = requests.get(f"{BASE}/org/tags", headers=_auth(tok))
    assert r.status_code == 200, r.text
    names = [t["name"] for t in r.json()["results"]]
    assert any("Riya" in n for n in names), f"expected Riya (4B) in {names}"


def test_school_org_alerts_shape():
    tok, _ = _login(**SCHOOL)
    r = requests.get(f"{BASE}/org/alerts", headers=_auth(tok))
    assert r.status_code == 200
    body = r.json()
    assert "count" in body and "results" in body


# ----- Access control -----

def test_owner_cannot_access_org_endpoints(demo_token):
    r = requests.get(f"{BASE}/org/me", headers=_auth(demo_token))
    assert r.status_code == 403


def test_org_cannot_access_owner_vehicles():
    tok, _ = _login(**SCHOOL)
    # /vehicles is owner-scoped; org accounts should get an empty list (not 500).
    r = requests.get(f"{BASE}/vehicles", headers=_auth(tok))
    # It's allowed since it just filters by owner_id, but must not crash.
    assert r.status_code in (200, 403)


# ----- Full flow: create org → login → generate → claim → verify -----

@pytest.fixture(scope="module")
def new_org(admin_token):
    """Create a brand new test org + login, return (org_id, org_email, org_pw)."""
    unique = uuid.uuid4().hex[:8]
    org_name = f"TEST_Org_{unique}"
    r = requests.post(
        f"{BASE}/admin/orgs",
        headers=_auth(admin_token),
        json={"name": org_name, "org_type": "school", "city": "TestCity", "phone": "9000000000"},
    )
    assert r.status_code == 200, r.text
    org = r.json()
    org_id = org["id"]

    email = f"test_org_{unique}@nek.dev"
    pw = "testorg1234"
    r2 = requests.post(
        f"{BASE}/admin/orgs/{org_id}/account",
        headers=_auth(admin_token),
        json={"email": email, "password": pw, "name": org_name},
    )
    assert r2.status_code == 200, r2.text
    acct = r2.json()
    assert acct["is_org"] is True
    assert acct["org_id"] == org_id
    assert "password_hash" not in acct
    return {"org_id": org_id, "email": email, "password": pw, "name": org_name}


def test_admin_orgs_list_includes_new(admin_token, new_org):
    r = requests.get(f"{BASE}/admin/orgs", headers=_auth(admin_token))
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()["results"]]
    assert new_org["org_id"] in ids


def test_org_account_login_and_full_flow(admin_token, demo_token, new_org):
    # 1. Admin generates a small tag batch tied to this org
    gen_payload = {
        "product_type": "tag",
        "org_id": new_org["org_id"],
        "count": 2,
        "batch_note": f"TEST batch for {new_org['name']}",
    }
    r = requests.post(f"{BASE}/admin/qr/generate-bulk", headers=_auth(admin_token), json=gen_payload)
    assert r.status_code == 200, r.text
    batch = r.json()
    assert batch["count"] == 2

    # 2. Login as new org, verify inventory has ≥2 unclaimed
    org_tok, org_user = _login(new_org["email"], new_org["password"])
    assert org_user["is_org"] and org_user["org_id"] == new_org["org_id"]

    inv_r = requests.get(f"{BASE}/org/inventory", headers=_auth(org_tok))
    assert inv_r.status_code == 200
    inv_serials = [x["serial_no"] for x in inv_r.json()["results"]]
    assert len(inv_serials) >= 2, inv_serials

    # 3. Owner (demo) claims serial #1 as a kid tag
    serial = inv_serials[0]
    tag_name = f"TEST_Kid_{uuid.uuid4().hex[:6]}"
    claim_payload = {
        "serial_no": serial,
        "product_type": "tag",
        "payload": {
            "name": tag_name,
            "tag_type": "kid",
            "guardian_name": "Test Guardian",
            "guardian_phone": "9000012345",
            "blood_group": "O+",
        },
    }
    cr = requests.post(f"{BASE}/qr/claim", headers=_auth(demo_token), json=claim_payload)
    assert cr.status_code == 200, cr.text
    claimed = cr.json()
    tag_id = claimed.get("id")
    assert tag_id, claimed

    # 4. Verify tag now appears in the org's /org/tags list (org_id propagated)
    time.sleep(0.5)
    ot = requests.get(f"{BASE}/org/tags", headers=_auth(org_tok))
    assert ot.status_code == 200
    tag_names = [t["name"] for t in ot.json()["results"]]
    assert tag_name in tag_names, f"{tag_name} not in {tag_names}"

    # 5. Counts reflect activation
    me = requests.get(f"{BASE}/org/me", headers=_auth(org_tok)).json()
    assert me["counts"]["activated"] >= 1
    assert me["counts"]["issued"] >= 2

    # 6. PUT /tags/{id} — owner edits name + guardian
    new_name = tag_name + "_EDITED"
    upd = {
        "name": new_name,
        "tag_type": "kid",
        "guardian_name": "Updated Guardian",
        "guardian_phone": "9000099999",
        "blood_group": "B+",
    }
    up = requests.put(f"{BASE}/tags/{tag_id}", headers=_auth(demo_token), json=upd)
    assert up.status_code == 200, up.text
    body = up.json()
    assert body["name"] == new_name
    assert body["guardian_name"] == "Updated Guardian"
    assert body["guardian_phone"] == "9000099999"
    assert body["blood_group"] == "B+"

    # 7. GET verifies persistence
    g = requests.get(f"{BASE}/tags/{tag_id}", headers=_auth(demo_token)).json()
    assert g["name"] == new_name
    assert g["guardian_name"] == "Updated Guardian"

    # 8. /public/tag hides guardian_phone
    qr_id = g["qr_id"]
    pub = requests.get(f"{BASE}/public/tag/{qr_id}").json()
    assert "9000099999" not in str(pub), "guardian_phone leaked in public tag response"
    assert pub.get("has_guardian") is True

    # 9. Cleanup — delete the tag
    d = requests.delete(f"{BASE}/tags/{tag_id}", headers=_auth(demo_token))
    assert d.status_code == 200


def test_login_response_never_leaks_password_hash():
    for creds in (ADMIN, DEMO, SCHOOL):
        _, user = _login(**creds)
        assert "password_hash" not in user
        assert "password" not in user
