from __future__ import annotations

from datetime import timedelta
import bcrypt
import jwt
from typing import Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, JWT_SECRET
from app.db import db
from app.schemas import NotifyPrefs, UserOut
from app.utils import clean, now_utc

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))


def canon_phone(p: Optional[str]) -> str:
    """Canonical phone key used for account matching + OTP.

    Digits only, India (+91) assumed. '+91 98123 45678', '098123 45678',
    '9812345678' and '919812345678' all collapse to one key (919812345678),
    so `phone_norm` is stable and mobile-OTP login reliably reconnects to the
    same account no matter how the number was typed.
    """
    digits = "".join(ch for ch in (p or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) == 10:                           # 9812345678
        return "91" + digits
    if len(digits) == 11 and digits.startswith("0"):  # 09812345678 (trunk 0)
        return "91" + digits[1:]
    if len(digits) == 12 and digits.startswith("91"):  # 919812345678
        return digits
    if len(digits) == 13 and digits.startswith("910"):  # 9109812345678
        return "91" + digits[3:]
    return digits.lstrip("0") or digits


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")
    return clean(user)


async def require_admin(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def _prefs(u: Optional[dict]) -> dict:
    """Notification preferences for a user doc, merged with defaults."""
    base = NotifyPrefs().model_dump()
    if u:
        base.update(u.get("notify_prefs") or {})
    return base


def to_user_out(u: dict) -> UserOut:
    return UserOut(
        id=u["id"],
        email=u["email"],
        name=u["name"],
        email_verified=bool(u.get("email_verified", False)),
        phone=u["phone"],
        phone_verified=bool(u.get("phone_verified", False)),
        is_admin=bool(u.get("is_admin", False)),
        is_dealer=bool(u.get("is_dealer", False)),
        vendor_id=u.get("vendor_id"),
        is_org=bool(u.get("is_org", False)),
        org_id=u.get("org_id"),
        suspended=bool(u.get("suspended", False)),
        notify_prefs=NotifyPrefs(**{**NotifyPrefs().model_dump(), **(u.get("notify_prefs") or {})}),
        avatar_base64=u.get("avatar_base64"),
    )


async def require_dealer(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_dealer") or not user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Dealer access only")
    vendor = await db.vendors.find_one({"id": user["vendor_id"]})
    if vendor is not None and vendor.get("active") is False:
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Please contact the admin.")
    return user
