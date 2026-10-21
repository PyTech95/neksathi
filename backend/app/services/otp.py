from __future__ import annotations

from datetime import timedelta, timezone
import random as _random
import secrets
from app.services import comms
from app.services.email import send_email
from app.services.email import email_verify_otp_html
from app.config import log
from app.db import db
from app.security import canon_phone
from app.utils import now_utc


OTP_TTL_MIN = 10


def _otp_live() -> bool:
    return comms.otp_live()


async def _otp_provider_mock() -> bool:
    """True when the admin has switched the OTP gateway to DEMO.

    Demo is selected when the saved telco provider is anything other than
    ``msg91``. In demo we always issue an on-screen code even if gateway keys
    happen to be present — this is what the admin's Demo↔Live toggle controls.
    When no config is saved we default to msg91 (live-capable) so ENV-only
    deployments keep working.
    """
    doc = await db.system_config.find_one({"id": "telco"})
    return bool(doc) and doc.get("provider", "msg91") != "msg91"


def _norm_phone(p: str) -> str:
    # Canonical digits-only key (+91 assumed for bare 10-digit) so OTP storage
    # and account matching use the exact same form everywhere.
    return canon_phone(p)


async def _issue_phone_otp(phone_norm: str) -> dict:
    """Generate + deliver a verification OTP. Returns {channel, dev_code, live}."""
    demo = await _otp_provider_mock()
    if not demo and comms.whatsapp_otp_live():
        code = f"{_random.randint(0, 999999):06d}"
        await db.phone_verify_otps.update_one(
            {"phone": phone_norm},
            {"$set": {"phone": phone_norm, "code": code, "expires_at": now_utc() + timedelta(minutes=OTP_TTL_MIN), "created_at": now_utc()}},
            upsert=True)
        await comms.send_whatsapp_otp(phone_norm, code)
        return {"channel": "whatsapp", "dev_code": None, "live": True}
    if not demo and _otp_live():
        await comms.send_otp(phone_norm)
        return {"channel": "sms", "dev_code": None, "live": True}
    code = f"{_random.randint(0, 999999):06d}"
    await db.phone_verify_otps.update_one(
        {"phone": phone_norm},
        {"$set": {"phone": phone_norm, "code": code, "expires_at": now_utc() + timedelta(minutes=OTP_TTL_MIN), "created_at": now_utc()}},
        upsert=True)
    log.info("[PHONE-VERIFY OTP MOCK] %s -> %s", phone_norm, code)
    return {"channel": "mock", "dev_code": code, "live": False}


async def _consume_phone_otp(phone_norm: str, code: str) -> bool:
    # MSG91 live SMS-OTP verifies server-side; everything else verifies locally.
    demo = await _otp_provider_mock()
    if not demo and _otp_live() and not comms.whatsapp_otp_live():
        try:  # pragma: no cover - live path
            return await comms.verify_otp(phone_norm, code)
        except Exception:
            return False
    row = await db.phone_verify_otps.find_one({"phone": phone_norm})
    if not row:
        return False
    exp = row["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    ok = row.get("code") == code and exp >= now_utc()
    if ok:
        await db.phone_verify_otps.delete_many({"phone": phone_norm})
    return ok


EMAIL_OTP_TTL_MIN = 10


async def _issue_email_otp(email: str) -> dict:
    """Generate + deliver an email-verification OTP. DEMO (no SMTP) returns the
    code in ``dev_code`` so it shows on screen; LIVE emails it (dev_code None)."""
    code = f"{secrets.randbelow(1000000):06d}"
    await db.email_verify_otps.update_one(
        {"email": email},
        {"$set": {"email": email, "code": code, "expires_at": now_utc() + timedelta(minutes=EMAIL_OTP_TTL_MIN), "created_at": now_utc()}},
        upsert=True)
    email_sent = False
    try:
        mid = await send_email(to=email, subject="Verify your Nek Sathi email", html=email_verify_otp_html(code, expires_minutes=EMAIL_OTP_TTL_MIN))
        email_sent = mid is not None
    except Exception as _e:  # pragma: no cover
        log.warning("email verify send crashed: %s", _e)
    return {"dev_code": None if email_sent else code, "email_sent": email_sent}


async def _consume_email_otp(email: str, code: str) -> bool:
    row = await db.email_verify_otps.find_one({"email": email})
    if not row:
        return False
    exp = row["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    ok = row.get("code") == code and exp >= now_utc()
    if ok:
        await db.email_verify_otps.delete_many({"email": email})
    return ok
