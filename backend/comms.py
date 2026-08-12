"""MSG91 communications adapter — OTP, SMS, WhatsApp and masked voice calls.

All functions are env-driven and degrade gracefully to a MOCK mode when the
relevant MSG91 credentials are absent (so preview/testing works end-to-end
without live keys). This module is the single place Twilio was replaced.

Required env (set the ones you use; anything missing => that channel is MOCK):
  MSG91_AUTHKEY               - account auth key (header `authkey`)
  MSG91_OTP_TEMPLATE_ID       - DLT-approved OTP template id (Send OTP)
  MSG91_SMS_FLOW_ID           - DLT flow/template id for transactional SMS
  MSG91_SMS_SENDER            - 6-char DLT sender id (optional; flow may define it)
  MSG91_WHATSAPP_NUMBER       - integrated WhatsApp Business number
  MSG91_WHATSAPP_TEMPLATE     - approved WhatsApp template name (body has 1 var)
  MSG91_WHATSAPP_NAMESPACE    - WhatsApp template namespace (optional)
  MSG91_WHATSAPP_LANG         - template language code (default 'en')
  MSG91_CALLER_ID             - voice caller id used for masked/2-way calls
"""

import os
import logging
import httpx

log = logging.getLogger("safeqr.comms")
BASE = "https://control.msg91.com/api"
_TIMEOUT = 15.0


def _authkey() -> str | None:
    return os.environ.get("MSG91_AUTHKEY")


def norm_mobile(phone: str | None) -> str:
    """MSG91 wants country-code + number with no '+' or spaces, e.g. 919812345678."""
    if not phone:
        return ""
    digits = "".join(ch for ch in phone if ch.isdigit())
    # Assume India if a bare 10-digit number is supplied.
    if len(digits) == 10:
        digits = "91" + digits
    return digits


# --------------------------------------------------------------------------- OTP
def otp_live() -> bool:
    return bool(_authkey() and os.environ.get("MSG91_OTP_TEMPLATE_ID"))


async def send_otp(phone: str) -> dict:
    if not otp_live():
        return {"live": False, "status": "mock"}
    params = {
        "template_id": os.environ["MSG91_OTP_TEMPLATE_ID"],
        "mobile": norm_mobile(phone),
        "otp_length": "6",
        "otp_expiry": "10",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        r = await c.post(f"{BASE}/v5/otp", params=params, headers={"authkey": _authkey()})
    ok = r.status_code == 200 and (r.json().get("type") == "success")
    if not ok:
        raise RuntimeError(f"MSG91 send OTP failed: {r.text[:200]}")
    return {"live": True, "status": "sent"}


async def verify_otp(phone: str, code: str) -> bool:
    if not otp_live():
        return False  # caller falls back to local mock verification
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        r = await c.get(f"{BASE}/v5/otp/verify",
                        params={"mobile": norm_mobile(phone), "otp": code},
                        headers={"authkey": _authkey()})
    try:
        return r.status_code == 200 and r.json().get("type") == "success"
    except Exception:
        return False


async def resend_otp(phone: str, retrytype: str = "text") -> dict:
    if not otp_live():
        return {"live": False, "status": "mock"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        await c.get(f"{BASE}/v5/otp/retry",
                    params={"mobile": norm_mobile(phone), "retrytype": retrytype},
                    headers={"authkey": _authkey()})
    return {"live": True, "status": "sent"}


# --------------------------------------------------------------------------- SMS
def sms_live() -> bool:
    return bool(_authkey() and os.environ.get("MSG91_SMS_FLOW_ID"))


async def send_sms(to: str | None, text: str) -> dict:
    if not to:
        return {"status": "skipped"}
    if not sms_live():
        log.info("[MSG91 SMS MOCK] to=%s :: %s", to, text)
        return {"status": "mock"}
    body = {
        "template_id": os.environ["MSG91_SMS_FLOW_ID"],
        "recipients": [{"mobiles": norm_mobile(to), "var1": text[:900]}],
    }
    sender = os.environ.get("MSG91_SMS_SENDER")
    if sender:
        body["sender"] = sender
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(f"{BASE}/v5/flow/", json=body, headers={"authkey": _authkey(), "Content-Type": "application/json"})
        return {"status": "sent" if r.status_code == 200 else "failed", "detail": r.text[:200]}
    except Exception as e:
        log.warning("MSG91 sms failed: %s", e)
        return {"status": "failed", "error": str(e)[:200]}


# ---------------------------------------------------------------------- WhatsApp
def whatsapp_live() -> bool:
    return bool(_authkey() and os.environ.get("MSG91_WHATSAPP_NUMBER") and os.environ.get("MSG91_WHATSAPP_TEMPLATE"))


async def send_whatsapp(to: str | None, text: str) -> dict:
    if not to:
        return {"status": "skipped"}
    if not whatsapp_live():
        log.info("[MSG91 WHATSAPP MOCK] to=%s :: %s", to, text)
        return {"status": "mock"}
    tmpl = {
        "name": os.environ["MSG91_WHATSAPP_TEMPLATE"],
        "language": {"code": os.environ.get("MSG91_WHATSAPP_LANG", "en"), "policy": "deterministic"},
        "to_and_components": [{
            "to": [norm_mobile(to)],
            "components": {"body_1": {"type": "text", "value": text[:1000]}},
        }],
    }
    ns = os.environ.get("MSG91_WHATSAPP_NAMESPACE")
    if ns:
        tmpl["namespace"] = ns
    body = {
        "integrated_number": os.environ["MSG91_WHATSAPP_NUMBER"],
        "content_type": "template",
        "payload": {"messaging_product": "whatsapp", "type": "template", "template": tmpl},
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(f"{BASE}/v5/whatsapp/whatsapp-outbound-message/bulk/", json=body,
                             headers={"authkey": _authkey(), "Content-Type": "application/json"})
        return {"status": "sent" if r.status_code in (200, 202) else "failed", "detail": r.text[:200]}
    except Exception as e:
        log.warning("MSG91 whatsapp failed: %s", e)
        return {"status": "failed", "error": str(e)[:200]}


# ------------------------------------------------------------------ Masked call
def voice_live() -> bool:
    return bool(_authkey() and os.environ.get("MSG91_CALLER_ID"))


def e164(phone: str | None) -> str:
    """Destination in E.164 with a leading '+' (matches Vobiz `to` docs example
    +919876543210). Note: a valid number that connected earlier can still be
    rejected as 'Invalid Destination Address' by the carrier if the Vobiz
    account/DID loses outbound voice capability, balance, or hits trial limits."""
    if not phone:
        return ""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) == 10:
        digits = "91" + digits
    return "+" + digits if digits else ""


# ----------------------------------------------------------- Vobiz masked voice
VOBIZ_BASE = "https://api.vobiz.ai/api/v1"


def vobiz_live() -> bool:
    return bool(os.environ.get("VOBIZ_AUTH_ID") and os.environ.get("VOBIZ_AUTH_TOKEN")
                and os.environ.get("VOBIZ_MASKING_DID"))


def vobiz_did() -> str:
    return (os.environ.get("VOBIZ_MASKING_DID") or "").strip()


async def vobiz_place_call(to: str, answer_url: str, hangup_url: str | None = None) -> dict:
    """Dial `to` FROM the Vobiz masking DID; on answer Vobiz fetches answer_url
    which returns XML that dials the second party (callerId = masking DID).
    Neither party ever sees the other's real number."""
    auth_id = os.environ["VOBIZ_AUTH_ID"]
    token = os.environ["VOBIZ_AUTH_TOKEN"]
    payload = {
        "from": vobiz_did(), "to": e164(to),
        "answer_url": answer_url, "answer_method": "POST",
        "ring_timeout": "30", "time_limit": "3600",
    }
    if hangup_url:
        payload["hangup_url"] = hangup_url
        payload["hangup_method"] = "POST"
    url = f"{VOBIZ_BASE}/Account/{auth_id}/Call/"
    headers = {"X-Auth-ID": auth_id, "X-Auth-Token": token, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(url, headers=headers, json=payload)
        return {"ok": not r.is_error, "status_code": r.status_code, "detail": r.text[:300]}
    except Exception as e:
        log.warning("Vobiz place call failed: %s", e)
        return {"ok": False, "error": str(e)[:200]}


async def masked_call(party_a: str | None, party_b: str | None) -> dict:
    """Bridge party_a (scanner) <-> party_b (owner/guardian) via MSG91 call
    masking / 2-way call. Neither party sees the other's number — MSG91's
    caller id is shown to both. Returns a status dict; MOCK when unconfigured."""
    if not voice_live():
        return {"status": "mock_connected", "provider": "mock"}
    if not (party_a and party_b):
        return {"status": "need_phone", "provider": "msg91"}
    body = {
        "caller_id": os.environ["MSG91_CALLER_ID"],
        "destination": norm_mobile(party_a),
        "destinationB": norm_mobile(party_b),
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
            r = await c.post(f"{BASE}/v5/voice/click-to-call/", json=body,
                             headers={"authkey": _authkey(), "Content-Type": "application/json"})
        return {"status": "calling" if r.status_code in (200, 202) else "connecting",
                "provider": "msg91", "detail": r.text[:200]}
    except Exception as e:
        log.warning("MSG91 masked call failed: %s", e)
        return {"status": "connecting", "provider": "msg91", "error": str(e)[:200]}
