"""Unit tests for the alots.in SMS OTP adapter in app/services/comms.py.

These run standalone — comms.py only imports os/logging/httpx, so we load it
directly from its file (no app wiring, no DB, no live server) and mock httpx.
"""
import asyncio
import importlib.util
import pathlib

import pytest

# Load comms.py in isolation (avoids importing the whole FastAPI app / Mongo).
_COMMS_PATH = pathlib.Path(__file__).resolve().parents[1] / "app" / "services" / "comms.py"
_spec = importlib.util.spec_from_file_location("alots_comms_under_test", _COMMS_PATH)
comms = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(comms)


ALOTS_ENV = {
    "ALOTS_USERNAME": "NEKSATHI",
    "ALOTS_API_KEY": "TEST-KEY",
    "ALOTS_SENDER": "NEKSAT",
    "ALOTS_OTP_TEMPLATE_ID": "1777179368850975729",
}


def _set_env(monkeypatch):
    for k, v in ALOTS_ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("ALOTS_BASE_URL", raising=False)
    monkeypatch.delenv("ALOTS_ROUTE", raising=False)
    monkeypatch.delenv("ALOTS_OTP_NAME", raising=False)


# --------------------------------------------------------------------- helpers
def test_alots_mobile_strips_country_code():
    assert comms.alots_mobile("+919812345678") == "9812345678"
    assert comms.alots_mobile("9812345678") == "9812345678"
    assert comms.alots_mobile("91 98123-45678") == "9812345678"
    assert comms.alots_mobile("") == ""
    assert comms.alots_mobile(None) == ""


def test_alots_otp_message_matches_dlt_template():
    msg = comms.alots_otp_message("987546", "GINNI")
    assert msg == (
        "Dear GINNI, Your Nek Sathi code is 987546.\n"
        "Keep it private. Never share it.\n"
        "www.neksathi.in"
    )
    # default name when none supplied
    assert comms.alots_otp_message("123456").startswith(
        "Dear User, Your Nek Sathi code is 123456."
    )


def test_alots_live_requires_all_four(monkeypatch):
    for k in ALOTS_ENV:
        monkeypatch.delenv(k, raising=False)
    assert comms.alots_live() is False
    monkeypatch.setenv("ALOTS_USERNAME", "NEKSATHI")
    monkeypatch.setenv("ALOTS_API_KEY", "TEST-KEY")
    monkeypatch.setenv("ALOTS_SENDER", "NEKSAT")
    assert comms.alots_live() is False          # still missing template id
    monkeypatch.setenv("ALOTS_OTP_TEMPLATE_ID", "1777179368850975729")
    assert comms.alots_live() is True


# ------------------------------------------------------------ httpx fake client
class _FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload
        self.text = payload if isinstance(payload, str) else str(payload)

    def json(self):
        if isinstance(self._payload, (dict, list)):
            return self._payload
        import json
        return json.loads(self._payload)


class _FakeClient:
    captured = {}
    _resp = None

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, params=None):
        _FakeClient.captured = {"url": url, "params": params}
        return _FakeClient._resp


def _patch_httpx(monkeypatch, resp):
    _FakeClient._resp = resp
    monkeypatch.setattr(comms.httpx, "AsyncClient", _FakeClient)


# ----------------------------------------------------------------- send tests
def test_send_otp_sms_alots_success_builds_correct_request(monkeypatch):
    _set_env(monkeypatch)
    _patch_httpx(monkeypatch, _FakeResp(200, {"ErrorCode": "000", "Status": "Success"}))

    out = asyncio.run(comms.send_otp_sms_alots("+919812345678", "987546", "GINNI"))
    assert out["status"] == "sent" and out["live"] is True

    cap = _FakeClient.captured
    assert cap["url"].endswith("/sms-panel/api/http/index.php")
    p = cap["params"]
    assert p["username"] == "NEKSATHI"
    assert p["apikey"] == "TEST-KEY"
    assert p["apirequest"] == "Text"
    assert p["sender"] == "NEKSAT"
    assert p["route"] == "TRANS"
    assert p["TemplateID"] == "1777179368850975729"
    assert p["format"] == "JSON"
    assert p["mobile"] == "9812345678"            # country code stripped
    assert "987546" in p["message"] and "GINNI" in p["message"]


def test_send_otp_sms_alots_custom_base_and_route(monkeypatch):
    _set_env(monkeypatch)
    monkeypatch.setenv("ALOTS_BASE_URL", "https://123.108.46.13/sms-panel/")
    monkeypatch.setenv("ALOTS_ROUTE", "OTP")
    _patch_httpx(monkeypatch, _FakeResp(200, [{"MessageID": "abc123"}]))  # id-list success

    out = asyncio.run(comms.send_otp_sms_alots("9812345678", "111111"))
    assert out["status"] == "sent"
    cap = _FakeClient.captured
    assert cap["url"] == "https://123.108.46.13/sms-panel/api/http/index.php"
    assert cap["params"]["route"] == "OTP"


def test_send_otp_sms_alots_error_payload_raises(monkeypatch):
    _set_env(monkeypatch)
    _patch_httpx(monkeypatch, _FakeResp(200, {"ErrorCode": "015", "Status": "Error", "ErrorMessage": "Invalid"}))
    with pytest.raises(RuntimeError):
        asyncio.run(comms.send_otp_sms_alots("9812345678", "111111"))


def test_send_otp_sms_alots_http_error_raises(monkeypatch):
    _set_env(monkeypatch)
    _patch_httpx(monkeypatch, _FakeResp(500, "Internal Server Error"))
    with pytest.raises(RuntimeError):
        asyncio.run(comms.send_otp_sms_alots("9812345678", "111111"))
