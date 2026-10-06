"""Iteration 15 backend tests — Theft Protection + Family Guardian + regression."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://qrscan-preview-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO = {"email": "demo_web@safeqr.com", "password": "demo1234"}
ADMIN = {"email": "admin@safeqr.com", "password": "admin1234"}

# Tiny valid JPEG (1x1) as base64 data URL
TINY_JPEG_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="


@pytest.fixture(scope="session")
def s_demo():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=DEMO, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def s_admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# -------- Theft Protection --------
class TestTheft:
    def test_device_crud(self, s_demo):
        r = s_demo.post(f"{API}/devices", json={"name": "TEST_Pixel", "platform": "android", "lock_threshold": 3, "super_admin_alerts": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Pixel" and d["lock_threshold"] == 3 and d["locked"] is False
        did = d["id"]

        r = s_demo.get(f"{API}/devices")
        assert r.status_code == 200 and any(x["id"] == did for x in r.json())

        r = s_demo.put(f"{API}/devices/{did}", json={"name": "TEST_Pixel8", "platform": "android", "lock_threshold": 4, "super_admin_alerts": False})
        assert r.status_code == 200 and r.json()["name"] == "TEST_Pixel8" and r.json()["lock_threshold"] == 4

        # Lock/unlock
        assert s_demo.post(f"{API}/devices/{did}/lock").status_code == 200
        r = s_demo.get(f"{API}/devices/{did}/lock-state")
        assert r.status_code == 200 and r.json()["locked"] is True and r.json()["lock_threshold"] == 4
        assert s_demo.post(f"{API}/devices/{did}/unlock").status_code == 200
        assert s_demo.get(f"{API}/devices/{did}/lock-state").json()["locked"] is False

        s_demo._device_id = did  # save

    def test_intruder_below_threshold_does_not_lock(self, s_demo):
        did = s_demo._device_id
        r = s_demo.post(f"{API}/devices/{did}/intruder", json={
            "photo_base64": TINY_JPEG_B64, "attempt_count": 1, "latitude": 28.61, "longitude": 77.20
        })
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["triggered_lock"] is False and ev["has_photo"] is True and ev["view_token"]
        assert s_demo.get(f"{API}/devices/{did}/lock-state").json()["locked"] is False
        s_demo._token1 = ev["view_token"]
        s_demo._ev1 = ev["id"]

    def test_intruder_at_threshold_locks(self, s_demo):
        did = s_demo._device_id
        # threshold=4 after PUT
        r = s_demo.post(f"{API}/devices/{did}/intruder", json={
            "photo_base64": TINY_JPEG_B64, "attempt_count": 4, "latitude": 28.61, "longitude": 77.20
        })
        assert r.status_code == 200
        ev = r.json()
        assert ev["triggered_lock"] is True
        st = s_demo.get(f"{API}/devices/{did}/lock-state").json()
        assert st["locked"] is True
        s_demo.post(f"{API}/devices/{did}/unlock")  # reset for later

    def test_intruder_events_list_no_raw_base64(self, s_demo):
        r = s_demo.get(f"{API}/intruder-events")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 2
        for it in items:
            assert "photo_base64" not in it
            assert "has_photo" in it and "view_token" in it

    def test_intruder_photo_fetch(self, s_demo):
        r = s_demo.get(f"{API}/intruder-events/{s_demo._ev1}/photo")
        assert r.status_code == 200 and r.json()["photo_base64"].startswith("data:image")

    def test_public_intruder_no_auth(self, s_demo):
        token = s_demo._token1
        r = requests.get(f"{API}/public/intruder/{token}", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["photo_base64"] and j["attempt_count"] == 1

    def test_admin_intruder_list(self, s_admin):
        r = s_admin.get(f"{API}/admin/intruder-events")
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and isinstance(j["items"], list) and j["count"] >= 1
        it = j["items"][0]
        assert "owner_name" in it and "has_photo" in it

    def test_admin_intruder_forbidden_for_regular_user(self, s_demo):
        r = s_demo.get(f"{API}/admin/intruder-events")
        assert r.status_code == 403

    def test_device_delete_cleanup(self, s_demo):
        did = s_demo._device_id
        r = s_demo.delete(f"{API}/devices/{did}")
        assert r.status_code == 200


# -------- Family Guardian --------
class TestFamily:
    def test_reset_state(self, s_demo, s_admin):
        # Ensure both users are not in a family
        r = s_demo.get(f"{API}/family").json()
        if r.get("in_family"):
            s_demo.post(f"{API}/family/leave")
        r = s_admin.get(f"{API}/family").json()
        if r.get("in_family"):
            s_admin.post(f"{API}/family/leave")

    def test_create_and_join(self, s_demo, s_admin):
        r = s_demo.post(f"{API}/family", json={"name": "TEST_Family"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["is_guardian"] and j["invite_code"] and len(j["invite_code"]) >= 4
        code = j["invite_code"]

        # Cannot create again
        r2 = s_demo.post(f"{API}/family", json={"name": "AGAIN"})
        assert r2.status_code == 400

        # Admin joins
        r = s_admin.post(f"{API}/family/join", json={"invite_code": code})
        assert r.status_code == 200 and r.json()["joined"] is True

        # Admin cannot join again
        r = s_admin.post(f"{API}/family/join", json={"invite_code": code})
        assert r.status_code == 400

        # Bad code
        r = s_admin.post(f"{API}/family/join", json={"invite_code": "XXXXX"})
        assert r.status_code in (400, 404)

    def test_get_family_members(self, s_demo, s_admin):
        r = s_demo.get(f"{API}/family")
        assert r.status_code == 200
        j = r.json()
        assert j["in_family"] and j["is_guardian"] and j["invite_code"]
        assert len(j["members"]) == 2
        s_demo._family = j
        # Admin view: is_guardian=False, invite_code should be None
        r2 = s_admin.get(f"{API}/family").json()
        assert r2["in_family"] and r2["is_guardian"] is False and r2["invite_code"] is None

    def test_status_and_family_map(self, s_demo, s_admin):
        # Both push status
        assert s_demo.post(f"{API}/me/status", json={"latitude": 28.6139, "longitude": 77.2090, "battery": 88}).status_code == 200
        assert s_admin.post(f"{API}/me/status", json={"latitude": 19.0760, "longitude": 72.8777, "battery": 55}).status_code == 200
        j = s_demo.get(f"{API}/family").json()
        for m in j["members"]:
            assert m["latitude"] is not None and m["battery"] is not None and m["last_seen"] is not None

    def test_sharing_off_hides_location(self, s_admin, s_demo):
        r = s_admin.put(f"{API}/family/my-sharing", json={"share_location": False, "share_activity": True})
        assert r.status_code == 200
        j = s_demo.get(f"{API}/family").json()
        admin_m = [m for m in j["members"] if not m["is_me"]][0]
        assert admin_m["latitude"] is None and admin_m["last_seen"] is None
        # Turn back on
        s_admin.put(f"{API}/family/my-sharing", json={"share_location": True, "share_activity": True})

    def test_activity_report_and_read(self, s_admin, s_demo):
        # Admin (member) posts activity
        r = s_admin.post(f"{API}/family/activity", json={"type": "app_usage", "app_name": "TEST_YouTube", "seconds": 600})
        assert r.status_code == 200 and r.json()["stored"] is True
        # Guardian reads admin's activity
        j = s_demo.get(f"{API}/family").json()
        admin_m = [m for m in j["members"] if not m["is_me"]][0]
        r = s_demo.get(f"{API}/family/members/{admin_m['member_id']}/activity")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["shared"] is True
        assert d.get("today_totals", {}).get("TEST_YouTube", 0) >= 600
        assert any(a.get("app_name") == "TEST_YouTube" for a in d["items"])

    def test_activity_sharing_off_blocks_storage(self, s_admin):
        s_admin.put(f"{API}/family/my-sharing", json={"share_location": True, "share_activity": False})
        r = s_admin.post(f"{API}/family/activity", json={"type": "app_usage", "app_name": "TEST_HIDDEN", "seconds": 300})
        assert r.status_code == 200 and r.json().get("stored") is False
        s_admin.put(f"{API}/family/my-sharing", json={"share_location": True, "share_activity": True})

    def test_activity_forbidden_for_outsider(self, s_demo, s_admin):
        # Create fresh outsider user
        import uuid as _u
        outsider = {"email": f"TEST_out_{_u.uuid4().hex[:8]}@t.com", "password": "outpass123", "name": "TEST Outsider", "phone": "+911234567890"}
        r = requests.post(f"{API}/auth/register", json=outsider, timeout=30)
        assert r.status_code == 200
        so = requests.Session(); so.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
        # Try to read admin's activity from demo family
        j = s_demo.get(f"{API}/family").json()
        admin_m = [m for m in j["members"] if not m["is_me"]][0]
        r = so.get(f"{API}/family/members/{admin_m['member_id']}/activity")
        # Outsider isn't in the family — server returns 404 (Not in a family circle)
        assert r.status_code in (403, 404)

    def test_guardian_remove_member(self, s_demo, s_admin):
        j = s_demo.get(f"{API}/family").json()
        admin_m = [m for m in j["members"] if not m["is_me"]][0]
        # Member cannot remove
        r = s_admin.delete(f"{API}/family/members/{admin_m['member_id']}")
        assert r.status_code == 403
        # Guardian cannot remove themselves
        me = [m for m in j["members"] if m["is_me"]][0]
        r = s_demo.delete(f"{API}/family/members/{me['member_id']}")
        assert r.status_code == 400
        # Guardian removes admin
        r = s_demo.delete(f"{API}/family/members/{admin_m['member_id']}")
        assert r.status_code == 200
        j = s_demo.get(f"{API}/family").json()
        assert len(j["members"]) == 1

    def test_leave_guardian_dissolves(self, s_demo, s_admin):
        r = s_demo.post(f"{API}/family/leave")
        assert r.status_code == 200 and r.json().get("dissolved") is True
        assert s_demo.get(f"{API}/family").json()["in_family"] is False
        assert s_admin.get(f"{API}/family").json()["in_family"] is False


# -------- Regression --------
class TestRegression:
    def test_sos_trigger(self, s_demo):
        r = s_demo.post(f"{API}/me/sos", json={"latitude": 28.6, "longitude": 77.2, "message": "TEST"})
        assert r.status_code == 200 and "id" in r.json()

    def test_emergency_contacts_crud(self, s_demo):
        r = s_demo.post(f"{API}/me/emergency-contacts", json={"name": "TEST_C", "phone": "+919999999901", "relation": "friend"})
        assert r.status_code == 200
        cid = r.json()["id"]
        assert s_demo.get(f"{API}/me/emergency-contacts").status_code == 200
        assert s_demo.delete(f"{API}/me/emergency-contacts/{cid}").status_code == 200

    def test_live_share(self, s_demo):
        r = s_demo.post(f"{API}/me/live-share", json={"duration_min": 15, "label": "TEST"})
        assert r.status_code == 200
        token = r.json()["token"]; sid = r.json()["id"]
        r = requests.get(f"{API}/public/live/{token}", timeout=15)
        assert r.status_code == 200
        s_demo.post(f"{API}/me/live-share/{sid}/stop")

    def test_location_geofence(self, s_demo):
        r = s_demo.post(f"{API}/me/location", json={"latitude": 28.6139, "longitude": 77.2090, "speed_kmh": 0})
        assert r.status_code == 200 and "transitions" in r.json()

    def test_safe_zones_list(self, s_demo):
        assert s_demo.get(f"{API}/me/safe-zones").status_code == 200

    def test_nearby_police(self, s_demo):
        r = s_demo.get(f"{API}/safety/nearby-police", params={"lat": 28.6139, "lng": 77.2090})
        assert r.status_code == 200

    def test_community_list(self, s_demo):
        r = s_demo.get(f"{API}/community")
        assert r.status_code == 200

    def test_otp_request_whatsapp_live(self):
        r = requests.post(f"{API}/auth/otp/request", json={"phone": "+919999999999", "channel": "whatsapp"}, timeout=20)
        # accept either 200 with live flag or a rate-limited response
        assert r.status_code in (200, 429)
        if r.status_code == 200:
            j = r.json()
            assert "channel" in j
