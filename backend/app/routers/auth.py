from __future__ import annotations

from datetime import timedelta, timezone
import bcrypt
import random as _random
import secrets
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from app.services import comms
from app.services.email import send_email
from app.services.email import password_reset_otp_html
from app.config import log
from app.db import db
from app.ratelimit import rate_limit
from app.schemas import AccountDeleteIn, ChangePasswordIn, EmailOtpConfirmIn, EmailOtpRequestIn, ForgotPasswordIn, ForgotVerifyIn, LoginIn, OtpRequestIn, OtpVerifyIn, PhoneOtpConfirmIn, PhoneOtpRequestIn, ProfileUpdate, RegisterIn, ResetPasswordIn, TokenOut, UserOut
from app.security import canon_phone, create_access_token, current_user, hash_password, to_user_out, verify_password
from app.services.otp import OTP_TTL_MIN, _consume_email_otp, _consume_phone_otp, _issue_email_otp, _issue_phone_otp, _norm_phone, _otp_live, _otp_provider_mock
from app.utils import clean, new_id, now_utc

router = APIRouter()


@router.post("/auth/register", response_model=TokenOut)
@rate_limit("10/hour")
async def register(request: Request, payload: RegisterIn):
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = new_id()
    user_doc = {
        "id": user_id,
        "email": email,
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "phone_norm": canon_phone(payload.phone),
        "phone_verified": False,
        "email_verified": False,
        "password_hash": hash_password(payload.password),
        "is_admin": False,
        "suspended": False,
        "created_at": now_utc(),
    }
    await db.users.insert_one(dict(user_doc))
    token = create_access_token(user_id)
    return TokenOut(
        access_token=token,
        user=to_user_out(user_doc),
    )


@router.post("/auth/login", response_model=TokenOut)
@rate_limit("10/minute")
async def login(request: Request, payload: LoginIn):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")
    token = create_access_token(user["id"])
    return TokenOut(
        access_token=token,
        user=to_user_out(user),
    )


@router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return to_user_out(user)


@router.post("/auth/refresh", response_model=TokenOut)
async def refresh(user: dict = Depends(current_user)):
    """Sliding session: exchange a still-valid token for a fresh one. The app
    calls this on every launch, so a user who keeps opening the app within the
    token window is never silently logged out."""
    token = create_access_token(user["id"])
    return TokenOut(access_token=token, user=to_user_out(user))


@router.get("/auth/me/export")
async def export_my_data(user: dict = Depends(current_user)):
    async def _all(collection, filt):
        return [clean(row) async for row in collection.find(filt)]

    vehicles = await _all(db.vehicles, {"owner_id": user["id"]})
    tags = await _all(db.tags, {"owner_id": user["id"]})
    cards = await _all(db.cards, {"owner_id": user["id"]})
    vehicle_ids = [v["id"] for v in vehicles]
    contacts = await _all(db.contacts, {"vehicle_id": {"$in": vehicle_ids}}) if vehicle_ids else []
    alerts = await _all(db.alerts, {"vehicle_id": {"$in": vehicle_ids}}) if vehicle_ids else []
    tag_alerts = await _all(db.alerts, {"tag_id": {"$in": [t["id"] for t in tags]}}) if tags else []
    subscriptions = await _all(db.subscriptions, {"user_id": user["id"]})
    tickets = await _all(db.tickets, {"user_id": user["id"]})
    location_pings = await _all(db.locations, {"vehicle_id": {"$in": vehicle_ids}}) if vehicle_ids else []
    return {
        "generated_at": now_utc().isoformat(),
        "notice": "This bundle contains every document Nek Sathi holds about your account.",
        "user": clean(user),
        "vehicles": vehicles,
        "tags": tags,
        "cards": cards,
        "contacts": contacts,
        "alerts": alerts + tag_alerts,
        "subscriptions": subscriptions,
        "tickets": tickets,
        "location_pings": location_pings,
    }


@router.delete("/auth/me")
async def delete_my_account(payload: AccountDeleteIn, user: dict = Depends(current_user)):
    from passlib.hash import bcrypt as _bcrypt  # local import to avoid cost at boot
    stored = user.get("password_hash", "")
    try:
        if not _bcrypt.verify(payload.password, stored):
            raise HTTPException(status_code=401, detail="Password does not match")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Password does not match")

    vehicles = [v["id"] async for v in db.vehicles.find({"owner_id": user["id"]}, {"id": 1})]
    tag_ids = [t["id"] async for t in db.tags.find({"owner_id": user["id"]}, {"id": 1})]

    await db.contacts.delete_many({"vehicle_id": {"$in": vehicles}})
    await db.locations.delete_many({"vehicle_id": {"$in": vehicles}})
    await db.alerts.delete_many({"$or": [
        {"vehicle_id": {"$in": vehicles}},
        {"tag_id": {"$in": tag_ids}},
    ]})
    await db.vehicles.delete_many({"owner_id": user["id"]})
    await db.tags.delete_many({"owner_id": user["id"]})
    await db.cards.delete_many({"owner_id": user["id"]})
    await db.subscriptions.delete_many({"user_id": user["id"]})
    await db.tickets.delete_many({"user_id": user["id"]})
    await db.bridge_sessions.delete_many({"owner_phone": user.get("phone")})
    await db.users.delete_one({"id": user["id"]})
    return {"deleted": True, "notice": "Account and all related data permanently removed."}


@router.post("/auth/me/consent")
async def record_consent(payload: dict, user: dict = Depends(current_user)):
    """DPDP notice-and-consent audit trail — persists the user's acceptance of
    the current privacy policy version so admins can prove consent."""
    version = str(payload.get("version") or "v1")
    channels = list(payload.get("channels") or [])
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "consent": {
                "version": version,
                "channels": channels,
                "accepted_at": now_utc(),
            }
        }},
    )
    return {"ok": True, "version": version}


@router.put("/auth/me", response_model=UserOut)
async def update_me(payload: ProfileUpdate, user: dict = Depends(current_user)):
    update: dict = {}
    if payload.name is not None:
        update["name"] = payload.name.strip()
    # NOTE: email is intentionally NOT changed here — a new email must be
    # verified via /auth/email/verify/* before it is accepted.
    if payload.phone is not None:
        new_phone = payload.phone.strip()
        update["phone"] = new_phone
        new_norm = canon_phone(new_phone)
        # If the number actually changed, it must be re-verified before it is
        # trusted again (keeps phone_verified honest for cross-login).
        if new_norm != (user.get("phone_norm") or canon_phone(user.get("phone"))):
            update["phone_norm"] = new_norm
            update["phone_verified"] = False
    if payload.notify_prefs is not None:
        update["notify_prefs"] = payload.notify_prefs.model_dump()
    if payload.avatar_base64 is not None:
        update["avatar_base64"] = payload.avatar_base64 or None
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        user.update(update)
    return to_user_out(user)


@router.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(current_user)):
    row = await db.users.find_one({"id": user["id"]})
    if not row or not verify_password(payload.old_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Old password is incorrect")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    return {"ok": True}


FORGOT_CODE_TTL_MIN = 5       # how long the emailed OTP code is valid


FORGOT_TICKET_TTL_MIN = 10    # how long the post-verify reset ticket is valid


FORGOT_MAX_ATTEMPTS = 5


@router.post("/auth/forgot-password")
@rate_limit("5/hour")
async def forgot_password(request: Request, payload: ForgotPasswordIn):
    """Step 1 — email a 6-digit reset CODE (valid 5 min).

    DEMO mode (SMTP not configured) returns the code in ``dev_code`` so it shows
    on screen; LIVE mode (SMTP set) emails it and ``dev_code`` is null. The reply
    shape is identical whether or not the account exists (anti-enumeration).
    """
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        return {"ok": True, "email": email, "dev_code": None, "expires_in_minutes": FORGOT_CODE_TTL_MIN, "email_sent": False}

    # One active reset per email — clear any older unused ones.
    await db.password_resets.delete_many({"email": email, "used": False})

    code = f"{secrets.randbelow(1000000):06d}"
    ticket = secrets.token_urlsafe(24)  # handed out only AFTER the code is verified
    await db.password_resets.insert_one({
        "id": new_id(),
        "user_id": user["id"],
        "email": email,
        "code": code,
        "code_expires_at": now_utc() + timedelta(minutes=FORGOT_CODE_TTL_MIN),
        "attempts": 0,
        "verified": False,
        "token": ticket,
        "used": False,
        "expires_at": now_utc() + timedelta(minutes=FORGOT_CODE_TTL_MIN + FORGOT_TICKET_TTL_MIN),  # TTL cleanup
        "created_at": now_utc(),
    })
    log.info("Password reset code requested for %s", email)

    email_sent = False
    try:
        message_id = await send_email(
            to=email,
            subject="Your Nek Sathi password reset code",
            html=password_reset_otp_html(code, expires_minutes=FORGOT_CODE_TTL_MIN),
        )
        email_sent = message_id is not None
    except Exception as _e:  # pragma: no cover
        log.warning("password reset email send crashed: %s", _e)

    return {
        "ok": True,
        "email": email,
        "dev_code": None if email_sent else code,  # shown on screen in DEMO mode
        "expires_in_minutes": FORGOT_CODE_TTL_MIN,
        "email_sent": email_sent,
    }


@router.post("/auth/forgot-password/verify")
@rate_limit("10/hour")
async def forgot_password_verify(request: Request, payload: ForgotVerifyIn):
    """Step 2 — check the emailed code (cross-check value + 5-min window).

    On success returns a one-time ``reset_ticket`` that the new-password popup
    uses in /auth/reset-password. The code itself is single-use.
    """
    email = payload.email.lower().strip()
    row = await db.password_resets.find_one({"email": email, "used": False, "verified": False})
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    if row.get("attempts", 0) >= FORGOT_MAX_ATTEMPTS:
        await db.password_resets.delete_one({"id": row["id"]})
        raise HTTPException(status_code=429, detail="Too many attempts — request a new code")
    code_exp = row["code_expires_at"]
    if code_exp.tzinfo is None:
        code_exp = code_exp.replace(tzinfo=timezone.utc)
    if code_exp < now_utc():
        raise HTTPException(status_code=400, detail="Code expired — request a new code")
    if (payload.code or "").strip() != row.get("code"):
        await db.password_resets.update_one({"id": row["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect code")
    # Verified — issue the reset ticket (valid 10 min).
    ticket_exp = now_utc() + timedelta(minutes=FORGOT_TICKET_TTL_MIN)
    await db.password_resets.update_one(
        {"id": row["id"]},
        {"$set": {"verified": True, "verified_at": now_utc(), "ticket_expires_at": ticket_exp, "expires_at": ticket_exp}},
    )
    return {"ok": True, "reset_ticket": row["token"], "expires_in_minutes": FORGOT_TICKET_TTL_MIN}


@router.post("/auth/reset-password")
@rate_limit("10/hour")
async def reset_password(request: Request, payload: ResetPasswordIn):
    """Step 3 — set the new password using the verified one-time reset ticket."""
    row = await db.password_resets.find_one({"token": payload.token, "verified": True, "used": False})
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset session")
    ticket_exp = row.get("ticket_expires_at") or row.get("expires_at")
    if ticket_exp.tzinfo is None:
        ticket_exp = ticket_exp.replace(tzinfo=timezone.utc)
    if ticket_exp < now_utc():
        raise HTTPException(status_code=400, detail="Reset session expired — start again")
    await db.users.update_one(
        {"id": row["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    await db.password_resets.update_one({"id": row["id"]}, {"$set": {"used": True, "used_at": now_utc()}})
    return {"ok": True}


def _valid_in_phone(raw: str) -> bool:
    """A valid Indian mobile: exactly 10 digits (optionally with +91 / 91 / 0
    prefix). Rejects anything shorter or longer so junk numbers can't register."""
    d = "".join(ch for ch in (raw or "") if ch.isdigit())
    if len(d) == 10:
        return d[0] in "6789"
    if len(d) == 11 and d.startswith("0"):
        return d[1] in "6789"
    if len(d) == 12 and d.startswith("91"):
        return d[2] in "6789"
    return False


@router.post("/auth/otp/request")
@rate_limit("5/minute")
async def otp_request(request: Request, payload: OtpRequestIn):
    if not _valid_in_phone(payload.phone):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number.")
    phone = _norm_phone(payload.phone)
    demo = await _otp_provider_mock()   # admin Demo toggle forces on-screen codes
    # WhatsApp OTP: we generate + store the code locally and deliver it over
    # WhatsApp via an approved template; verification is done locally.
    if not demo and comms.whatsapp_otp_live():
        code = f"{_random.randint(0, 999999):06d}"
        await db.otp_codes.update_one(
            {"phone": phone},
            {"$set": {"phone": phone, "code": code, "expires_at": now_utc() + timedelta(minutes=OTP_TTL_MIN), "created_at": now_utc()}},
            upsert=True,
        )
        try:  # pragma: no cover - live path
            await comms.send_whatsapp_otp(phone, code)
            return {"ok": True, "channel": "whatsapp", "dev_code": None, "live": True}
        except Exception as e:
            await db.otp_codes.delete_one({"phone": phone})
            raise HTTPException(status_code=400, detail=f"Could not send WhatsApp OTP: {e}")
    if not demo and _otp_live():
        try:  # pragma: no cover - live path
            await comms.send_otp(phone)
            return {"ok": True, "channel": "sms", "dev_code": None, "live": True}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not send OTP: {e}")
    # DEV / MOCK fallback
    code = f"{_random.randint(0, 999999):06d}"
    await db.otp_codes.update_one(
        {"phone": phone},
        {"$set": {"phone": phone, "code": code, "expires_at": now_utc() + timedelta(minutes=OTP_TTL_MIN), "created_at": now_utc()}},
        upsert=True,
    )
    log.info("[OTP MOCK] %s -> %s", phone, code)
    return {"ok": True, "channel": "mock", "dev_code": code, "live": False}


@router.post("/auth/otp/verify", response_model=TokenOut)
@rate_limit("10/minute")
async def otp_verify(request: Request, payload: OtpVerifyIn):
    if not _valid_in_phone(payload.phone):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number.")
    phone = _norm_phone(payload.phone)
    demo = await _otp_provider_mock()
    ok = False
    # Verify against the channel that ISSUED the code. WhatsApp OTP is
    # self-generated + stored locally, so it must be verified locally even when
    # MSG91 SMS-OTP (otp_live) is also configured. Only SMS-OTP uses MSG91 verify.
    if not demo and comms.whatsapp_otp_live():
        row = await db.otp_codes.find_one({"phone": phone})
        if row:
            exp = row["expires_at"]
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            ok = row.get("code") == payload.code and exp >= now_utc()
    elif not demo and _otp_live():
        try:  # pragma: no cover - live path
            ok = await comms.verify_otp(phone, payload.code)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"OTP verify failed: {e}")
    else:
        row = await db.otp_codes.find_one({"phone": phone})
        if row:
            exp = row["expires_at"]
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            ok = row.get("code") == payload.code and exp >= now_utc()
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    await db.otp_codes.delete_many({"phone": phone})
    # Match by canonical phone key so a returning user (whether they first signed
    # up by email+phone or earlier by OTP) lands on their SAME account with all
    # their past data — no duplicate empty account. Fall back to legacy raw-phone
    # match for any pre-migration doc that still lacks phone_norm.
    user = await db.users.find_one({"phone_norm": phone}) or await db.users.find_one({"phone": phone})
    is_new = user is None
    if not user:
        # Store the number in +91XXXXXXXXXX form; keep phone_norm (digits) as the
        # match key. NO synthetic email — a first-time user has no email until
        # they add a real one on the Profile page (email stays unset).
        digits = "".join(ch for ch in phone if ch.isdigit())
        last10 = digits[-10:] if len(digits) >= 10 else digits
        user = {
            "id": new_id(),
            "name": "Nek Sathi User",
            "phone": "+91" + last10, "phone_norm": phone, "phone_verified": True,
            "password_hash": "", "is_admin": False,
            "suspended": False, "auth": "otp", "created_at": now_utc(),
        }
        await db.users.insert_one(dict(user))
    elif not user.get("phone_verified") or not user.get("phone_norm"):
        # Receiving the OTP on this number proves ownership -> mark verified.
        await db.users.update_one({"id": user["id"]}, {"$set": {"phone_norm": phone, "phone_verified": True}})
        user["phone_norm"] = phone
        user["phone_verified"] = True
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")
    token = create_access_token(user["id"])
    return TokenOut(access_token=token, user=to_user_out(user), is_new=is_new)


@router.post("/auth/phone/verify/request")
@rate_limit("5/minute")
async def phone_verify_request(request: Request, payload: PhoneOtpRequestIn, user: dict = Depends(current_user)):
    raw = (payload.phone or user.get("phone") or "").strip()
    norm = canon_phone(raw)
    if len(norm) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    # A number can be verified on only ONE account (prevents the dup-account /
    # cross-login confusion this whole feature is meant to kill).
    other = await db.users.find_one({"phone_norm": norm, "phone_verified": True, "id": {"$ne": user["id"]}})
    if other:
        raise HTTPException(status_code=409, detail="This mobile number is already verified on another account")
    res = await _issue_phone_otp(norm)
    await db.users.update_one({"id": user["id"]}, {"$set": {"phone_pending": raw, "phone_pending_norm": norm}})
    return {"ok": True, "channel": res["channel"], "dev_code": res["dev_code"], "live": res["live"]}


@router.post("/auth/phone/verify/confirm", response_model=UserOut)
@rate_limit("10/minute")
async def phone_verify_confirm(request: Request, payload: PhoneOtpConfirmIn, user: dict = Depends(current_user)):
    row = await db.users.find_one({"id": user["id"]})
    raw = (payload.phone or (row or {}).get("phone_pending") or (row or {}).get("phone") or "").strip()
    norm = canon_phone(raw)
    if not await _consume_phone_otp(norm, payload.code.strip()):
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    other = await db.users.find_one({"phone_norm": norm, "phone_verified": True, "id": {"$ne": user["id"]}})
    if other:
        raise HTTPException(status_code=409, detail="This mobile number is already verified on another account")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"phone": raw, "phone_norm": norm, "phone_verified": True},
         "$unset": {"phone_pending": "", "phone_pending_norm": ""}},
    )
    fresh = await db.users.find_one({"id": user["id"]})
    return to_user_out(fresh)


@router.post("/auth/email/verify/request")
@rate_limit("5/minute")
async def email_verify_request(request: Request, payload: EmailOtpRequestIn, user: dict = Depends(current_user)):
    new_email = payload.email.lower().strip()
    # must not already belong to another account
    taken = await db.users.find_one({"email": new_email, "id": {"$ne": user["id"]}})
    if taken:
        raise HTTPException(status_code=409, detail="That email is already in use")
    res = await _issue_email_otp(new_email)
    await db.users.update_one({"id": user["id"]}, {"$set": {"email_pending": new_email}})
    return {"ok": True, "dev_code": res["dev_code"], "email_sent": res["email_sent"]}


@router.post("/auth/email/verify/confirm", response_model=UserOut)
@rate_limit("10/minute")
async def email_verify_confirm(request: Request, payload: EmailOtpConfirmIn, user: dict = Depends(current_user)):
    new_email = payload.email.lower().strip()
    if not await _consume_email_otp(new_email, payload.code.strip()):
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    taken = await db.users.find_one({"email": new_email, "id": {"$ne": user["id"]}})
    if taken:
        raise HTTPException(status_code=409, detail="That email is already in use")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"email": new_email, "email_verified": True}, "$unset": {"email_pending": ""}},
    )
    fresh = await db.users.find_one({"id": user["id"]})
    return to_user_out(fresh)
