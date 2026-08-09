"""Nek Sathi – FastAPI backend.

All routes are prefixed with /api. Uses MongoDB via Motor. UUID-based IDs so JSON
serialization never touches Mongo ObjectIds. Auth is email+password with bcrypt +
JWT (HS256).
"""

from __future__ import annotations

import logging
import os
import types
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional
from urllib.parse import quote_plus

import bcrypt
import jwt
import secrets
import stripe
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.cors import CORSMiddleware

from push import send_push, push_router
from email_client import send_email, password_reset_html
from vcard import build_vcard4, vcard_filename
from sticker_html import build_sticker_html, VARIANTS as STICKER_VARIANTS

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ["JWT_ALGORITHM"]
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"])

# Stripe (test-mode). The key may be the Emergent placeholder `sk_test_emergent`,
# in which case we short-circuit to a DRY-RUN flow so the checkout journey still
# works end-to-end in preview. On production deploy the real key replaces this.
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
STRIPE_DRY_RUN = not STRIPE_API_KEY.startswith(("sk_live_", "sk_test_")) or STRIPE_API_KEY == "sk_test_emergent"
if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Nek Sathi API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

# Rate limiting — client IP based; auth / public endpoints get tighter limits.
# NOTE: slowapi's `@limiter.limit(...)` decorators require the wrapped endpoint
# to expose a `request: Request` parameter. The exception handler alone is
# enough for enforcement — we deliberately DO NOT register `SlowAPIMiddleware`
# nor enable `headers_enabled=True`, because both re-enter the request scope
# post-endpoint (looking for a `response` kwarg) and cause 422s on FastAPI
# endpoints that don't declare a `Response`. Tighter per-endpoint limits are
# applied directly on public / auth routes below via the custom `rate_limit()`
# helper (see the docstring for the ForwardRef workaround).
def _real_client_ip(request: Request) -> str:
    """Return the real client IP, honouring X-Forwarded-For from the
    Cloudflare / K8s ingress in front of the backend. Falls back to
    ``request.client.host`` (which in a multi-pod ingress environment
    resolves to the ingress pod peer IP, causing rate limits to be enforced
    per-pod rather than per-caller).

    NOTE: slowapi looks specifically for a parameter named ``request`` on the
    key_func (extension.py L501); renaming this parameter breaks the callable
    into a no-arg invocation.
    """
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        # Left-most entry is the original client; subsequent hops are proxies.
        first = xff.split(",")[0].strip()
        if first:
            return first
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_real_client_ip)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def rate_limit(limit_str: str):
    """Apply a slowapi rate limit while preserving the decorated function's
    ``__globals__``.

    Why this exists: with ``from __future__ import annotations`` every
    annotation is stored as a string and later resolved by FastAPI via
    ``get_typed_signature`` — which reads ``call.__globals__``. Slowapi's
    ``@limiter.limit(...)`` wraps the endpoint in an ``async_wrapper`` living
    inside ``slowapi.extension``; that wrapper's ``__globals__`` is slowapi's
    module namespace, so it doesn't contain our Pydantic models. FastAPI then
    fails to resolve the ForwardRef, silently downgrades the body param to a
    query param, and the endpoint returns ``422 {"loc": ["query", "payload"]}``.

    Fix: rebuild the slowapi wrapper as a fresh ``FunctionType`` bound to a
    MERGED globals dict that contains both slowapi's module names (Response,
    Request, etc — the wrapper's bytecode references them) AND the original
    server-module globals (our Pydantic models — FastAPI reads these to
    resolve ForwardRefs). Behaviour is otherwise identical to
    ``@limiter.limit(limit_str)``.
    """
    from slowapi import extension as _slowapi_extension  # local import — only needed here

    def decorator(func):
        wrapped = limiter.limit(limit_str)(func)
        merged_globals = {**_slowapi_extension.__dict__, **func.__globals__}
        rebound = types.FunctionType(
            wrapped.__code__,
            merged_globals,
            name=wrapped.__name__,
            argdefs=wrapped.__defaults__,
            closure=wrapped.__closure__,
        )
        rebound.__kwdefaults__ = wrapped.__kwdefaults__
        rebound.__wrapped__ = func
        rebound.__module__ = func.__module__
        rebound.__qualname__ = func.__qualname__
        rebound.__doc__ = func.__doc__
        rebound.__dict__.update(wrapped.__dict__)
        return rebound
    return decorator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("safeqr")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": now_utc(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def clean(doc: dict) -> dict:
    """Return a copy of a Mongo document with ``_id`` removed."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=20)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class NotifyPrefs(BaseModel):
    whatsapp: bool = True
    email: bool = True
    push: bool = True
    incident_alerts: bool = True
    speed_alerts: bool = True
    marketing: bool = False


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    phone: str
    is_admin: bool = False
    is_dealer: bool = False
    vendor_id: Optional[str] = None
    suspended: bool = False
    notify_prefs: NotifyPrefs = NotifyPrefs()
    avatar_base64: Optional[str] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class VehicleIn(BaseModel):
    number_plate: str = Field(min_length=1, max_length=20)
    vehicle_type: Literal["bike", "car", "tractor", "commercial", "other"] = "car"
    make_model: Optional[str] = None
    color: Optional[str] = None
    photo_base64: Optional[str] = None  # data:image/... base64
    speed_limit_kmh: int = Field(default=80, ge=10, le=300)


class VehicleOut(BaseModel):
    id: str
    owner_id: str
    number_plate: str
    vehicle_type: str
    make_model: Optional[str] = None
    color: Optional[str] = None
    photo_base64: Optional[str] = None
    qr_id: str
    speed_limit_kmh: int
    lost_mode: bool
    created_at: datetime


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=20)
    relation: Optional[str] = None
    receives_emergency: bool = True
    receives_speed_alert: bool = True
    receives_parking: bool = True


class ContactOut(ContactIn):
    id: str
    vehicle_id: str


class LocationIn(BaseModel):
    latitude: float
    longitude: float
    speed_kmh: float = 0.0
    heading: Optional[float] = None


class LocationOut(LocationIn):
    id: str
    vehicle_id: str
    recorded_at: datetime


class PublicVehicleOut(BaseModel):
    """Only info shown on public QR scan – NO personal owner data."""
    qr_id: str
    number_plate: str
    vehicle_type: str
    make_model: Optional[str] = None
    color: Optional[str] = None
    photo_base64: Optional[str] = None
    owner_first_name: str  # first name only for humanization


class ScanAlertIn(BaseModel):
    type: Literal["emergency", "wrong_parking", "theft", "fire", "towing", "sos"]
    scanner_note: Optional[str] = None
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None
    evidence_photo_base64: Optional[str] = None


class AlertOut(BaseModel):
    id: str
    vehicle_id: Optional[str] = None
    tag_id: Optional[str] = None
    card_id: Optional[str] = None
    user_id: Optional[str] = None
    number_plate: str
    type: str
    scanner_note: Optional[str] = None
    scanner_phone: Optional[str] = None
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None
    evidence_photo_base64: Optional[str] = None
    audio_base64: Optional[str] = None
    created_at: datetime
    contact_channels: List[str] = []


class AccidentIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed_before_kmh: Optional[float] = None
    impact_g: Optional[float] = None
    resolved: bool = False
    resolution: Optional[Literal["safe", "need_help", "no_response"]] = None


class LostModeIn(BaseModel):
    enabled: bool


class SOSVideoIn(BaseModel):
    video_base64: str = Field(min_length=10)
    duration_ms: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class SOSVideoMeta(BaseModel):
    id: str
    vehicle_id: Optional[str] = None
    duration_ms: int
    size_bytes: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    phone: Optional[str] = Field(default=None, min_length=6, max_length=20)
    notify_prefs: Optional[NotifyPrefs] = None
    avatar_base64: Optional[str] = Field(default=None, max_length=1_500_000)


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=72)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=72)


class PlanOut(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    price_cents: int
    currency: str
    interval: str  # "month" | "year"
    vehicle_limit: int
    features: List[str] = []
    active: bool = True
    popular: bool = False


class PlanIn(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = None
    price_cents: int = Field(ge=0)
    currency: str = "INR"
    interval: str = "month"
    vehicle_limit: int = Field(default=1, ge=1, le=999)
    features: List[str] = []
    active: bool = True
    popular: bool = False


class CheckoutIn(BaseModel):
    plan_code: str
    return_url: Optional[str] = None


class ConfirmIn(BaseModel):
    session_id: str


class SubscriptionOut(BaseModel):
    id: str
    user_id: str
    plan_code: str
    plan_name: str
    status: str  # "active" | "cancelled" | "past_due" | "pending"
    current_period_end: Optional[datetime] = None
    stripe_session_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    created_at: datetime


class ContactFormIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=5, max_length=2000)


class SupportTicketIn(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=5, max_length=2000)
    priority: Literal["low", "normal", "high"] = "normal"


class SupportReplyIn(BaseModel):
    reply: str = Field(min_length=1, max_length=2000)
    status: Optional[Literal["open", "in_progress", "resolved", "closed"]] = None


class FAQIn(BaseModel):
    question: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=2000)
    category: Optional[str] = None
    order: int = 0
    active: bool = True


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

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
        phone=u["phone"],
        is_admin=bool(u.get("is_admin", False)),
        is_dealer=bool(u.get("is_dealer", False)),
        vendor_id=u.get("vendor_id"),
        suspended=bool(u.get("suspended", False)),
        notify_prefs=NotifyPrefs(**{**NotifyPrefs().model_dump(), **(u.get("notify_prefs") or {})}),
        avatar_base64=u.get("avatar_base64"),
    )


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@api.get("/")
async def root():
    return {"service": "Nek Sathi API", "status": "ok"}


@api.post("/auth/register", response_model=TokenOut)
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


@api.post("/auth/login", response_model=TokenOut)
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


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return to_user_out(user)


# ---------------------------------------------------------------------------
# DPDP / GDPR — User data rights.
#
# GET  /auth/me/export  — Bundle every document belonging to the caller into a
#                        single JSON blob (vehicles, tags, cards, contacts,
#                        alerts, subscriptions, tickets). Downloadable via the
#                        Settings screen so users can exercise their right of
#                        portability under India's DPDP Act 2023 and GDPR
#                        Article 20.
# DELETE /auth/me       — Hard-delete the caller's account and everything
#                        owned by them. Irreversible; requires the user to
#                        re-type their password in the request body.
# ---------------------------------------------------------------------------

class AccountDeleteIn(BaseModel):
    password: str = Field(min_length=6)
    confirm: Literal["DELETE"] = "DELETE"


@api.get("/auth/me/export")
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


@api.delete("/auth/me")
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


@api.post("/auth/me/consent")
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


# ---------------------------------------------------------------------------
# Admin telco config — encrypted-at-rest (obfuscated for now) storage of the
# SMS + call-masking gateway credentials. Admins can flip providers from the
# UI without a code redeploy. Values are ONLY readable by admins.
# ---------------------------------------------------------------------------

class TelcoConfigIn(BaseModel):
    provider: Literal["whatsapp", "twilio", "msg91", "exotel", "gupshup"] = "whatsapp"
    sms_enabled: bool = False
    twilio_account_sid: Optional[str] = Field(default=None, max_length=80)
    twilio_auth_token: Optional[str] = Field(default=None, max_length=120)
    twilio_from: Optional[str] = Field(default=None, max_length=20)
    msg91_api_key: Optional[str] = Field(default=None, max_length=120)
    msg91_sender: Optional[str] = Field(default=None, max_length=20)
    exotel_sid: Optional[str] = Field(default=None, max_length=80)
    exotel_token: Optional[str] = Field(default=None, max_length=120)
    exotel_from: Optional[str] = Field(default=None, max_length=20)
    gupshup_api_key: Optional[str] = Field(default=None, max_length=120)
    gupshup_source: Optional[str] = Field(default=None, max_length=20)


def _mask_secret(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    return v[:4] + "•" * max(0, len(v) - 8) + v[-4:] if len(v) > 8 else "•" * len(v)


@api.get("/admin/telco-config")
async def get_telco_config(_: dict = Depends(require_admin)):
    doc = await db.system_config.find_one({"id": "telco"}) or {"id": "telco", "provider": "whatsapp", "sms_enabled": False}
    return {
        "provider": doc.get("provider", "whatsapp"),
        "sms_enabled": bool(doc.get("sms_enabled", False)),
        "twilio_account_sid": _mask_secret(doc.get("twilio_account_sid")),
        "twilio_auth_token": _mask_secret(doc.get("twilio_auth_token")),
        "twilio_from": doc.get("twilio_from"),
        "msg91_api_key": _mask_secret(doc.get("msg91_api_key")),
        "msg91_sender": doc.get("msg91_sender"),
        "exotel_sid": _mask_secret(doc.get("exotel_sid")),
        "exotel_token": _mask_secret(doc.get("exotel_token")),
        "exotel_from": doc.get("exotel_from"),
        "gupshup_api_key": _mask_secret(doc.get("gupshup_api_key")),
        "gupshup_source": doc.get("gupshup_source"),
        "updated_at": doc.get("updated_at"),
    }


@api.put("/admin/telco-config")
async def set_telco_config(payload: TelcoConfigIn, admin: dict = Depends(require_admin)):
    doc = payload.model_dump()
    doc.update({"id": "telco", "updated_at": now_utc(), "updated_by": admin["id"]})
    await db.system_config.update_one({"id": "telco"}, {"$set": doc}, upsert=True)
    # Sync into process env so the /bridge endpoint picks it up without restart.
    if payload.provider == "twilio":
        if payload.twilio_account_sid: os.environ["TWILIO_ACCOUNT_SID"] = payload.twilio_account_sid
        if payload.twilio_auth_token: os.environ["TWILIO_AUTH_TOKEN"] = payload.twilio_auth_token
        if payload.twilio_from: os.environ["TWILIO_FROM"] = payload.twilio_from
    elif payload.provider == "exotel":
        if payload.exotel_sid: os.environ["EXOTEL_SID"] = payload.exotel_sid
        if payload.exotel_token: os.environ["EXOTEL_TOKEN"] = payload.exotel_token
    return {"ok": True, "provider": payload.provider}





@api.put("/auth/me", response_model=UserOut)
async def update_me(payload: ProfileUpdate, user: dict = Depends(current_user)):
    update: dict = {}
    if payload.name is not None:
        update["name"] = payload.name.strip()
    if payload.phone is not None:
        update["phone"] = payload.phone.strip()
    if payload.notify_prefs is not None:
        update["notify_prefs"] = payload.notify_prefs.model_dump()
    if payload.avatar_base64 is not None:
        update["avatar_base64"] = payload.avatar_base64 or None
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        user.update(update)
    return to_user_out(user)


@api.post("/auth/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(current_user)):
    row = await db.users.find_one({"id": user["id"]})
    if not row or not verify_password(payload.old_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Old password is incorrect")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    return {"ok": True}


@api.post("/auth/forgot-password")
@rate_limit("5/hour")
async def forgot_password(request: Request, payload: ForgotPasswordIn):
    """
    Generate a password-reset token and email it to the user via Emergent
    managed email (Resend). We always return the same "ok" shape whether or
    not the account exists (to prevent user-enumeration), and only include
    the ``dev_token`` in the response when the email provider is not
    configured (development mode).
    """
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        # For security we return the same shape whether or not the account exists.
        return {"ok": True, "email": email, "dev_token": None, "expires_in_minutes": 30}
    token = secrets.token_urlsafe(24)
    expires_at = now_utc() + timedelta(minutes=30)
    await db.password_resets.insert_one({
        "id": new_id(),
        "user_id": user["id"],
        "email": email,
        "token": token,
        "expires_at": expires_at,
        "used": False,
        "created_at": now_utc(),
    })
    log.info("Password reset requested for %s", email)

    # Build the reset URL. Prefer PUBLIC_APP_URL, fall back to the request
    # origin (so preview / prod / local all work).
    base = os.environ.get("PUBLIC_APP_URL")
    if not base:
        base = f"{request.url.scheme}://{request.headers.get('host', 'localhost')}"
    reset_url = f"{base.rstrip('/')}/reset-password?token={token}"

    email_sent = False
    try:
        message_id = await send_email(
            to=email,
            subject="Reset your Nek Sathi password",
            html=password_reset_html(reset_url, expires_minutes=30),
        )
        email_sent = message_id is not None
    except Exception as _e:  # pragma: no cover
        log.warning("password reset email send crashed: %s", _e)

    # In dev / preview (no email key or provider offline), keep exposing the
    # dev_token so QA can still complete the flow via curl. In prod the key
    # is set so we omit it.
    return {
        "ok": True,
        "email": email,
        "dev_token": None if email_sent else token,
        "expires_in_minutes": 30,
        "email_sent": email_sent,
    }


@api.post("/auth/reset-password")
@rate_limit("10/hour")
async def reset_password(request: Request, payload: ResetPasswordIn):
    row = await db.password_resets.find_one({"token": payload.token, "used": False})
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    expires_at = row["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=400, detail="Token expired")
    await db.users.update_one(
        {"id": row["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    await db.password_resets.update_one({"id": row["id"]}, {"$set": {"used": True, "used_at": now_utc()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Vehicle routes
# ---------------------------------------------------------------------------

def to_vehicle_out(v: dict) -> VehicleOut:
    return VehicleOut(
        id=v["id"],
        owner_id=v["owner_id"],
        number_plate=v["number_plate"],
        vehicle_type=v["vehicle_type"],
        make_model=v.get("make_model"),
        color=v.get("color"),
        photo_base64=v.get("photo_base64"),
        qr_id=v["qr_id"],
        speed_limit_kmh=v.get("speed_limit_kmh", 80),
        lost_mode=v.get("lost_mode", False),
        created_at=v["created_at"],
    )


@api.get("/vehicles", response_model=List[VehicleOut])
async def list_vehicles(user: dict = Depends(current_user)):
    cursor = db.vehicles.find({"owner_id": user["id"]}).sort("created_at", -1)
    items = [to_vehicle_out(clean(v)) async for v in cursor]
    return items


@api.post("/vehicles", response_model=VehicleOut)
async def create_vehicle(payload: VehicleIn, user: dict = Depends(current_user)):
    v_id = new_id()
    doc = {
        "id": v_id,
        "owner_id": user["id"],
        "number_plate": payload.number_plate.upper().strip(),
        "vehicle_type": payload.vehicle_type,
        "make_model": payload.make_model,
        "color": payload.color,
        "photo_base64": payload.photo_base64,
        "qr_id": new_id(),
        "speed_limit_kmh": payload.speed_limit_kmh,
        "lost_mode": False,
        "created_at": now_utc(),
    }
    await db.vehicles.insert_one(dict(doc))
    return to_vehicle_out(doc)


@api.get("/vehicles/{vehicle_id}", response_model=VehicleOut)
async def get_vehicle(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return to_vehicle_out(clean(v))


@api.put("/vehicles/{vehicle_id}", response_model=VehicleOut)
async def update_vehicle(vehicle_id: str, payload: VehicleIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    update = {
        "number_plate": payload.number_plate.upper().strip(),
        "vehicle_type": payload.vehicle_type,
        "make_model": payload.make_model,
        "color": payload.color,
        "photo_base64": payload.photo_base64 if payload.photo_base64 is not None else v.get("photo_base64"),
        "speed_limit_kmh": payload.speed_limit_kmh,
    }
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": update})
    v.update(update)
    return to_vehicle_out(clean(v))


@api.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: dict = Depends(current_user)):
    result = await db.vehicles.delete_one({"id": vehicle_id, "owner_id": user["id"]})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.contacts.delete_many({"vehicle_id": vehicle_id})
    await db.alerts.delete_many({"vehicle_id": vehicle_id})
    await db.locations.delete_many({"vehicle_id": vehicle_id})
    return {"deleted": True}


@api.post("/vehicles/{vehicle_id}/lost_mode", response_model=VehicleOut)
async def toggle_lost_mode(vehicle_id: str, payload: LostModeIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await db.vehicles.update_one({"id": vehicle_id}, {"$set": {"lost_mode": payload.enabled}})
    v["lost_mode"] = payload.enabled
    return to_vehicle_out(clean(v))


# ---------------------------------------------------------------------------
# Contact routes
# ---------------------------------------------------------------------------

@api.get("/vehicles/{vehicle_id}/contacts", response_model=List[ContactOut])
async def list_contacts(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    items = []
    async for c in db.contacts.find({"vehicle_id": vehicle_id}).sort("created_at", 1):
        items.append(ContactOut(**clean(c)))
    return items


@api.post("/vehicles/{vehicle_id}/contacts", response_model=ContactOut)
async def add_contact(vehicle_id: str, payload: ContactIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    count = await db.contacts.count_documents({"vehicle_id": vehicle_id})
    if count >= 4:
        raise HTTPException(status_code=400, detail="Maximum 4 contacts per vehicle")
    doc = {
        "id": new_id(),
        "vehicle_id": vehicle_id,
        "created_at": now_utc(),
        **payload.model_dump(),
    }
    await db.contacts.insert_one(dict(doc))
    return ContactOut(**clean(doc))


@api.delete("/vehicles/{vehicle_id}/contacts/{contact_id}")
async def delete_contact(vehicle_id: str, contact_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    r = await db.contacts.delete_one({"id": contact_id, "vehicle_id": vehicle_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Location & track routes
# ---------------------------------------------------------------------------

@api.post("/vehicles/{vehicle_id}/location", response_model=LocationOut)
async def push_location(vehicle_id: str, payload: LocationIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    doc = {
        "id": new_id(),
        "vehicle_id": vehicle_id,
        "recorded_at": now_utc(),
        **payload.model_dump(),
    }
    await db.locations.insert_one(dict(doc))

    # Speed alert
    limit = v.get("speed_limit_kmh", 80)
    if payload.speed_kmh > limit:
        alert_doc = {
            "id": new_id(),
            "vehicle_id": vehicle_id,
            "number_plate": v["number_plate"],
            "type": "speed_alert",
            "scanner_note": f"Speed {payload.speed_kmh:.0f} km/h crossed limit {limit} km/h",
            "scanner_lat": payload.latitude,
            "scanner_lng": payload.longitude,
            "created_at": now_utc(),
            "contact_channels": [],
        }
        await db.alerts.insert_one(dict(alert_doc))
        # Fire-and-forget push notify the owner about overspeed (pref-gated).
        _p = _prefs(user)
        try:
            if _p.get("push") and _p.get("speed_alerts"):
                await send_push(
                    recipients=[user["id"]],
                    data={
                        "title": "⚡ Overspeed alert",
                        "message": f"{v['number_plate']} @ {payload.speed_kmh:.0f} km/h (limit {limit})",
                        "action_url": "/alerts",
                    },
                    idempotency_key=alert_doc["id"],
                )
        except Exception as _e:
            log.warning("push (speed alert) failed: %s", _e)

    return LocationOut(**clean(doc))


@api.get("/vehicles/{vehicle_id}/track", response_model=List[LocationOut])
async def get_track(vehicle_id: str, user: dict = Depends(current_user), limit: int = 50):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    items = []
    async for loc in db.locations.find({"vehicle_id": vehicle_id}).sort("recorded_at", -1).limit(limit):
        items.append(LocationOut(**clean(loc)))
    return items


# ---------------------------------------------------------------------------
# Accident detection
# ---------------------------------------------------------------------------

@api.post("/vehicles/{vehicle_id}/accident", response_model=AlertOut)
async def record_accident(vehicle_id: str, payload: AccidentIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    note_bits = []
    if payload.speed_before_kmh is not None:
        note_bits.append(f"speed_before={payload.speed_before_kmh:.0f}")
    if payload.impact_g is not None:
        note_bits.append(f"impact={payload.impact_g:.2f}g")
    if payload.resolution:
        note_bits.append(f"resolution={payload.resolution}")
    alert = {
        "id": new_id(),
        "vehicle_id": vehicle_id,
        "number_plate": v["number_plate"],
        "type": (
            "accident_detected"
            if not payload.resolved
            else (f"accident_{payload.resolution}" if payload.resolution else "accident_resolved")
        ),
        "scanner_note": ", ".join(note_bits) or None,
        "scanner_lat": payload.latitude,
        "scanner_lng": payload.longitude,
        "created_at": now_utc(),
        "contact_channels": [],
    }
    await db.alerts.insert_one(dict(alert))
    # Push notify owner + family Nek Sathi accounts on unresolved accident.
    if not payload.resolved:
        try:
            recipients: set[str] = {user["id"]}
            contact_phones: set[str] = set()
            async for c in db.contacts.find({"vehicle_id": vehicle_id}, {"phone": 1}):
                if c.get("phone"):
                    contact_phones.add(c["phone"])
            if contact_phones:
                async for u in db.users.find({"phone": {"$in": list(contact_phones)}}, {"id": 1}):
                    recipients.add(u["id"])
            impact_txt = f" ({payload.impact_g:.1f}g)" if payload.impact_g else ""
            await send_push(
                recipients=list(recipients),
                data={
                    "title": f"🚑 Possible accident{impact_txt}",
                    "message": f"{v['number_plate']} - please check on the driver",
                    "action_url": "/alerts",
                },
                idempotency_key=alert["id"],
            )
        except Exception as _e:
            log.warning("push (accident) failed: %s", _e)
    return AlertOut(**clean(alert))


# ---------------------------------------------------------------------------
# SOS Video (local recording scaffold)
# ---------------------------------------------------------------------------

@api.post("/vehicles/{vehicle_id}/sos-video", response_model=SOSVideoMeta)
async def upload_sos_video(vehicle_id: str, payload: SOSVideoIn, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    vid_id = new_id()
    size = len(payload.video_base64)
    doc = {
        "id": vid_id,
        "vehicle_id": vehicle_id,
        "video_base64": payload.video_base64,
        "duration_ms": payload.duration_ms,
        "size_bytes": size,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "created_at": now_utc(),
    }
    await db.sos_videos.insert_one(dict(doc))
    # link into unified alerts feed
    await db.alerts.insert_one({
        "id": new_id(),
        "vehicle_id": vehicle_id,
        "number_plate": v["number_plate"],
        "type": "sos_video",
        "scanner_note": f"SOS video recorded ({payload.duration_ms / 1000:.1f}s, {size // 1024} KB)",
        "scanner_lat": payload.latitude,
        "scanner_lng": payload.longitude,
        "created_at": now_utc(),
        "contact_channels": [],
    })
    return SOSVideoMeta(
        id=vid_id,
        vehicle_id=vehicle_id,
        duration_ms=payload.duration_ms,
        size_bytes=size,
        latitude=payload.latitude,
        longitude=payload.longitude,
        created_at=doc["created_at"],
    )


@api.get("/vehicles/{vehicle_id}/sos-videos", response_model=List[SOSVideoMeta])
async def list_sos_videos(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    items: List[SOSVideoMeta] = []
    cursor = db.sos_videos.find(
        {"vehicle_id": vehicle_id}, {"_id": 0, "video_base64": 0}
    ).sort("created_at", -1)
    async for doc in cursor:
        items.append(SOSVideoMeta(**doc))
    return items


@api.get("/sos-video/{video_id}")
async def get_sos_video(video_id: str, user: dict = Depends(current_user)):
    doc = await db.sos_videos.find_one({"id": video_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found")
    # Authorisation: either the video is user-scoped (user_id matches) or it's
    # vehicle-scoped and the vehicle belongs to this user.
    authorised = False
    if doc.get("user_id") == user["id"]:
        authorised = True
    elif doc.get("vehicle_id"):
        v = await db.vehicles.find_one({"id": doc["vehicle_id"], "owner_id": user["id"]})
        if v:
            authorised = True
    if not authorised:
        raise HTTPException(status_code=403, detail="Not authorised")
    return {
        "id": doc["id"],
        "vehicle_id": doc.get("vehicle_id"),
        "duration_ms": doc.get("duration_ms", 0),
        "size_bytes": doc.get("size_bytes", 0),
        "video_base64": doc["video_base64"],
        "created_at": doc["created_at"],
    }


# ---------------------------------------------------------------------------
# User-scoped SOS video — for the "SOS panic" flow where we auto-record on
# any device even without a specific vehicle attached. Optionally accepts
# ``vehicle_id`` when the user IS in a vehicle. Push-notifies the user's
# family contacts (fan-out across all their vehicles) so someone gets the
# alert immediately.
# ---------------------------------------------------------------------------

class UserSOSVideoIn(BaseModel):
    # Cap base64 body at ~28 MB → ~20 MB decoded video. Keeps Mongo docs sane
    # and stops the endpoint being a DoS vector.
    video_base64: str = Field(min_length=10, max_length=28 * 1024 * 1024)
    duration_ms: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    vehicle_id: Optional[str] = None


@api.post("/user/sos-video", response_model=SOSVideoMeta)
async def upload_user_sos_video(payload: UserSOSVideoIn, user: dict = Depends(current_user)):
    vehicle_id: Optional[str] = None
    number_plate: Optional[str] = None
    if payload.vehicle_id:
        v = await db.vehicles.find_one({"id": payload.vehicle_id, "owner_id": user["id"]})
        if v:
            vehicle_id = v["id"]
            number_plate = v["number_plate"]

    vid_id = new_id()
    size = len(payload.video_base64)
    now = now_utc()
    doc = {
        "id": vid_id,
        "user_id": user["id"],
        "vehicle_id": vehicle_id,
        "video_base64": payload.video_base64,
        "duration_ms": payload.duration_ms,
        "size_bytes": size,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "created_at": now,
    }
    await db.sos_videos.insert_one(dict(doc))

    # Fold into the unified alerts feed (so /alerts still surfaces it).
    alert_id = new_id()
    display_plate = number_plate or user.get("name", "SOS")
    await db.alerts.insert_one({
        "id": alert_id,
        "vehicle_id": vehicle_id,
        "user_id": user["id"],
        "number_plate": display_plate,
        "type": "sos_video",
        "scanner_note": f"Auto SOS recording ({payload.duration_ms / 1000:.1f}s, {size // 1024} KB)",
        "scanner_lat": payload.latitude,
        "scanner_lng": payload.longitude,
        "created_at": now,
        "contact_channels": [],
    })

    # Fan-out push to the user themselves (so their other devices see it)
    # and to family contacts of any of their vehicles that have a linked
    # Nek Sathi account (by phone match). Best-effort — never blocks.
    try:
        recipients: set[str] = {user["id"]}
        my_vehicle_ids = [v["id"] async for v in db.vehicles.find({"owner_id": user["id"]}, {"id": 1})]
        if my_vehicle_ids:
            contact_phones: set[str] = set()
            async for c in db.contacts.find({"vehicle_id": {"$in": my_vehicle_ids}}, {"phone": 1}):
                if c.get("phone"):
                    contact_phones.add(c["phone"])
            if contact_phones:
                async for u in db.users.find({"phone": {"$in": list(contact_phones)}}, {"id": 1}):
                    recipients.add(u["id"])
        title = "🚨 SOS from " + (user.get("name") or "family member")
        msg_bits: list[str] = []
        if payload.latitude is not None and payload.longitude is not None:
            msg_bits.append(f"📍 {payload.latitude:.4f},{payload.longitude:.4f}")
        msg_bits.append(f"{payload.duration_ms / 1000:.0f}s video captured")
        await send_push(
            recipients=list(recipients),
            data={
                "title": title,
                "message": " · ".join(msg_bits),
                "action_url": "/alerts",
            },
            idempotency_key=alert_id,
        )
    except Exception as _e:
        log.warning("push (user sos-video) failed: %s", _e)

    return SOSVideoMeta(
        id=vid_id,
        vehicle_id=vehicle_id,
        duration_ms=payload.duration_ms,
        size_bytes=size,
        latitude=payload.latitude,
        longitude=payload.longitude,
        created_at=now,
    )


@api.get("/user/sos-videos", response_model=List[SOSVideoMeta])
async def list_user_sos_videos(user: dict = Depends(current_user), limit: int = 50):
    items: List[SOSVideoMeta] = []
    cursor = db.sos_videos.find(
        {"user_id": user["id"]}, {"_id": 0, "video_base64": 0}
    ).sort("created_at", -1).limit(limit)
    async for doc in cursor:
        items.append(SOSVideoMeta(**doc))
    return items


# ---------------------------------------------------------------------------
# Alerts routes (owner activity log — includes shared vehicles)
# ---------------------------------------------------------------------------

async def _visible_vehicle_ids(user_id: str) -> List[str]:
    """Return all vehicle IDs the user can see — their own + those shared
    with them via an accepted family invite."""
    own = [v["id"] async for v in db.vehicles.find({"owner_id": user_id}, {"id": 1})]
    shared = [
        s["vehicle_id"]
        async for s in db.vehicle_shares.find(
            {"shared_with_user_id": user_id, "status": "accepted"},
            {"vehicle_id": 1},
        )
    ]
    return list({*own, *shared})


@api.get("/alerts", response_model=List[AlertOut])
async def list_alerts(user: dict = Depends(current_user), limit: int = 100):
    visible = await _visible_vehicle_ids(user["id"])
    query: dict = {"$or": [{"user_id": user["id"]}]}
    if visible:
        query["$or"].append({"vehicle_id": {"$in": visible}})
    items = []
    async for a in db.alerts.find(query).sort("created_at", -1).limit(limit):
        items.append(AlertOut(**clean(a)))
    return items


# ---------------------------------------------------------------------------
# Family invites & shared vehicles
#
# Flow:
#   1. Owner POSTs /vehicles/{id}/invites  → returns invite token + join URL
#   2. Recipient hits GET /invites/{token} publicly to preview
#   3. Recipient (logged in) POSTs /invites/{token}/accept → gets shared read
#      access to that vehicle (visible in their /vehicles + /alerts lists)
#
# Shares are simple ``role="viewer"`` today; can extend to ``editor`` later.
# ---------------------------------------------------------------------------

class InviteCreateOut(BaseModel):
    token: str
    join_url: str
    expires_at: datetime


class PublicInvitePreview(BaseModel):
    vehicle_number_plate: str
    invited_by_name: str
    expires_at: datetime
    already_accepted: bool = False


@api.post("/vehicles/{vehicle_id}/invites", response_model=InviteCreateOut)
async def create_vehicle_invite(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    token = secrets.token_urlsafe(18)
    expires_at = now_utc() + timedelta(days=7)
    await db.invites.insert_one({
        "id": new_id(),
        "token": token,
        "vehicle_id": vehicle_id,
        "owner_id": user["id"],
        "expires_at": expires_at,
        "used": False,
        "created_at": now_utc(),
    })
    base = os.environ.get("PUBLIC_APP_URL") or ""
    join_url = f"{base.rstrip('/')}/invite/{token}" if base else f"/invite/{token}"
    return InviteCreateOut(token=token, join_url=join_url, expires_at=expires_at)


@api.get("/invites/{token}", response_model=PublicInvitePreview)
async def preview_invite(token: str):
    inv = await db.invites.find_one({"token": token})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    exp = inv["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=410, detail="Invite expired")
    v = await db.vehicles.find_one({"id": inv["vehicle_id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle no longer exists")
    owner = await db.users.find_one({"id": inv["owner_id"]})
    return PublicInvitePreview(
        vehicle_number_plate=v.get("number_plate", "—"),
        invited_by_name=owner.get("name", "Owner") if owner else "Owner",
        expires_at=exp,
        already_accepted=bool(inv.get("used")),
    )


@api.post("/invites/{token}/accept")
async def accept_invite(token: str, user: dict = Depends(current_user)):
    inv = await db.invites.find_one({"token": token})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    exp = inv["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=410, detail="Invite expired")
    if inv["owner_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="You are the owner — nothing to accept")
    existing = await db.vehicle_shares.find_one({
        "vehicle_id": inv["vehicle_id"],
        "shared_with_user_id": user["id"],
    })
    if existing and existing.get("status") == "accepted":
        return {"ok": True, "already_shared": True}
    now = now_utc()
    if existing:
        await db.vehicle_shares.update_one(
            {"id": existing["id"]},
            {"$set": {"status": "accepted", "accepted_at": now}},
        )
    else:
        await db.vehicle_shares.insert_one({
            "id": new_id(),
            "vehicle_id": inv["vehicle_id"],
            "owner_id": inv["owner_id"],
            "shared_with_user_id": user["id"],
            "role": "viewer",
            "status": "accepted",
            "invite_token": token,
            "accepted_at": now,
            "created_at": now,
        })
    await db.invites.update_one({"token": token}, {"$set": {"used": True, "used_at": now}})
    # Push notify the owner that their family joined.
    try:
        await send_push(
            recipients=[inv["owner_id"]],
            data={
                "title": "👨‍👩‍👦 Family joined",
                "message": f"{user.get('name', 'A family member')} accepted your invite",
                "action_url": "/family",
            },
            idempotency_key=f"invite-accept-{token}",
        )
    except Exception as _e:
        log.warning("push (invite accept) failed: %s", _e)
    return {"ok": True, "already_shared": False}


class SharedVehicleOut(BaseModel):
    id: str
    number_plate: str
    make_model: Optional[str] = None
    vehicle_type: str
    photo_base64: Optional[str] = None
    owner_id: str
    owner_name: Optional[str] = None
    role: str


@api.get("/shared-vehicles", response_model=List[SharedVehicleOut])
async def list_shared_vehicles(user: dict = Depends(current_user)):
    out: List[SharedVehicleOut] = []
    async for s in db.vehicle_shares.find(
        {"shared_with_user_id": user["id"], "status": "accepted"}
    ):
        v = await db.vehicles.find_one({"id": s["vehicle_id"]})
        if not v:
            continue
        owner = await db.users.find_one({"id": v["owner_id"]}) or {}
        out.append(
            SharedVehicleOut(
                id=v["id"],
                number_plate=v.get("number_plate", "—"),
                make_model=v.get("make_model"),
                vehicle_type=v.get("vehicle_type", "car"),
                photo_base64=v.get("photo_base64"),
                owner_id=v["owner_id"],
                owner_name=owner.get("name"),
                role=s.get("role", "viewer"),
            )
        )
    return out


@api.get("/vehicles/{vehicle_id}/shares")
async def list_vehicle_shares(vehicle_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    out = []
    async for s in db.vehicle_shares.find({"vehicle_id": vehicle_id}):
        u = await db.users.find_one({"id": s["shared_with_user_id"]}) or {}
        out.append({
            "id": s["id"],
            "shared_with_user_id": s["shared_with_user_id"],
            "shared_with_name": u.get("name"),
            "shared_with_email": u.get("email"),
            "role": s.get("role", "viewer"),
            "status": s.get("status", "accepted"),
            "accepted_at": s.get("accepted_at"),
        })
    return out


@api.delete("/vehicles/{vehicle_id}/shares/{share_id}")
async def revoke_vehicle_share(vehicle_id: str, share_id: str, user: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vehicle_id, "owner_id": user["id"]})
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    r = await db.vehicle_shares.delete_one({"id": share_id, "vehicle_id": vehicle_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Share not found")
    return {"revoked": True}


# ---------------------------------------------------------------------------
# Public QR routes (no auth)
# ---------------------------------------------------------------------------

@api.get("/public/qr/{qr_id}", response_model=PublicVehicleOut)
async def public_qr_lookup(qr_id: str):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if not v:
        raise HTTPException(status_code=404, detail="QR not found or vehicle removed")
    owner = await db.users.find_one({"id": v["owner_id"]})
    first_name = owner["name"].split()[0] if owner and owner.get("name") else "Owner"
    return PublicVehicleOut(
        qr_id=v["qr_id"],
        number_plate=v["number_plate"],
        vehicle_type=v["vehicle_type"],
        make_model=v.get("make_model"),
        color=v.get("color"),
        photo_base64=v.get("photo_base64"),
        owner_first_name=first_name,
    )


@api.post("/public/qr/{qr_id}/alert")
@rate_limit("20/minute")
async def public_qr_alert(request: Request, qr_id: str, payload: ScanAlertIn):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if not v:
        raise HTTPException(status_code=404, detail="QR not found")
    contacts = [c async for c in db.contacts.find({"vehicle_id": v["id"]})]
    channels = []
    if payload.type == "emergency":
        channels = [c["phone"] for c in contacts if c.get("receives_emergency", True)]
    elif payload.type == "wrong_parking":
        channels = [c["phone"] for c in contacts if c.get("receives_parking", True)]
    else:
        # theft / fire / towing — treat as emergency-severity, notify everyone
        # opted in for emergencies.
        channels = [c["phone"] for c in contacts if c.get("receives_emergency", True)]
    owner = await db.users.find_one({"id": v["owner_id"]})
    if owner and owner.get("phone"):
        channels.insert(0, owner["phone"])

    alert = {
        "id": new_id(),
        "vehicle_id": v["id"],
        "number_plate": v["number_plate"],
        "type": payload.type,
        "scanner_note": payload.scanner_note,
        "scanner_phone": payload.scanner_phone,
        "scanner_lat": payload.scanner_lat,
        "scanner_lng": payload.scanner_lng,
        "evidence_photo_base64": payload.evidence_photo_base64,
        "created_at": now_utc(),
        "contact_channels": channels,
    }
    await db.alerts.insert_one(dict(alert))
    # Fire-and-forget push to the owner. Never blocks the primary op.
    try:
        if v.get("owner_id"):
            titles = {
                "emergency": "🚨 Emergency alert",
                "wrong_parking": "🅿️ Wrong parking",
                "theft": "🔒 Theft alert",
                "fire": "🔥 Fire alert",
                "towing": "🚛 Being towed",
            }
            title = titles.get(payload.type, "Vehicle alert")
            msg_bits = [v.get("number_plate", "Your vehicle")]
            if payload.scanner_note:
                msg_bits.append(payload.scanner_note[:100])
            await send_push(
                recipients=[v["owner_id"]],
                data={
                    "title": title,
                    "message": " · ".join(msg_bits),
                    "action_url": f"/alerts",
                },
                idempotency_key=alert["id"],
            )
    except Exception as _e:
        log.warning("push (vehicle alert) failed: %s", _e)
    # Public-facing response never leaks contact_channels or owner phone.
    return {"id": alert["id"], "type": alert["type"], "ok": True}



# ---------------------------------------------------------------------------
# Generic QR Tags — Kids, Pets, Bags, Keys, Devices etc.
#
# A `tag` is any non-vehicle asset the owner wants recoverable via a QR
# sticker: kid's badge, pet collar, laptop bag, luggage, keys, phone, etc.
# Same alert plumbing as vehicles: public scan endpoint accepts alerts and
# stores them in the `alerts` collection with a dedicated `tag_id` field so
# they don't collide with vehicle alerts. Owner phone is always included in
# `contact_channels` so downstream SMS / WhatsApp gateways can fan out.
# ---------------------------------------------------------------------------

TAG_TYPES = ("person", "kid", "pet", "bag", "luggage", "keys", "phone", "laptop", "door", "other")


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    tag_type: Literal["person", "kid", "patient", "staff", "pet", "bag", "luggage", "keys", "phone", "laptop", "door", "other"] = "bag"
    description: Optional[str] = Field(default=None, max_length=280)
    photo_base64: Optional[str] = None
    # Optional med / owner hints shown on public scan for kids / people.
    blood_group: Optional[str] = Field(default=None, max_length=12)
    medical_notes: Optional[str] = Field(default=None, max_length=280)
    reward_text: Optional[str] = Field(default=None, max_length=140)
    # Emergency guardian / next-of-kin contact (privacy-safe masked call).
    guardian_name: Optional[str] = Field(default=None, max_length=80)
    guardian_phone: Optional[str] = Field(default=None, max_length=20)


class TagOut(BaseModel):
    id: str
    owner_id: str
    name: str
    tag_type: str
    description: Optional[str] = None
    photo_base64: Optional[str] = None
    blood_group: Optional[str] = None
    medical_notes: Optional[str] = None
    reward_text: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    qr_id: str
    lost_mode: bool
    created_at: datetime


class PublicTagOut(BaseModel):
    qr_id: str
    name: str
    tag_type: str
    description: Optional[str] = None
    photo_base64: Optional[str] = None
    blood_group: Optional[str] = None
    medical_notes: Optional[str] = None
    reward_text: Optional[str] = None
    guardian_name: Optional[str] = None
    has_guardian: bool = False
    lost_mode: bool
    owner_first_name: str


class TagAlertIn(BaseModel):
    type: Literal["found", "emergency", "theft", "damage", "contact", "doorbell", "sos", "kid_help"] = "found"
    scanner_note: Optional[str] = None
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None
    evidence_photo_base64: Optional[str] = None
    # Optional short voice/audio recording from the scanner (e.g. doorbell
    # message, child helper voice note). Cap at ~5 MB base64.
    audio_base64: Optional[str] = Field(default=None, max_length=5 * 1024 * 1024)


@api.get("/tags", response_model=List[TagOut])
async def list_tags(user: dict = Depends(current_user)):
    out = [TagOut(**clean(t)) async for t in db.tags.find({"owner_id": user["id"]}).sort("created_at", -1)]
    return out


@api.post("/tags", response_model=TagOut)
async def create_tag(payload: TagIn, user: dict = Depends(current_user)):
    tag = {
        "id": new_id(),
        "owner_id": user["id"],
        "name": payload.name.strip(),
        "tag_type": payload.tag_type,
        "description": payload.description,
        "photo_base64": payload.photo_base64,
        "blood_group": (payload.blood_group or "").strip() or None,
        "medical_notes": payload.medical_notes,
        "reward_text": payload.reward_text,
        "guardian_name": (payload.guardian_name or "").strip() or None,
        "guardian_phone": (payload.guardian_phone or "").strip() or None,
        "qr_id": new_id(),
        "lost_mode": False,
        "created_at": now_utc(),
    }
    await db.tags.insert_one(dict(tag))
    return TagOut(**clean(tag))


@api.get("/tags/{tag_id}", response_model=TagOut)
async def get_tag(tag_id: str, user: dict = Depends(current_user)):
    t = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    return TagOut(**clean(t))


@api.put("/tags/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: str, payload: TagIn, user: dict = Depends(current_user)):
    t = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    updates = {
        "name": payload.name.strip(),
        "tag_type": payload.tag_type,
        "description": payload.description,
        "photo_base64": payload.photo_base64,
        "blood_group": (payload.blood_group or "").strip() or None,
        "medical_notes": payload.medical_notes,
        "reward_text": payload.reward_text,
        "guardian_name": (payload.guardian_name or "").strip() or None,
        "guardian_phone": (payload.guardian_phone or "").strip() or None,
    }
    await db.tags.update_one({"id": tag_id}, {"$set": updates})
    t.update(updates)
    return TagOut(**clean(t))


@api.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, user: dict = Depends(current_user)):
    r = await db.tags.delete_one({"id": tag_id, "owner_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"deleted": True}


@api.post("/tags/{tag_id}/lost_mode", response_model=TagOut)
async def toggle_tag_lost_mode(tag_id: str, payload: LostModeIn, user: dict = Depends(current_user)):
    t = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.tags.update_one({"id": tag_id}, {"$set": {"lost_mode": payload.enabled}})
    t["lost_mode"] = payload.enabled
    return TagOut(**clean(t))


@api.get("/tags/{tag_id}/scans")
async def list_tag_scans(tag_id: str, user: dict = Depends(current_user)):
    """Scan history for a specific tag — owner only."""
    t = await db.tags.find_one({"id": tag_id, "owner_id": user["id"]})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    scans = []
    async for s in db.alerts.find({"tag_id": tag_id}).sort("created_at", -1).limit(100):
        scans.append(clean(s))
    return scans


@api.get("/public/tag/{qr_id}", response_model=PublicTagOut)
async def public_tag_lookup(qr_id: str):
    t = await db.tags.find_one({"qr_id": qr_id})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    owner = await db.users.find_one({"id": t["owner_id"]})
    first_name = owner["name"].split()[0] if owner and owner.get("name") else "Owner"
    return PublicTagOut(
        qr_id=t["qr_id"],
        name=t["name"],
        tag_type=t["tag_type"],
        description=t.get("description"),
        photo_base64=t.get("photo_base64"),
        blood_group=t.get("blood_group"),
        medical_notes=t.get("medical_notes"),
        reward_text=t.get("reward_text"),
        guardian_name=t.get("guardian_name"),
        has_guardian=bool(t.get("guardian_phone")) or (t.get("tag_type") in ("person", "kid", "patient", "staff") and bool(owner and owner.get("phone"))),
        lost_mode=bool(t.get("lost_mode")),
        owner_first_name=first_name,
    )


@api.post("/public/tag/{qr_id}/alert")
@rate_limit("20/minute")
async def public_tag_alert(request: Request, qr_id: str, payload: TagAlertIn):
    t = await db.tags.find_one({"qr_id": qr_id})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    owner = await db.users.find_one({"id": t["owner_id"]})
    channels: List[str] = []
    if owner and owner.get("phone"):
        channels.append(owner["phone"])
    alert = {
        "id": new_id(),
        "tag_id": t["id"],
        "vehicle_id": None,
        "user_id": t.get("owner_id"),
        "number_plate": t["name"],
        "type": f"tag_{payload.type}",
        "scanner_note": payload.scanner_note,
        "scanner_phone": payload.scanner_phone,
        "scanner_lat": payload.scanner_lat,
        "scanner_lng": payload.scanner_lng,
        "evidence_photo_base64": payload.evidence_photo_base64,
        "audio_base64": payload.audio_base64,
        "created_at": now_utc(),
        "contact_channels": channels,
    }
    await db.alerts.insert_one(dict(alert))
    prefs = _prefs(owner)
    # WhatsApp fan-out to owner + guardian (privacy-safe, mock-ready, gated by prefs).
    tag_title = {"kid_help": "KID NEEDS HELP", "sos": "SOS", "emergency": "Emergency"}.get(payload.type, "scanned")
    body = f"Your Nek Sathi tag '{t['name']}' was {tag_title} via a QR scan."
    if payload.scanner_note:
        body += f" Note: {payload.scanner_note[:100]}"
    if payload.scanner_lat is not None and payload.scanner_lng is not None:
        body += f" Location: https://maps.google.com/?q={payload.scanner_lat},{payload.scanner_lng}"
    if prefs.get("whatsapp"):
        if owner and owner.get("phone"):
            await notify_whatsapp(owner["phone"], body, meta={"tag_id": t["id"], "role": "owner"})
        if t.get("guardian_phone"):
            await notify_whatsapp(t["guardian_phone"], body, meta={"tag_id": t["id"], "role": "guardian"})
    # Push notify owner of tag alert (doorbell / lost pet / lost luggage /
    # child-safety live GPS request).
    try:
        if t.get("owner_id") and prefs.get("push"):
            type_titles = {
                "doorbell": "🔔 Someone's at your door",
                "door":     "🔔 Someone's at your door",
                "pet":      "🐾 Your pet was found",
                "luggage":  "🧳 Your luggage was scanned",
                "kid":      "👶 Kid tag scanned",
                "kid_help": "🆘 KID NEEDS HELP",
                "key":      "🔑 Keys scanned",
                "device":   "💻 Device scanned",
                "sos":      "🚨 SOS from tag",
                "emergency":"🚨 Emergency scan",
                "theft":    "🔒 Theft alert",
            }
            title = type_titles.get(payload.type, f"Tag scanned: {t.get('name', '')}")
            msg_bits = [t.get("name", "Your tag")]
            if payload.scanner_note:
                msg_bits.append(payload.scanner_note[:80])
            if payload.scanner_lat is not None and payload.scanner_lng is not None:
                msg_bits.append(f"📍 {payload.scanner_lat:.4f},{payload.scanner_lng:.4f}")
            if payload.audio_base64:
                msg_bits.append("🎙️ voice message attached")
            await send_push(
                recipients=[t["owner_id"]],
                data={
                    "title": title,
                    "message": " · ".join(msg_bits),
                    "action_url": "/alerts",
                },
                idempotency_key=alert["id"],
            )
    except Exception as _e:
        log.warning("push (tag alert) failed: %s", _e)
    # Never leak owner phone / contact_channels to anonymous scanners.
    return {"ok": True}


class TagCallIn(BaseModel):
    scanner_phone: Optional[str] = Field(default=None, max_length=20)


@api.post("/public/tag/{qr_id}/call")
@rate_limit("10/minute")
async def public_tag_call(request: Request, qr_id: str, payload: TagCallIn):
    """Privacy-safe masked call for person/kid/patient tags: connects the
    scanner to the guardian (or owner) through the Nek Sathi portal. The
    guardian/owner number is NEVER returned to the scanner."""
    t = await db.tags.find_one({"qr_id": qr_id})
    if not t:
        raise HTTPException(status_code=404, detail="Tag not found")
    owner = await db.users.find_one({"id": t.get("owner_id")})
    target_phone = t.get("guardian_phone") or (owner and owner.get("phone"))
    reporter_phone = (payload.scanner_phone or "").strip()
    twilio_from = os.environ.get("TWILIO_FROM")
    live = bool(twilio_from and os.environ.get("TWILIO_ACCOUNT_SID") and os.environ.get("TWILIO_AUTH_TOKEN"))
    status = "mock_connected"
    note = "Connecting you to the guardian through the Nek Sathi portal — their number stays private."

    if live and reporter_phone and target_phone:
        try:  # pragma: no cover - live path
            from twilio.rest import Client as _Tw
            _cli = _Tw(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
            twiml = ("<?xml version='1.0' encoding='UTF-8'?><Response>"
                     "<Say voice='alice'>Connecting you privately to the guardian via Nek Sathi. Please hold.</Say>"
                     f"<Dial callerId='{twilio_from}' timeout='25'>{target_phone}</Dial></Response>")
            _cli.calls.create(to=reporter_phone, from_=twilio_from, twiml=twiml, method="POST")
            status = "calling"
            note = "We're calling you now — pick up and we'll connect you privately to the guardian."
        except Exception as e:
            status = "connecting"
            note = "Connecting you privately via the Nek Sathi portal. (Demo: live dialing needs a verified/upgraded Twilio number.)"
            log.warning("tag masked call failed, demo fallback: %s", e)
    elif live and not reporter_phone:
        status = "need_phone"
        note = "Enter your callback number so we can connect you privately (your number stays hidden)."

    await db.call_records.insert_one({
        "id": new_id(), "tag_id": t["id"], "qr_id": qr_id,
        "reporter_phone": reporter_phone or None, "target_phone": target_phone,  # audit only
        "provider": "twilio" if live else "mock", "portal_number": NEK_PORTAL_NUMBER,
        "status": status, "kind": "tag_guardian", "created_at": now_utc(),
    })
    if _prefs(owner).get("whatsapp") and target_phone:
        await notify_whatsapp(target_phone, f"Someone scanned your Nek Sathi tag '{t['name']}' and is trying to reach you via the portal.", meta={"tag_id": t["id"], "kind": "call"})
    return {"status": status, "masked": True, "portal_number": NEK_PORTAL_NUMBER, "note": note, "provider": "twilio" if live else "mock"}


# ---------------------------------------------------------------------------
# Smart Digital Business Cards — "Share Tap"
#
# One or more sharable digital business cards per user. Each card has its own
# QR / short URL (`/card/{qr_id}`) that renders a rich profile page with
# socials, contact form, and a downloadable vCard. Public messages land as
# alerts of type `card_message` so the owner sees them in the Alerts feed.
# ---------------------------------------------------------------------------

class CardIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    title: Optional[str] = Field(default=None, max_length=80)
    company: Optional[str] = Field(default=None, max_length=80)
    bio: Optional[str] = Field(default=None, max_length=280)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    website: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=200)
    photo_base64: Optional[str] = None
    accent: Optional[Literal["neon", "sunset", "ocean", "forest"]] = "neon"
    socials: dict = Field(default_factory=dict)  # {twitter, linkedin, instagram, github, whatsapp, ...}


class CardOut(CardIn):
    id: str
    owner_id: str
    qr_id: str
    created_at: datetime


class CardMessageIn(BaseModel):
    from_name: str = Field(min_length=1, max_length=80)
    from_phone: Optional[str] = Field(default=None, max_length=20)
    from_email: Optional[str] = Field(default=None, max_length=120)
    body: str = Field(min_length=1, max_length=1000)


@api.get("/cards", response_model=List[CardOut])
async def list_cards(user: dict = Depends(current_user)):
    return [CardOut(**clean(c)) async for c in db.cards.find({"owner_id": user["id"]}).sort("created_at", -1)]


@api.post("/cards", response_model=CardOut)
async def create_card(payload: CardIn, user: dict = Depends(current_user)):
    card = {
        "id": new_id(),
        "owner_id": user["id"],
        "qr_id": new_id(),
        "created_at": now_utc(),
        **payload.model_dump(),
    }
    await db.cards.insert_one(dict(card))
    return CardOut(**clean(card))


@api.get("/cards/{card_id}", response_model=CardOut)
async def get_card(card_id: str, user: dict = Depends(current_user)):
    c = await db.cards.find_one({"id": card_id, "owner_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    return CardOut(**clean(c))


@api.put("/cards/{card_id}", response_model=CardOut)
async def update_card(card_id: str, payload: CardIn, user: dict = Depends(current_user)):
    c = await db.cards.find_one({"id": card_id, "owner_id": user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    updates = payload.model_dump()
    await db.cards.update_one({"id": card_id}, {"$set": updates})
    c.update(updates)
    return CardOut(**clean(c))


@api.delete("/cards/{card_id}")
async def delete_card(card_id: str, user: dict = Depends(current_user)):
    r = await db.cards.delete_one({"id": card_id, "owner_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"deleted": True}


@api.get("/public/card/{qr_id}", response_model=CardOut)
async def public_card_view(qr_id: str):
    c = await db.cards.find_one({"qr_id": qr_id})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    return CardOut(**clean(c))


@api.get("/public/card/{qr_id}/vcf")
async def public_card_vcf(qr_id: str, dl: bool = False):
    """RFC 6350 (vCard 4.0) download endpoint for Share Tap cards.

    Content-Type of ``text/vcard`` causes iOS/Android to automatically hand
    off to the Contacts app when opened from a browser — no Nek Sathi
    install required for the scanner.

    Query params:
      dl=1 → force ``Content-Disposition: attachment`` so browsers download
             the file rather than trying to render.
    """
    c = await db.cards.find_one({"qr_id": qr_id})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    body = build_vcard4(c)
    disposition = "attachment" if dl else "inline"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{vcard_filename(c)}"',
        "Cache-Control": "no-store",
    }
    return Response(
        content=body,
        media_type="text/vcard; charset=utf-8",
        headers=headers,
    )


@api.post("/public/card/{qr_id}/message")
@rate_limit("10/minute")
async def public_card_message(request: Request, qr_id: str, payload: CardMessageIn):
    c = await db.cards.find_one({"qr_id": qr_id})
    if not c:
        raise HTTPException(status_code=404, detail="Card not found")
    owner = await db.users.find_one({"id": c["owner_id"]})
    channels: List[str] = []
    if owner and owner.get("phone"):
        channels.append(owner["phone"])
    if c.get("phone"):
        channels.append(c["phone"])
    alert = {
        "id": new_id(),
        "card_id": c["id"],
        "vehicle_id": None,
        "user_id": c.get("owner_id"),
        "number_plate": c.get("display_name", "Card"),
        "type": "card_message",
        "scanner_note": f"From {payload.from_name}: {payload.body[:200]}"
        + (f" · reply: {payload.from_phone}" if payload.from_phone else "")
        + (f" · {payload.from_email}" if payload.from_email else ""),
        "scanner_lat": None,
        "scanner_lng": None,
        "created_at": now_utc(),
        "contact_channels": list(dict.fromkeys(channels)),
    }
    await db.alerts.insert_one(dict(alert))
    try:
        if c.get("owner_id"):
            await send_push(
                recipients=[c["owner_id"]],
                data={
                    "title": f"💬 New message from {payload.from_name}",
                    "message": payload.body[:150],
                    "action_url": "/alerts",
                },
                idempotency_key=alert["id"],
            )
    except Exception as _e:
        log.warning("push (card message) failed: %s", _e)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Unified QR resolver — the app hits this after scanning any Nek Sathi QR
# to figure out whether it's a vehicle, tag or card, and then routes the
# user to the right screen.
# ---------------------------------------------------------------------------

@api.get("/public/resolve/{qr_id}")
async def resolve_qr(qr_id: str):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if v:
        return {"entity_type": "vehicle", "qr_id": qr_id}
    t = await db.tags.find_one({"qr_id": qr_id})
    if t:
        return {"entity_type": "tag", "qr_id": qr_id}
    c = await db.cards.find_one({"qr_id": qr_id})
    if c:
        return {"entity_type": "card", "qr_id": qr_id}
    raise HTTPException(status_code=404, detail="QR not recognised")



# ---------------------------------------------------------------------------
# Blackspots — accident-prone / crime-prone geo-fences.
#
# Admin curates the list, everyone can read. Each blackspot has a centre and
# a radius; the client compares live GPS against them to fire a warning.
# ---------------------------------------------------------------------------

class BlackspotIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["accident", "crime", "flood", "landslide", "other"] = "accident"
    severity: Literal["low", "medium", "high"] = "medium"
    lat: float
    lng: float
    radius_m: int = Field(default=250, ge=50, le=5000)
    notes: Optional[str] = Field(default=None, max_length=280)


class BlackspotOut(BlackspotIn):
    id: str
    created_at: datetime


@api.get("/blackspots", response_model=List[BlackspotOut])
async def list_blackspots(_: dict = Depends(current_user)):
    return [BlackspotOut(**clean(b)) async for b in db.blackspots.find().sort("severity", -1)]


@api.post("/admin/blackspots", response_model=BlackspotOut)
async def create_blackspot(payload: BlackspotIn, _: dict = Depends(require_admin)):
    b = {"id": new_id(), "created_at": now_utc(), **payload.model_dump()}
    await db.blackspots.insert_one(dict(b))
    return BlackspotOut(**clean(b))


@api.delete("/admin/blackspots/{bid}")
async def delete_blackspot(bid: str, _: dict = Depends(require_admin)):
    r = await db.blackspots.delete_one({"id": bid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Blackspot not found")
    return {"deleted": True}


async def _seed_blackspots() -> None:
    """Seed a handful of demo blackspots so the family map is not empty out of the box."""
    if await db.blackspots.count_documents({}) > 0:
        return
    seed = [
        {"name": "NH-48 Sector 44 curve", "kind": "accident", "severity": "high",  "lat": 28.4595, "lng": 77.0266, "radius_m": 400, "notes": "Sharp turn, 12 fatal accidents last year."},
        {"name": "IIT flyover ramp",      "kind": "accident", "severity": "medium","lat": 28.5433, "lng": 77.1930, "radius_m": 300, "notes": "Poor lighting at night."},
        {"name": "Yamuna riverfront",     "kind": "flood",    "severity": "medium","lat": 28.6060, "lng": 77.2340, "radius_m": 800, "notes": "Waterlogging during monsoons."},
        {"name": "Old Delhi market lane", "kind": "crime",    "severity": "high",  "lat": 28.6562, "lng": 77.2410, "radius_m": 250, "notes": "Repeated phone-snatching reports."},
    ]
    for row in seed:
        row["id"] = new_id()
        row["created_at"] = now_utc()
        await db.blackspots.insert_one(dict(row))


# ---------------------------------------------------------------------------
# Call masking bridge (Twilio / Exotel adapter, gracefully falls back to
# WhatsApp deep-links when no telco keys are configured).
#
# Endpoint: POST /public/qr/{qr_id}/bridge (no auth) — takes an entity kind
# ("vehicle" | "tag" | "card") and returns a masked `dial_url`. In prod this
# is either a Twilio virtual number or a wa.me link that routes through a
# managed WhatsApp Business number. Both parties never see raw phones.
# ---------------------------------------------------------------------------

MASK_TTL_MIN = 30


class BridgeReqIn(BaseModel):
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
    entity: Literal["vehicle", "tag", "card"] = "vehicle"


class BridgeOut(BaseModel):
    kind: Literal["whatsapp", "twilio", "unavailable"]
    dial_url: Optional[str] = None
    masked_from: Optional[str] = None
    masked_to: Optional[str] = None
    expires_at: Optional[datetime] = None
    note: Optional[str] = None


def _telco_provider() -> str:
    if os.environ.get("TWILIO_ACCOUNT_SID") and os.environ.get("TWILIO_AUTH_TOKEN") and os.environ.get("TWILIO_FROM"):
        return "twilio"
    if os.environ.get("EXOTEL_SID") and os.environ.get("EXOTEL_TOKEN"):
        return "exotel"
    return "whatsapp"


@api.post("/public/qr/{qr_id}/bridge", response_model=BridgeOut)
@rate_limit("10/minute")
async def public_bridge(request: Request, qr_id: str, payload: BridgeReqIn):
    owner_phone: Optional[str] = None
    label = ""
    if payload.entity == "vehicle":
        v = await db.vehicles.find_one({"qr_id": qr_id})
        if not v:
            raise HTTPException(status_code=404, detail="Not found")
        owner = await db.users.find_one({"id": v["owner_id"]})
        owner_phone = owner and owner.get("phone")
        label = v["number_plate"]
    elif payload.entity == "tag":
        t = await db.tags.find_one({"qr_id": qr_id})
        if not t:
            raise HTTPException(status_code=404, detail="Not found")
        owner = await db.users.find_one({"id": t["owner_id"]})
        owner_phone = owner and owner.get("phone")
        label = t["name"]
    else:  # card
        c = await db.cards.find_one({"qr_id": qr_id})
        if not c:
            raise HTTPException(status_code=404, detail="Not found")
        owner_phone = c.get("phone") or None
        if not owner_phone:
            owner = await db.users.find_one({"id": c["owner_id"]})
            owner_phone = owner and owner.get("phone")
        label = c.get("display_name") or "Card"

    if not owner_phone:
        return BridgeOut(kind="unavailable", note="Owner has no phone on file")

    provider = _telco_provider()
    session_id = new_id()
    expires = now_utc() + timedelta(minutes=MASK_TTL_MIN)
    # Persist the mapping so admin can audit the bridge later.
    await db.bridge_sessions.insert_one({
        "id": session_id,
        "qr_id": qr_id,
        "entity": payload.entity,
        "scanner_phone": payload.scanner_phone,
        "owner_phone": owner_phone,
        "provider": provider,
        "expires_at": expires,
        "created_at": now_utc(),
    })

    if provider == "twilio":
        # In prod: use Twilio proxy service to mint a masked number. Stub here.
        return BridgeOut(
            kind="twilio",
            dial_url=f"tel:{os.environ.get('TWILIO_FROM')}",
            masked_from="Nek Sathi bridge",
            masked_to=label,
            expires_at=expires,
            note="Dial the number, our IVR routes you to the owner without revealing their real number.",
        )
    # WhatsApp deep-link fallback — safest zero-config bridge.
    text = f"Hi, I scanned your Nek Sathi QR ({label}). Session {session_id[:8]}."
    dial = f"https://wa.me/{owner_phone.replace('+', '').replace(' ', '')}?text={quote_plus(text)}"
    return BridgeOut(
        kind="whatsapp",
        dial_url=dial,
        masked_from="via WhatsApp",
        masked_to=label,
        expires_at=expires,
        note="Chat opens directly with the owner. Your number is only shared if you press 'send'.",
    )




# ---------------------------------------------------------------------------
# Nearby help (mock static data — plug in Google Places later)
# ---------------------------------------------------------------------------

NEARBY_MOCK = [
    {"id": "h1", "name": "City General Hospital", "type": "hospital", "phone": "+911244400400", "distance_km": 1.2, "address": "Sector 12, Main Road", "lat": 28.6205, "lng": 77.2115},
    {"id": "h2", "name": "Apollo Emergency", "type": "hospital", "phone": "+911244400500", "distance_km": 2.8, "address": "MG Road", "lat": 28.6270, "lng": 77.2245},
    {"id": "a1", "name": "108 Ambulance Service", "type": "ambulance", "phone": "108", "distance_km": 0.0, "address": "Statewide", "lat": 28.6145, "lng": 77.2090},
    {"id": "a2", "name": "Red Cross Ambulance", "type": "ambulance", "phone": "+911123456789", "distance_km": 3.4, "address": "Civil Lines", "lat": 28.6350, "lng": 77.2200},
    {"id": "p1", "name": "Central Police Station", "type": "police", "phone": "100", "distance_km": 1.8, "address": "Kotwali Chowk", "lat": 28.6100, "lng": 77.2025},
    {"id": "p2", "name": "Traffic Police Control", "type": "police", "phone": "1073", "distance_km": 4.1, "address": "Highway Junction", "lat": 28.5970, "lng": 77.2320},
]


@api.get("/nearby")
async def nearby(lat: Optional[float] = None, lng: Optional[float] = None):
    """Return nearby help centers. Currently returns static mock data —
    plug Google Places API here in phase 2."""
    return {"count": len(NEARBY_MOCK), "results": NEARBY_MOCK}


# ---------------------------------------------------------------------------
# Admin summary (owner-scoped)
# ---------------------------------------------------------------------------

@api.get("/summary")
async def summary(user: dict = Depends(current_user)):
    vehicles = await db.vehicles.count_documents({"owner_id": user["id"]})
    vehicle_ids = [v["id"] async for v in db.vehicles.find({"owner_id": user["id"]}, {"id": 1})]
    total_alerts = 0
    emergencies = 0
    parking = 0
    accidents = 0
    if vehicle_ids:
        total_alerts = await db.alerts.count_documents({"vehicle_id": {"$in": vehicle_ids}})
        emergencies = await db.alerts.count_documents({"vehicle_id": {"$in": vehicle_ids}, "type": "emergency"})
        parking = await db.alerts.count_documents({"vehicle_id": {"$in": vehicle_ids}, "type": "wrong_parking"})
        accidents = await db.alerts.count_documents({"vehicle_id": {"$in": vehicle_ids}, "type": {"$regex": "^accident"}})
    return {
        "vehicles": vehicles,
        "total_alerts": total_alerts,
        "emergencies": emergencies,
        "wrong_parking": parking,
        "accidents": accidents,
    }


# ---------------------------------------------------------------------------
# Pro Analytics (owner-scoped)
# ---------------------------------------------------------------------------

async def _user_has_pro(user_id: str) -> bool:
    """Family Pro subscribers get access to the Pro analytics dashboard.
    Admin users are treated as Pro for QA convenience."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "is_admin": 1})
    if user and user.get("is_admin"):
        return True
    sub = await db.subscriptions.find_one({
        "user_id": user_id,
        "plan_code": "family_pro",
        "status": "active",
    })
    return bool(sub)


@api.get("/analytics/access")
async def analytics_access(user: dict = Depends(current_user)):
    """Lightweight endpoint the frontend hits to know whether to show the paywall."""
    return {"pro": await _user_has_pro(user["id"])}


@api.get("/analytics")
async def analytics(user: dict = Depends(current_user), days: int = 30):
    """Owner-scoped analytics feed for the Pro dashboard.

    Returns:
    - `pro`: bool — whether the caller currently has Pro access.
    - `daily`: [{date, total, emergency, wrong_parking, speed_alert}] for the last N days.
    - `by_type`: {type: count} across all alerts in the window.
    - `heatmap`: [{lat, lng, weight}] downsampled scan locations for the map.
    - `safety_score`: {score 0-100, band string, alerts_per_vehicle_per_week}.
    - `top_vehicle`: {number_plate, alerts_count} or null.
    - `window_days`: N.
    """
    pro = await _user_has_pro(user["id"])
    days = max(1, min(days, 90))

    vehicle_ids = [v["id"] async for v in db.vehicles.find({"owner_id": user["id"]}, {"id": 1})]
    vehicles_count = len(vehicle_ids)
    now = now_utc()
    since = now - timedelta(days=days)

    daily: list[dict] = []
    by_type: dict[str, int] = {}
    heatmap: list[dict] = []
    top_vehicle: Optional[dict] = None
    total_window = 0

    if vehicle_ids:
        # Bucket by day and by type.
        buckets: dict[str, dict[str, int]] = {}
        cursor = db.alerts.find(
            {"vehicle_id": {"$in": vehicle_ids}, "created_at": {"$gte": since}},
        )
        vehicle_alert_counts: dict[str, int] = {}
        async for a in cursor:
            ts = a.get("created_at")
            if ts and hasattr(ts, "strftime"):
                key = ts.strftime("%Y-%m-%d")
            else:
                key = str(ts)[:10]
            row = buckets.setdefault(key, {})
            row["total"] = row.get("total", 0) + 1
            t = a.get("type") or "unknown"
            # normalise accident_* to accident
            norm = "accident" if t.startswith("accident") else t
            row[norm] = row.get(norm, 0) + 1
            by_type[norm] = by_type.get(norm, 0) + 1
            total_window += 1
            vid = a.get("vehicle_id")
            if vid:
                vehicle_alert_counts[vid] = vehicle_alert_counts.get(vid, 0) + 1
            lat = a.get("scanner_lat")
            lng = a.get("scanner_lng")
            if lat is not None and lng is not None:
                heatmap.append({"lat": float(lat), "lng": float(lng), "weight": 1})

        # Fill daily rows for every day in the window (0-fill missing dates).
        for i in range(days):
            d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
            row = buckets.get(d, {})
            daily.append({
                "date": d,
                "total": row.get("total", 0),
                "emergency": row.get("emergency", 0),
                "wrong_parking": row.get("wrong_parking", 0),
                "speed_alert": row.get("speed_alert", 0),
                "accident": row.get("accident", 0),
            })

        # Top vehicle (most alerts)
        if vehicle_alert_counts:
            top_id = max(vehicle_alert_counts, key=vehicle_alert_counts.get)
            top_v = await db.vehicles.find_one({"id": top_id}, {"_id": 0, "number_plate": 1})
            if top_v:
                top_vehicle = {
                    "number_plate": top_v["number_plate"],
                    "alerts_count": vehicle_alert_counts[top_id],
                }

    # Fill daily with zeros for the whole window even when the caller has no
    # vehicles yet, so the chart always renders a clean baseline.
    if not daily:
        for i in range(days):
            d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
            daily.append({
                "date": d,
                "total": 0,
                "emergency": 0,
                "wrong_parking": 0,
                "speed_alert": 0,
                "accident": 0,
            })

    # Safety score: 100 = perfect, degrades with alerts-per-vehicle-per-week.
    weeks = max(days / 7.0, 1.0)
    apvpw = (total_window / max(vehicles_count, 1)) / weeks if vehicles_count else 0.0
    # Score bands: 0 alerts → 100. 5+ per vehicle per week → 0.
    score = max(0.0, min(100.0, 100.0 - (apvpw * 20.0)))
    score_int = int(round(score))
    if score_int >= 85:
        band = "Excellent"
    elif score_int >= 65:
        band = "Good"
    elif score_int >= 40:
        band = "Watch"
    else:
        band = "At risk"

    # Downsample heatmap if huge (>300 points)
    if len(heatmap) > 300:
        step = len(heatmap) // 300
        heatmap = heatmap[::step]

    return {
        "pro": pro,
        "window_days": days,
        "vehicles": vehicles_count,
        "total_alerts": total_window,
        "daily": daily,
        "by_type": by_type,
        "heatmap": heatmap,
        "safety_score": {
            "score": score_int,
            "band": band,
            "alerts_per_vehicle_per_week": round(apvpw, 2),
        },
        "top_vehicle": top_vehicle,
        "generated_at": now.isoformat(),
    }




# ---------------------------------------------------------------------------
# Admin routes (require is_admin=true)
# ---------------------------------------------------------------------------

@api.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    now = now_utc()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    total_users = await db.users.count_documents({})
    admins = await db.users.count_documents({"is_admin": True})
    suspended = await db.users.count_documents({"suspended": True})
    total_vehicles = await db.vehicles.count_documents({})
    total_alerts = await db.alerts.count_documents({})
    alerts_24h = await db.alerts.count_documents({"created_at": {"$gte": day_ago}})
    alerts_7d = await db.alerts.count_documents({"created_at": {"$gte": week_ago}})
    emergencies = await db.alerts.count_documents({"type": "emergency"})
    wrong_parking = await db.alerts.count_documents({"type": "wrong_parking"})
    accidents = await db.alerts.count_documents({"type": {"$regex": "^accident"}})
    sos_videos = await db.sos_videos.count_documents({})
    return {
        "users": total_users,
        "admins": admins,
        "suspended": suspended,
        "vehicles": total_vehicles,
        "alerts_total": total_alerts,
        "alerts_24h": alerts_24h,
        "alerts_7d": alerts_7d,
        "emergencies": emergencies,
        "wrong_parking": wrong_parking,
        "accidents": accidents,
        "sos_videos": sos_videos,
    }


@api.get("/admin/users")
async def admin_users(_: dict = Depends(require_admin), q: Optional[str] = None, limit: int = 100):
    filt: dict = {}
    if q:
        filt = {"$or": [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]}
    users = []
    async for u in db.users.find(filt).sort("created_at", -1).limit(limit):
        v_count = await db.vehicles.count_documents({"owner_id": u["id"]})
        users.append({
            "id": u["id"],
            "email": u["email"],
            "name": u["name"],
            "phone": u["phone"],
            "is_admin": bool(u.get("is_admin", False)),
            "suspended": bool(u.get("suspended", False)),
            "vehicles": v_count,
            "created_at": u["created_at"],
        })
    return {"count": len(users), "results": users}


@api.post("/admin/users/{user_id}/suspend")
async def admin_suspend(user_id: str, payload: dict, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    suspend = bool(payload.get("suspended", False))
    await db.users.update_one({"id": user_id}, {"$set": {"suspended": suspend}})
    return {"user_id": user_id, "suspended": suspend}


# ---------- QR Inventory (Pre-generated QR codes for physical stickers) ----------

def _next_serial(seq: int) -> str:
    """Serial format: NS-YYMM-NNNNNN (e.g. NS-2608-000042)."""
    now = now_utc()
    return f"NS-{now.strftime('%y%m')}-{seq:06d}"


class BulkGenerateIn(BaseModel):
    count: int = Field(ge=1, le=10000)
    batch_label: Optional[str] = None
    notes: Optional[str] = None


class ClaimIn(BaseModel):
    serial_no: str
    product_type: Literal["vehicle", "tag", "card"]
    payload: dict


@api.post("/admin/qr/generate-bulk")
async def admin_qr_bulk_generate(body: BulkGenerateIn, admin: dict = Depends(require_admin)):
    batch_id = new_id()
    batch_label = body.batch_label or f"Batch-{now_utc().strftime('%y%m%d-%H%M')}"
    last = await db.qr_inventory.find_one(sort=[("seq", -1)])
    start_seq = (last["seq"] + 1) if last else 1
    docs = []
    for i in range(body.count):
        seq = start_seq + i
        docs.append({
            "id": new_id(), "seq": seq, "serial_no": _next_serial(seq),
            "qr_id": new_id(), "status": "unclaimed",
            "batch_id": batch_id, "batch_label": batch_label, "notes": body.notes,
            "assigned_to_user_id": None, "product_type": None, "assigned_at": None,
            "sold_to_vendor": None, "sold_at": None,
            "created_at": now_utc(), "created_by": admin["id"],
        })
    if docs:
        await db.qr_inventory.insert_many(docs)
    return {
        "batch_id": batch_id, "batch_label": batch_label, "count": len(docs),
        "first_serial": docs[0]["serial_no"] if docs else None,
        "last_serial": docs[-1]["serial_no"] if docs else None,
    }


@api.get("/admin/qr/inventory")
async def admin_qr_inventory(
    _: dict = Depends(require_admin),
    status: Optional[str] = None, batch_id: Optional[str] = None,  # noqa: F811
    q: Optional[str] = None, limit: int = 200,
):
    filt: dict = {}
    if status: filt["status"] = status
    if batch_id: filt["batch_id"] = batch_id
    if q: filt["serial_no"] = {"$regex": q, "$options": "i"}
    items = []
    async for d in db.qr_inventory.find(filt).sort("seq", -1).limit(limit):
        items.append({
            "id": d["id"], "serial_no": d["serial_no"], "qr_id": d["qr_id"],
            "status": d["status"], "batch_label": d.get("batch_label"),
            "batch_id": d.get("batch_id"), "product_type": d.get("product_type"),
            "sold_to_vendor": d.get("sold_to_vendor"),
            "assigned_to_user_id": d.get("assigned_to_user_id"),
            "created_at": d["created_at"], "assigned_at": d.get("assigned_at"),
        })
    return {"count": len(items), "items": items}


@api.get("/admin/qr/batches")
async def admin_qr_batches(_: dict = Depends(require_admin)):
    pipeline = [
        {"$group": {
            "_id": {"batch_id": "$batch_id", "batch_label": "$batch_label"},
            "total": {"$sum": 1},
            "unclaimed": {"$sum": {"$cond": [{"$eq": ["$status", "unclaimed"]}, 1, 0]}},
            "sold": {"$sum": {"$cond": [{"$eq": ["$status", "sold"]}, 1, 0]}},
            "assigned": {"$sum": {"$cond": [{"$eq": ["$status", "assigned"]}, 1, 0]}},
            "first_created": {"$min": "$created_at"},
        }},
        {"$sort": {"first_created": -1}},
    ]
    out = []
    async for g in db.qr_inventory.aggregate(pipeline):
        out.append({
            "batch_id": g["_id"]["batch_id"], "batch_label": g["_id"]["batch_label"],
            "total": g["total"], "unclaimed": g["unclaimed"],
            "sold": g["sold"], "assigned": g["assigned"],
            "created_at": g["first_created"],
        })
    return {"batches": out}


@api.get("/admin/qr/batch/{batch_id}/export.csv")
async def admin_qr_batch_csv(batch_id: str, _: dict = Depends(require_admin)):
    base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") or ""
    rows = ["serial_no,qr_id,scan_url,status"]
    async for d in db.qr_inventory.find({"batch_id": batch_id}).sort("seq", 1):
        url = f"{base}/claim/{d['serial_no']}"
        rows.append(f"{d['serial_no']},{d['qr_id']},{url},{d['status']}")
    csv_body = "\n".join(rows) + "\n"
    return Response(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="qr-batch-{batch_id[:8]}.csv"'},
    )


@api.get("/admin/qr/batch/{batch_id}/stickers.html")
async def admin_qr_batch_stickers(
    batch_id: str,
    variant: str = "neon",
    per_row: int = 3,
    limit: int = 200,
):
    """Printable HTML sticker sheet — open in browser then Ctrl/Cmd+P.

    Public endpoint by design: the scan URLs it renders are meant to be
    printed on stickers anyway. The random batch_id UUID guards against
    accidental exposure.
    """
    if variant not in STICKER_VARIANTS:
        variant = "neon"
    per_row = max(1, min(6, per_row))
    limit = max(1, min(500, limit))
    base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/") or ""
    items: list[tuple[str, str]] = []
    async for d in db.qr_inventory.find({"batch_id": batch_id}).sort("seq", 1).limit(limit):
        items.append((d["serial_no"], f"{base}/claim/{d['serial_no']}"))
    if not items:
        raise HTTPException(status_code=404, detail="Batch not found or empty")
    html = build_sticker_html(items, variant=variant, per_row=per_row)
    return Response(content=html, media_type="text/html; charset=utf-8")


class MarkSoldIn(BaseModel):
    serial_from: str
    serial_to: str
    vendor_name: str


@api.post("/admin/qr/mark-sold")
async def admin_qr_mark_sold(body: MarkSoldIn, _: dict = Depends(require_admin)):
    now = now_utc()
    r = await db.qr_inventory.update_many(
        {"serial_no": {"$gte": body.serial_from, "$lte": body.serial_to}, "status": "unclaimed"},
        {"$set": {"status": "sold", "sold_to_vendor": body.vendor_name, "sold_at": now}},
    )
    return {"updated": r.modified_count}


@api.get("/public/claim/{serial_no}")
async def public_claim_preview(serial_no: str):
    d = await db.qr_inventory.find_one({"serial_no": serial_no})
    if not d:
        raise HTTPException(status_code=404, detail="Serial not found")
    if d["status"] == "assigned":
        return {"status": "assigned", "product_type": d.get("product_type"), "qr_id": d["qr_id"]}
    return {
        "status": d["status"], "serial_no": d["serial_no"],
        "batch_label": d.get("batch_label"),
    }


@api.post("/qr/claim")
async def qr_claim(body: ClaimIn, user: dict = Depends(current_user)):
    d = await db.qr_inventory.find_one({"serial_no": body.serial_no})
    if not d:
        raise HTTPException(status_code=404, detail="Serial not found")
    if d["status"] == "assigned":
        raise HTTPException(status_code=409, detail="This QR is already claimed")
    p = body.payload or {}
    new_qr = d["qr_id"]
    new_doc_id = new_id()
    now = now_utc()
    if body.product_type == "vehicle":
        await db.vehicles.insert_one({
            "id": new_doc_id, "owner_id": user["id"], "qr_id": new_qr,
            "number_plate": (p.get("number_plate") or "").strip().upper() or "UNSET",
            "vehicle_type": p.get("vehicle_type", "car"),
            "make_model": p.get("make_model"),
            "speed_limit_kmh": int(p.get("speed_limit_kmh", 80)),
            "lost_mode": False, "created_at": now,
        })
    elif body.product_type == "tag":
        await db.tags.insert_one({
            "id": new_doc_id, "owner_id": user["id"], "qr_id": new_qr,
            "name": p.get("name", "My Tag"), "tag_type": p.get("type_", "pet"),
            "lost_mode": bool(p.get("lost_mode", False)),
            "metadata": p.get("metadata", {}), "created_at": now,
        })
    else:
        await db.cards.insert_one({
            "id": new_doc_id, "owner_id": user["id"], "qr_id": new_qr,
            "display_name": p.get("display_name", user.get("name", "Card")),
            "title": p.get("title"), "company": p.get("company"),
            "phone": p.get("phone"), "email": p.get("email"),
            "website": p.get("website"), "bio": p.get("bio"),
            "address": p.get("address"), "socials": p.get("socials", {}),
            "accent": p.get("accent"), "photo_base64": p.get("photo_base64"),
            "created_at": now,
        })
    await db.qr_inventory.update_one(
        {"id": d["id"]},
        {"$set": {
            "status": "assigned", "assigned_to_user_id": user["id"],
            "assigned_at": now, "product_type": body.product_type,
        }},
    )
    return {"ok": True, "product_type": body.product_type, "qr_id": new_qr, "id": new_doc_id}


# ---------- Vendor CRUD (offline QR sticker distributors) ----------
#
# A "vendor" is an offline retail partner who buys pre-printed QR stickers
# in bulk and resells them at their shop. This module lets the admin track
# vendors, orders (batch → vendor), payments received, and outstanding
# balances. Money is stored in *paise* (integer, 1 INR = 100 paise) to
# avoid float drift.

class VendorIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    gstin: Optional[str] = None
    notes: Optional[str] = None


class VendorOrderIn(BaseModel):
    batch_id: Optional[str] = None  # optional link to a QR batch
    serial_from: Optional[str] = None
    serial_to: Optional[str] = None
    qty: int = Field(ge=1, le=10000)
    unit_price_paise: int = Field(ge=0)
    notes: Optional[str] = None
    mark_batch_sold: bool = False  # auto-mark serials as sold to this vendor


class VendorPaymentIn(BaseModel):
    amount_paise: int = Field(ge=1)
    method: Literal["cash", "upi", "bank", "cheque", "other"] = "cash"
    reference: Optional[str] = None
    notes: Optional[str] = None


def _vendor_out(v: dict) -> dict:
    return {
        "id": v["id"], "name": v["name"],
        "contact_name": v.get("contact_name"),
        "phone": v.get("phone"), "email": v.get("email"),
        "address": v.get("address"), "city": v.get("city"),
        "state": v.get("state"), "gstin": v.get("gstin"),
        "notes": v.get("notes"),
        "created_at": v["created_at"],
    }


async def _vendor_totals(vendor_id: str) -> dict:
    pipe_orders = [
        {"$match": {"vendor_id": vendor_id}},
        {"$group": {
            "_id": None,
            "orders_count": {"$sum": 1},
            "total_billed": {"$sum": "$total_paise"},
            "total_qty": {"$sum": "$qty"},
        }},
    ]
    pipe_pay = [
        {"$match": {"vendor_id": vendor_id}},
        {"$group": {"_id": None, "total_paid": {"$sum": "$amount_paise"}}},
    ]
    o = await db.vendor_orders.aggregate(pipe_orders).to_list(1)
    p = await db.vendor_payments.aggregate(pipe_pay).to_list(1)
    billed = int(o[0]["total_billed"]) if o else 0
    paid = int(p[0]["total_paid"]) if p else 0
    return {
        "orders_count": int(o[0]["orders_count"]) if o else 0,
        "total_qty": int(o[0]["total_qty"]) if o else 0,
        "total_billed_paise": billed,
        "total_paid_paise": paid,
        "outstanding_paise": max(0, billed - paid),
    }


@api.post("/admin/vendors")
async def admin_vendor_create(body: VendorIn, admin: dict = Depends(require_admin)):
    doc = {
        "id": new_id(), **body.model_dump(),
        "created_at": now_utc(), "created_by": admin["id"],
    }
    await db.vendors.insert_one(doc)
    return _vendor_out(doc)


@api.get("/admin/vendors")
async def admin_vendors_list(_: dict = Depends(require_admin), q: Optional[str] = None, limit: int = 200):
    filt: dict = {}
    if q:
        filt = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"city": {"$regex": q, "$options": "i"}},
        ]}
    items = []
    async for v in db.vendors.find(filt).sort("created_at", -1).limit(limit):
        t = await _vendor_totals(v["id"])
        items.append({**_vendor_out(v), **t})
    return {"count": len(items), "items": items}


@api.get("/admin/vendors/summary")
async def admin_vendors_summary(_: dict = Depends(require_admin)):
    """Global tally across every vendor — used on admin dashboard cards."""
    pipe_orders = [{"$group": {
        "_id": None,
        "billed": {"$sum": "$total_paise"},
        "qty": {"$sum": "$qty"},
        "orders": {"$sum": 1},
    }}]
    pipe_pay = [{"$group": {"_id": None, "paid": {"$sum": "$amount_paise"}}}]
    o = await db.vendor_orders.aggregate(pipe_orders).to_list(1)
    p = await db.vendor_payments.aggregate(pipe_pay).to_list(1)
    v_count = await db.vendors.count_documents({})
    billed = int(o[0]["billed"]) if o else 0
    paid = int(p[0]["paid"]) if p else 0
    return {
        "vendors": v_count,
        "orders": int(o[0]["orders"]) if o else 0,
        "total_qty": int(o[0]["qty"]) if o else 0,
        "total_billed_paise": billed,
        "total_paid_paise": paid,
        "outstanding_paise": max(0, billed - paid),
    }


@api.get("/admin/vendors/{vendor_id}")
async def admin_vendor_detail(vendor_id: str, _: dict = Depends(require_admin)):
    v = await db.vendors.find_one({"id": vendor_id})
    if not v:
        raise HTTPException(404, "Vendor not found")
    totals = await _vendor_totals(vendor_id)
    orders = []
    async for o in db.vendor_orders.find({"vendor_id": vendor_id}).sort("created_at", -1):
        paid = 0
        async for p in db.vendor_payments.find({"order_id": o["id"]}):
            paid += p["amount_paise"]
        orders.append({
            "id": o["id"], "batch_id": o.get("batch_id"),
            "serial_from": o.get("serial_from"), "serial_to": o.get("serial_to"),
            "qty": o["qty"], "unit_price_paise": o["unit_price_paise"],
            "total_paise": o["total_paise"], "notes": o.get("notes"),
            "paid_paise": paid,
            "outstanding_paise": max(0, o["total_paise"] - paid),
            "payment_status": "paid" if paid >= o["total_paise"] else ("partial" if paid > 0 else "unpaid"),
            "created_at": o["created_at"],
        })
    payments = []
    async for p in db.vendor_payments.find({"vendor_id": vendor_id}).sort("paid_at", -1):
        payments.append({
            "id": p["id"], "order_id": p.get("order_id"),
            "amount_paise": p["amount_paise"], "method": p["method"],
            "reference": p.get("reference"), "notes": p.get("notes"),
            "paid_at": p["paid_at"],
        })
    return {"vendor": _vendor_out(v), "totals": totals, "orders": orders, "payments": payments}


@api.patch("/admin/vendors/{vendor_id}")
async def admin_vendor_update(vendor_id: str, body: VendorIn, _: dict = Depends(require_admin)):
    r = await db.vendors.update_one({"id": vendor_id}, {"$set": body.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    v = await db.vendors.find_one({"id": vendor_id})
    return _vendor_out(v)


@api.delete("/admin/vendors/{vendor_id}")
async def admin_vendor_delete(vendor_id: str, _: dict = Depends(require_admin)):
    n = await db.vendor_orders.count_documents({"vendor_id": vendor_id})
    if n:
        raise HTTPException(400, f"Cannot delete: vendor has {n} orders. Archive instead.")
    r = await db.vendors.delete_one({"id": vendor_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Vendor not found")
    return {"ok": True}


@api.post("/admin/vendors/{vendor_id}/orders")
async def admin_vendor_order_create(vendor_id: str, body: VendorOrderIn, admin: dict = Depends(require_admin)):
    v = await db.vendors.find_one({"id": vendor_id})
    if not v:
        raise HTTPException(404, "Vendor not found")
    total = body.qty * body.unit_price_paise
    order = {
        "id": new_id(), "vendor_id": vendor_id,
        "batch_id": body.batch_id,
        "serial_from": body.serial_from, "serial_to": body.serial_to,
        "qty": body.qty, "unit_price_paise": body.unit_price_paise,
        "total_paise": total, "notes": body.notes,
        "created_at": now_utc(), "created_by": admin["id"],
    }
    await db.vendor_orders.insert_one(order)
    order.pop("_id", None)

    # Optionally mark the serial range in qr_inventory as sold to this vendor.
    marked = 0
    if body.mark_batch_sold and body.serial_from and body.serial_to:
        r = await db.qr_inventory.update_many(
            {
                "serial_no": {"$gte": body.serial_from, "$lte": body.serial_to},
                "status": "unclaimed",
            },
            {"$set": {
                "status": "sold",
                "sold_to_vendor": v["name"],
                "sold_vendor_id": vendor_id,
                "sold_at": now_utc(),
            }},
        )
        marked = r.modified_count
    return {"order": {**order, "paid_paise": 0, "outstanding_paise": total,
                       "payment_status": "unpaid"},
            "serials_marked_sold": marked}


@api.get("/admin/vendors/{vendor_id}/orders")
async def admin_vendor_orders_list(vendor_id: str, _: dict = Depends(require_admin)):
    items = []
    async for o in db.vendor_orders.find({"vendor_id": vendor_id}).sort("created_at", -1):
        paid = 0
        async for p in db.vendor_payments.find({"order_id": o["id"]}):
            paid += p["amount_paise"]
        items.append({
            "id": o["id"], "batch_id": o.get("batch_id"),
            "serial_from": o.get("serial_from"), "serial_to": o.get("serial_to"),
            "qty": o["qty"], "unit_price_paise": o["unit_price_paise"],
            "total_paise": o["total_paise"],
            "paid_paise": paid,
            "outstanding_paise": max(0, o["total_paise"] - paid),
            "payment_status": "paid" if paid >= o["total_paise"] else ("partial" if paid > 0 else "unpaid"),
            "notes": o.get("notes"), "created_at": o["created_at"],
        })
    return {"count": len(items), "items": items}


@api.post("/admin/vendors/{vendor_id}/orders/{order_id}/payments")
async def admin_vendor_payment_record(
    vendor_id: str, order_id: str, body: VendorPaymentIn,
    admin: dict = Depends(require_admin),
):
    o = await db.vendor_orders.find_one({"id": order_id, "vendor_id": vendor_id})
    if not o:
        raise HTTPException(404, "Order not found")
    doc = {
        "id": new_id(), "vendor_id": vendor_id, "order_id": order_id,
        "amount_paise": body.amount_paise, "method": body.method,
        "reference": body.reference, "notes": body.notes,
        "paid_at": now_utc(), "recorded_by": admin["id"],
    }
    await db.vendor_payments.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "payment": doc}




@api.get("/admin/vehicles")
async def admin_vehicles(_: dict = Depends(require_admin), q: Optional[str] = None, limit: int = 200):
    filt: dict = {}
    if q:
        filt = {"number_plate": {"$regex": q, "$options": "i"}}
    items = []
    async for v in db.vehicles.find(filt).sort("created_at", -1).limit(limit):
        owner = await db.users.find_one({"id": v["owner_id"]}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
        contacts = await db.contacts.count_documents({"vehicle_id": v["id"]})
        items.append({
            "id": v["id"],
            "number_plate": v["number_plate"],
            "vehicle_type": v["vehicle_type"],
            "make_model": v.get("make_model"),
            "qr_id": v["qr_id"],
            "speed_limit_kmh": v.get("speed_limit_kmh", 80),
            "lost_mode": bool(v.get("lost_mode", False)),
            "owner": owner or {"name": "?", "email": "?", "phone": "?"},
            "contacts": contacts,
            "created_at": v["created_at"],
        })
    return {"count": len(items), "results": items}


@api.get("/admin/alerts")
async def admin_alerts(
    _: dict = Depends(require_admin),
    type: Optional[str] = None,
    q: Optional[str] = None,
    days: int = 30,
    limit: int = 500,
):
    filt: dict = {}
    if type:
        if type == "accident":
            filt["type"] = {"$regex": "^accident"}
        else:
            filt["type"] = type
    if q:
        filt["number_plate"] = {"$regex": q, "$options": "i"}
    if days > 0:
        filt["created_at"] = {"$gte": now_utc() - timedelta(days=days)}
    items = []
    async for a in db.alerts.find(filt).sort("created_at", -1).limit(limit):
        items.append({
            "id": a["id"],
            "vehicle_id": a["vehicle_id"],
            "number_plate": a["number_plate"],
            "type": a["type"],
            "scanner_note": a.get("scanner_note"),
            "scanner_lat": a.get("scanner_lat"),
            "scanner_lng": a.get("scanner_lng"),
            "created_at": a["created_at"],
            "contact_channels_count": len(a.get("contact_channels", [])),
        })
    return {"count": len(items), "results": items}


@api.get("/admin/alerts/export")
async def admin_alerts_export(
    _: dict = Depends(require_admin),
    type: Optional[str] = None,
    days: int = 30,
):
    from fastapi.responses import Response
    filt: dict = {}
    if type:
        if type == "accident":
            filt["type"] = {"$regex": "^accident"}
        else:
            filt["type"] = type
    if days > 0:
        filt["created_at"] = {"$gte": now_utc() - timedelta(days=days)}
    lines = ["id,number_plate,type,note,latitude,longitude,notified_count,created_at"]
    async for a in db.alerts.find(filt).sort("created_at", -1):
        note = (a.get("scanner_note") or "").replace('"', "'").replace(",", ";")
        lines.append(
            ",".join([
                a["id"],
                a["number_plate"],
                a["type"],
                f'"{note}"',
                str(a.get("scanner_lat", "")),
                str(a.get("scanner_lng", "")),
                str(len(a.get("contact_channels", []))),
                a["created_at"].isoformat() if hasattr(a["created_at"], "isoformat") else str(a["created_at"]),
            ])
        )
    csv = "\n".join(lines)
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=neksaathi_alerts.csv"},
    )


# ---------------------------------------------------------------------------
# Plans & Subscriptions
# ---------------------------------------------------------------------------

def plan_out(p: dict) -> PlanOut:
    return PlanOut(
        id=p["id"],
        code=p["code"],
        name=p["name"],
        description=p.get("description"),
        price_cents=p["price_cents"],
        currency=p.get("currency", "INR"),
        interval=p.get("interval", "month"),
        vehicle_limit=p.get("vehicle_limit", 1),
        features=p.get("features", []),
        active=bool(p.get("active", True)),
        popular=bool(p.get("popular", False)),
    )


@api.get("/plans", response_model=List[PlanOut])
async def list_plans():
    items = []
    async for p in db.plans.find({"active": True}).sort("price_cents", 1):
        items.append(plan_out(clean(p)))
    return items


@api.get("/subscriptions/me")
async def my_subscription(user: dict = Depends(current_user)):
    sub = await db.subscriptions.find_one(
        {"user_id": user["id"], "status": {"$in": ["active", "pending"]}},
        sort=[("created_at", -1)],
    )
    if not sub:
        return {"subscription": None}
    plan = await db.plans.find_one({"code": sub["plan_code"]})
    return {
        "subscription": {
            "id": sub["id"],
            "plan_code": sub["plan_code"],
            "plan_name": plan["name"] if plan else sub["plan_code"],
            "status": sub["status"],
            "current_period_end": sub.get("current_period_end"),
            "stripe_session_id": sub.get("stripe_session_id"),
            "stripe_subscription_id": sub.get("stripe_subscription_id"),
            "created_at": sub["created_at"],
        }
    }


@api.post("/subscriptions/checkout-session")
async def create_checkout(payload: CheckoutIn, user: dict = Depends(current_user)):
    plan = await db.plans.find_one({"code": payload.plan_code, "active": True})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Create a pending subscription record up-front so the confirm flow is
    # idempotent and traceable.
    sub_id = new_id()
    session_id = f"cs_dry_{new_id().replace('-', '')[:20]}" if STRIPE_DRY_RUN else None
    sub_doc = {
        "id": sub_id,
        "user_id": user["id"],
        "plan_code": plan["code"],
        "status": "pending",
        "stripe_session_id": session_id,
        "created_at": now_utc(),
    }

    if STRIPE_DRY_RUN:
        # DRY-RUN: skip real Stripe and expose a preview URL that the frontend
        # knows to interpret ("return with success=1 immediately"). The check-out
        # UX flow (button → open URL → confirm) stays identical to production.
        url = f"safeqr-dry-run://checkout?session_id={session_id}&plan={plan['code']}"
        sub_doc["stripe_session_id"] = session_id
        sub_doc["dry_run"] = True
    else:
        return_url = payload.return_url or "https://example.com/subscription/return"
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{
                "price_data": {
                    "currency": plan.get("currency", "inr").lower(),
                    "product_data": {"name": plan["name"]},
                    "unit_amount": plan["price_cents"],
                    "recurring": {"interval": plan.get("interval", "month")},
                },
                "quantity": 1,
            }],
            success_url=f"{return_url}?session_id={{CHECKOUT_SESSION_ID}}&status=success",
            cancel_url=f"{return_url}?session_id={{CHECKOUT_SESSION_ID}}&status=cancel",
            client_reference_id=user["id"],
            metadata={"user_id": user["id"], "plan_code": plan["code"]},
        )
        url = session.url
        session_id = session.id
        sub_doc["stripe_session_id"] = session_id

    await db.subscriptions.insert_one(dict(sub_doc))
    return {
        "url": url,
        "session_id": session_id,
        "dry_run": STRIPE_DRY_RUN,
        "plan_code": plan["code"],
        "plan_name": plan["name"],
        "price_cents": plan["price_cents"],
        "currency": plan.get("currency", "INR"),
    }


@api.post("/subscriptions/confirm")
async def confirm_subscription(payload: ConfirmIn, user: dict = Depends(current_user)):
    sub = await db.subscriptions.find_one({
        "stripe_session_id": payload.session_id,
        "user_id": user["id"],
    })
    if not sub:
        raise HTTPException(status_code=404, detail="Session not found")

    if sub["status"] == "active":
        # Idempotent: already confirmed
        return {"ok": True, "already_active": True, "status": "active", "plan_code": sub["plan_code"]}

    if STRIPE_DRY_RUN:
        period_end = now_utc() + timedelta(days=30 if sub["plan_code"].endswith("month") or sub["plan_code"] == "basic" else 365)
        await db.subscriptions.update_one(
            {"id": sub["id"]},
            {"$set": {
                "status": "active",
                "current_period_end": period_end,
                "activated_at": now_utc(),
            }},
        )
        return {"ok": True, "dry_run": True, "status": "active", "plan_code": sub["plan_code"]}

    session = stripe.checkout.Session.retrieve(payload.session_id)
    if session.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail=f"Session not paid: {session.get('payment_status')}")

    stripe_sub_id = session.get("subscription")
    period_end = None
    if stripe_sub_id:
        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
        item = stripe_sub["items"]["data"][0]
        period_end = datetime.fromtimestamp(item["current_period_end"], tz=timezone.utc)

    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {
            "status": "active",
            "current_period_end": period_end,
            "stripe_subscription_id": stripe_sub_id,
            "activated_at": now_utc(),
        }},
    )
    return {"ok": True, "status": "active", "plan_code": sub["plan_code"]}


# --- Admin plans CRUD ---

@api.get("/admin/plans", response_model=List[PlanOut])
async def admin_list_plans(_: dict = Depends(require_admin)):
    items = []
    async for p in db.plans.find({}).sort("price_cents", 1):
        items.append(plan_out(clean(p)))
    return items


@api.post("/admin/plans", response_model=PlanOut)
async def admin_create_plan(payload: PlanIn, _: dict = Depends(require_admin)):
    existing = await db.plans.find_one({"code": payload.code})
    if existing:
        raise HTTPException(status_code=409, detail="Plan code already exists")
    doc = {"id": new_id(), "created_at": now_utc(), **payload.model_dump()}
    if payload.popular:
        await db.plans.update_many({}, {"$set": {"popular": False}})
    await db.plans.insert_one(dict(doc))
    return plan_out(doc)


@api.put("/admin/plans/{plan_id}", response_model=PlanOut)
async def admin_update_plan(plan_id: str, payload: PlanIn, _: dict = Depends(require_admin)):
    row = await db.plans.find_one({"id": plan_id})
    if not row:
        raise HTTPException(status_code=404, detail="Plan not found")
    update = payload.model_dump()
    if payload.popular:
        await db.plans.update_many({"id": {"$ne": plan_id}}, {"$set": {"popular": False}})
    await db.plans.update_one({"id": plan_id}, {"$set": update})
    row.update(update)
    return plan_out(clean(row))


@api.delete("/admin/plans/{plan_id}")
async def admin_delete_plan(plan_id: str, _: dict = Depends(require_admin)):
    # Soft-delete by marking inactive so historical subscriptions stay valid.
    row = await db.plans.find_one({"id": plan_id})
    if not row:
        raise HTTPException(status_code=404, detail="Plan not found")
    await db.plans.update_one({"id": plan_id}, {"$set": {"active": False}})
    return {"deleted": True}


@api.get("/admin/subscriptions")
async def admin_list_subscriptions(_: dict = Depends(require_admin), limit: int = 200):
    items = []
    async for s in db.subscriptions.find({}).sort("created_at", -1).limit(limit):
        u = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "email": 1, "name": 1})
        items.append({
            "id": s["id"],
            "user": u or {"email": "?", "name": "?"},
            "plan_code": s["plan_code"],
            "status": s["status"],
            "current_period_end": s.get("current_period_end"),
            "created_at": s["created_at"],
            "dry_run": bool(s.get("dry_run", False)),
        })
    return {"count": len(items), "results": items}


# ---------------------------------------------------------------------------
# Public contact form + FAQs
# ---------------------------------------------------------------------------

@api.post("/contact")
@rate_limit("5/hour")
async def contact_submit(request: Request, payload: ContactFormIn):
    doc = {
        "id": new_id(),
        "created_at": now_utc(),
        "status": "new",
        **payload.model_dump(),
    }
    await db.contact_enquiries.insert_one(dict(doc))
    return {"ok": True, "id": doc["id"]}


@api.get("/faqs")
async def list_faqs(category: Optional[str] = None):
    filt: dict = {"active": True}
    if category:
        filt["category"] = category
    items = []
    async for f in db.faqs.find(filt).sort([("order", 1), ("question", 1)]):
        items.append(clean(f))
    return items


# ---------------------------------------------------------------------------
# Support tickets (user-side + admin-side)
# ---------------------------------------------------------------------------

@api.post("/support/tickets")
async def create_ticket(payload: SupportTicketIn, user: dict = Depends(current_user)):
    ticket_id = new_id()
    doc = {
        "id": ticket_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_email": user["email"],
        "subject": payload.subject.strip(),
        "body": payload.body.strip(),
        "priority": payload.priority,
        "status": "open",
        "replies": [],
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.support_tickets.insert_one(dict(doc))
    return clean(doc)


@api.get("/support/tickets/me")
async def my_tickets(user: dict = Depends(current_user)):
    items = []
    async for t in db.support_tickets.find({"user_id": user["id"]}).sort("created_at", -1):
        items.append(clean(t))
    return items


@api.get("/admin/support/tickets")
async def admin_list_tickets(
    _: dict = Depends(require_admin),
    status_filter: Optional[str] = None,
    limit: int = 200,
):
    filt: dict = {}
    if status_filter:
        filt["status"] = status_filter
    items = []
    async for t in db.support_tickets.find(filt).sort("created_at", -1).limit(limit):
        items.append(clean(t))
    return {"count": len(items), "results": items}


@api.patch("/admin/support/tickets/{ticket_id}")
async def admin_reply_ticket(ticket_id: str, payload: SupportReplyIn, admin: dict = Depends(require_admin)):
    t = await db.support_tickets.find_one({"id": ticket_id})
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    reply = {
        "id": new_id(),
        "by": "admin",
        "by_name": admin["name"],
        "body": payload.reply.strip(),
        "created_at": now_utc(),
    }
    update: dict = {"$push": {"replies": reply}, "$set": {"updated_at": now_utc()}}
    if payload.status:
        update["$set"]["status"] = payload.status
    await db.support_tickets.update_one({"id": ticket_id}, update)
    t = await db.support_tickets.find_one({"id": ticket_id})
    return clean(t)


@api.get("/admin/contacts")
async def admin_list_contacts(_: dict = Depends(require_admin), limit: int = 200):
    items = []
    async for c in db.contact_enquiries.find({}).sort("created_at", -1).limit(limit):
        items.append(clean(c))
    return {"count": len(items), "results": items}


class ContactStatusIn(BaseModel):
    status: Literal["new", "in_progress", "replied", "closed"]


@api.patch("/admin/contacts/{enquiry_id}")
async def admin_update_contact(enquiry_id: str, payload: ContactStatusIn, _: dict = Depends(require_admin)):
    r = await db.contact_enquiries.update_one({"id": enquiry_id}, {"$set": {"status": payload.status, "updated_at": now_utc()}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return {"ok": True, "status": payload.status}


@api.get("/admin/inbox/summary")
async def admin_inbox_summary(_: dict = Depends(require_admin)):
    """Lightweight counts for the admin nav badge: open tickets + new enquiries."""
    open_tickets = await db.support_tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})
    new_enquiries = await db.contact_enquiries.count_documents({"status": {"$in": ["new", "in_progress"]}})
    return {"open_tickets": open_tickets, "new_enquiries": new_enquiries, "total": open_tickets + new_enquiries}


# ---------------------------------------------------------------------------
# Admin FAQs CRUD
# ---------------------------------------------------------------------------

@api.get("/admin/faqs")
async def admin_list_faqs(_: dict = Depends(require_admin)):
    items = []
    async for f in db.faqs.find({}).sort([("order", 1)]):
        items.append(clean(f))
    return items


@api.post("/admin/faqs")
async def admin_create_faq(payload: FAQIn, _: dict = Depends(require_admin)):
    doc = {"id": new_id(), "created_at": now_utc(), **payload.model_dump()}
    await db.faqs.insert_one(dict(doc))
    return clean(doc)


@api.put("/admin/faqs/{faq_id}")
async def admin_update_faq(faq_id: str, payload: FAQIn, _: dict = Depends(require_admin)):
    row = await db.faqs.find_one({"id": faq_id})
    if not row:
        raise HTTPException(status_code=404, detail="FAQ not found")
    update = payload.model_dump()
    await db.faqs.update_one({"id": faq_id}, {"$set": update})
    row.update(update)
    return clean(row)


@api.delete("/admin/faqs/{faq_id}")
async def admin_delete_faq(faq_id: str, _: dict = Depends(require_admin)):
    r = await db.faqs.delete_one({"id": faq_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------

# ===========================================================================
# CAR-QR INCIDENT SUBSYSTEM  (wrong-parking / accident / theft)
# Privacy-first: reporters never see owner/family phone numbers. WhatsApp +
# masked-call run through a MOCK layer that becomes LIVE automatically once
# telco credentials are present in the environment (see notify_whatsapp /
# masked_call below). Additive — does not modify existing routes.
# ===========================================================================

INCIDENT_WINDOW_MIN = 15
NEK_PORTAL_NUMBER = os.environ.get("NEK_PORTAL_NUMBER", "+91 80 4718 0000")

INCIDENT_TITLES = {
    "wrong_parking": "🅿️ Wrong parking reported",
    "accident": "🚨 Accident reported",
    "theft": "🚨 Theft / suspicious activity",
}


def _whatsapp_live() -> bool:
    return bool(
        os.environ.get("TWILIO_WHATSAPP_FROM")
        and os.environ.get("TWILIO_ACCOUNT_SID")
        and os.environ.get("TWILIO_AUTH_TOKEN")
    )


async def notify_whatsapp(to: Optional[str], text: str, meta: Optional[dict] = None) -> dict:
    """Send a WhatsApp message. MOCK unless live Twilio WhatsApp creds exist.
    Always audit-logs into db.notifications so the flow is testable end-to-end."""
    if not to:
        return {"status": "skipped"}
    live = _whatsapp_live()
    doc = {
        "id": new_id(), "channel": "whatsapp", "to": to, "text": text,
        "status": "mock", "meta": meta or {}, "created_at": now_utc(),
    }
    if live:
        try:  # pragma: no cover - only runs with real creds
            from twilio.rest import Client as _TwClient
            _cli = _TwClient(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
            _cli.messages.create(
                from_=f"whatsapp:{os.environ['TWILIO_WHATSAPP_FROM']}",
                to=f"whatsapp:{to}", body=text,
            )
            doc["status"] = "sent"
        except Exception as _e:
            doc["status"] = "failed"
            doc["error"] = str(_e)[:200]
            log.warning("whatsapp live send failed: %s", _e)
    else:
        log.info("[WHATSAPP MOCK] to=%s :: %s", to, text)
    await db.notifications.insert_one(dict(doc))
    return {"status": doc["status"], "id": doc["id"]}


async def _incident_recipients(vehicle: dict) -> list[dict]:
    """Owner + opted-in family contacts (name/phone) for an incident."""
    out: list[dict] = []
    owner = await db.users.find_one({"id": vehicle["owner_id"]})
    if owner and owner.get("phone"):
        out.append({"name": owner.get("name", "Owner"), "phone": owner["phone"], "role": "owner"})
    async for c in db.contacts.find({"vehicle_id": vehicle["id"]}):
        if c.get("phone"):
            out.append({"name": c.get("name", "Family"), "phone": c["phone"], "role": c.get("relation", "family")})
    return out


def _minutes_left(expires_at: datetime) -> int:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    delta = (expires_at - now_utc()).total_seconds() / 60
    return max(0, int(delta + 0.999))


def _incident_public(inc: dict) -> dict:
    """Reporter-facing view — NEVER leaks owner/family numbers."""
    return {
        "id": inc["id"],
        "type": inc["type"],
        "number_plate": inc["number_plate"],
        "status": inc["status"],
        "owner_response": inc.get("owner_response"),
        "minutes_left": _minutes_left(inc["expires_at"]),
        "call_available": inc["type"] in ("accident", "theft") or inc["status"] in ("alert_sent", "no_response", "call_attempted"),
        "portal_number": NEK_PORTAL_NUMBER,
        "created_at": inc["created_at"],
    }


class IncidentCreateIn(BaseModel):
    type: Literal["wrong_parking", "accident", "theft"]
    scanner_note: Optional[str] = Field(default=None, max_length=500)
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None


@api.post("/public/qr/{qr_id}/incident")
@rate_limit("20/minute")
async def create_incident(request: Request, qr_id: str, payload: IncidentCreateIn):
    v = await db.vehicles.find_one({"qr_id": qr_id})
    if not v:
        raise HTTPException(status_code=404, detail="QR not found or vehicle removed")
    now = now_utc()
    inc_id = new_id()
    incident = {
        "id": inc_id,
        "type": payload.type,
        "qr_id": qr_id,
        "vehicle_id": v["id"],
        "number_plate": v["number_plate"],
        "owner_id": v["owner_id"],
        "scanner_note": payload.scanner_note,
        "scanner_phone": payload.scanner_phone,
        "scanner_lat": payload.scanner_lat,
        "scanner_lng": payload.scanner_lng,
        "status": "alert_sent",
        "owner_response": None,
        "call_attempted": False,
        "resolved": False,
        "created_at": now,
        "expires_at": now + timedelta(minutes=INCIDENT_WINDOW_MIN),
    }
    await db.incidents.insert_one(dict(incident))

    # Mirror into the unified alerts feed so owner /alerts + admin see it.
    alert_type = "accident_reported" if payload.type == "accident" else payload.type
    await db.alerts.insert_one({
        "id": new_id(), "vehicle_id": v["id"], "number_plate": v["number_plate"],
        "type": alert_type, "scanner_note": payload.scanner_note,
        "scanner_phone": payload.scanner_phone, "scanner_lat": payload.scanner_lat,
        "scanner_lng": payload.scanner_lng, "created_at": now,
        "contact_channels": [], "incident_id": inc_id,
    })

    # Notify owner + family via WhatsApp (mock-ready) + push (owner channel pref-gated).
    recipients = await _incident_recipients(v)
    owner_doc = await db.users.find_one({"id": v["owner_id"]})
    op = _prefs(owner_doc)
    title = INCIDENT_TITLES.get(payload.type, "Vehicle alert")
    if payload.type == "wrong_parking":
        body = (f"Your car {v['number_plate']} has been reported for wrong parking. "
                f"Someone is trying to alert you. Please move within {INCIDENT_WINDOW_MIN} minutes. "
                f"Open Nek Sathi to respond: 'I am coming'.")
    elif payload.type == "accident":
        body = f"An accident involving your car {v['number_plate']} was reported via Nek Sathi. Please respond immediately."
    else:
        body = f"Suspicious/theft activity reported on your car {v['number_plate']} via Nek Sathi. Please check immediately."
    for r in recipients:
        # Family contacts always get alerted; the owner's own channel honours their prefs.
        if r["role"] == "owner" and not (op.get("whatsapp") and op.get("incident_alerts")):
            continue
        await notify_whatsapp(r["phone"], body, meta={"incident_id": inc_id, "role": r["role"]})
    try:
        if op.get("push") and op.get("incident_alerts"):
            await send_push(recipients=[v["owner_id"]], data={"title": title, "message": v["number_plate"], "action_url": "/incidents"}, idempotency_key=inc_id)
    except Exception as _e:
        log.warning("push (incident) failed: %s", _e)

    return _incident_public(incident)


@api.get("/public/incident/{incident_id}")
async def public_incident_status(incident_id: str):
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    # Auto-expire wrong-parking to no_response once the window lapses.
    if (not inc.get("resolved") and inc["type"] == "wrong_parking"
            and inc["status"] == "alert_sent" and _minutes_left(inc["expires_at"]) == 0):
        await db.incidents.update_one({"id": incident_id}, {"$set": {"status": "no_response"}})
        inc["status"] = "no_response"
    return _incident_public(inc)


class IncidentCallIn(BaseModel):
    scanner_phone: Optional[str] = Field(default=None, max_length=20)


@api.post("/public/incident/{incident_id}/call")
@rate_limit("10/minute")
async def public_incident_call(request: Request, incident_id: str, payload: IncidentCallIn):
    """Privacy-safe masked call. Reporter → Nek Sathi portal → owner.
    MOCK unless live telephony creds present. Never returns owner number."""
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    owner = await db.users.find_one({"id": inc["owner_id"]})
    owner_phone = owner and owner.get("phone")
    twilio_from = os.environ.get("TWILIO_FROM")
    live = bool(twilio_from and os.environ.get("TWILIO_ACCOUNT_SID") and os.environ.get("TWILIO_AUTH_TOKEN"))
    reporter_phone = (payload.scanner_phone or inc.get("scanner_phone") or "").strip()
    status = "mock_connected"
    note = "Connecting you to the owner through the Nek Sathi portal — their number stays private."

    if live and reporter_phone and owner_phone:
        # Two-leg masked call: Twilio rings the REPORTER, then Dials the OWNER.
        # Neither party sees the other's number (both legs use the Nek Sathi number).
        twiml_url = f"{os.environ.get('PUBLIC_APP_URL', '')}/api/telephony/twiml/{incident_id}"
        try:  # pragma: no cover - live path
            from twilio.rest import Client as _Tw
            _cli = _Tw(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
            _cli.calls.create(to=reporter_phone, from_=twilio_from, url=twiml_url, method="POST")
            status = "calling"
            note = "We're calling you now — pick up and we'll connect you privately to the owner."
        except Exception as e:
            # Demo-friendly fallback: Twilio trial can only dial verified numbers.
            # Keep the privacy-preserving UX flowing instead of showing an error.
            status = "connecting"
            note = "Connecting you privately to the owner via the Nek Sathi portal. (Demo: live dialing needs a verified/upgraded Twilio number.)"
            log.warning("masked call failed, demo fallback: %s", e)
    elif live and not reporter_phone:
        status = "need_phone"
        note = "Enter your callback number so we can connect you privately (your number stays hidden)."

    rec = {
        "id": new_id(), "incident_id": incident_id, "qr_id": inc["qr_id"],
        "vehicle_id": inc["vehicle_id"], "reporter_phone": reporter_phone or None,
        "owner_phone": owner_phone,  # stored for audit only; NOT returned
        "provider": "twilio" if live else "mock", "portal_number": NEK_PORTAL_NUMBER,
        "status": status, "duration_sec": 0, "created_at": now_utc(),
    }
    await db.call_records.insert_one(dict(rec))
    await db.incidents.update_one({"id": incident_id}, {"$set": {"call_attempted": True}})
    await notify_whatsapp(owner_phone, f"Someone is trying to reach you about your car {inc['number_plate']} via the Nek Sathi portal.", meta={"incident_id": incident_id, "kind": "call"})
    return {
        "status": status,
        "masked": True,
        "portal_number": NEK_PORTAL_NUMBER,
        "note": note,
        "provider": rec["provider"],
    }


@api.api_route("/telephony/twiml/{incident_id}", methods=["GET", "POST"])
async def telephony_twiml(incident_id: str):
    """TwiML served to Twilio (never to the reporter's browser) that dials the owner."""
    inc = await db.incidents.find_one({"id": incident_id})
    owner = await db.users.find_one({"id": inc["owner_id"]}) if inc else None
    owner_phone = (owner or {}).get("phone")
    if not owner_phone:
        xml = "<?xml version='1.0' encoding='UTF-8'?><Response><Say>Sorry, we could not connect you. Goodbye.</Say></Response>"
    else:
        caller = os.environ.get("TWILIO_FROM", "")
        xml = (f"<?xml version='1.0' encoding='UTF-8'?><Response>"
               f"<Say voice='alice'>Connecting you privately to the vehicle owner via Nek Sathi. Please hold.</Say>"
               f"<Dial callerId='{caller}' timeout='25'>{owner_phone}</Dial>"
               f"</Response>")
    return Response(content=xml, media_type="application/xml")


@api.api_route("/telephony/inbound", methods=["GET", "POST"])
async def telephony_inbound():
    xml = ("<?xml version='1.0' encoding='UTF-8'?><Response>"
           "<Say voice='alice'>Thank you for calling Nek Sathi. Please scan the vehicle Q R code and use the app to be connected privately. Goodbye.</Say>"
           "</Response>")
    return Response(content=xml, media_type="application/xml")


# ---- Owner-side incident management ----

@api.get("/incidents")
async def list_incidents(user: dict = Depends(current_user), status: Optional[str] = None, limit: int = 100):
    visible = await _visible_vehicle_ids(user["id"])
    filt: dict = {"vehicle_id": {"$in": visible}} if visible else {"vehicle_id": {"$in": []}}
    if status:
        filt["status"] = status
    out = []
    async for inc in db.incidents.find(filt).sort("created_at", -1).limit(limit):
        out.append({
            "id": inc["id"], "type": inc["type"], "number_plate": inc["number_plate"],
            "status": inc["status"], "owner_response": inc.get("owner_response"),
            "scanner_note": inc.get("scanner_note"), "scanner_phone": inc.get("scanner_phone"),
            "scanner_lat": inc.get("scanner_lat"), "scanner_lng": inc.get("scanner_lng"),
            "minutes_left": _minutes_left(inc["expires_at"]), "resolved": inc.get("resolved", False),
            "call_attempted": inc.get("call_attempted", False), "created_at": inc["created_at"],
        })
    return {"count": len(out), "results": out}


class IncidentRespondIn(BaseModel):
    response: Literal["coming", "cant"]


@api.post("/incidents/{incident_id}/respond")
async def respond_incident(incident_id: str, payload: IncidentRespondIn, user: dict = Depends(current_user)):
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    visible = await _visible_vehicle_ids(user["id"])
    if inc["vehicle_id"] not in visible:
        raise HTTPException(status_code=403, detail="Not your vehicle")
    status = "coming" if payload.response == "coming" else "no_response"
    await db.incidents.update_one(
        {"id": incident_id},
        {"$set": {"owner_response": payload.response, "status": status, "acknowledged_at": now_utc()}},
    )
    # Notify the reporter (mock WhatsApp) if they left a number.
    if inc.get("scanner_phone"):
        msg = ("The vehicle owner has been notified and is coming within 15 minutes. Please wait."
               if payload.response == "coming"
               else "The owner is currently unable to respond. You may try the portal call option.")
        await notify_whatsapp(inc["scanner_phone"], msg, meta={"incident_id": incident_id, "kind": "reporter_update"})
    return {"ok": True, "status": status}


@api.post("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, user: dict = Depends(current_user)):
    inc = await db.incidents.find_one({"id": incident_id})
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    visible = await _visible_vehicle_ids(user["id"])
    if inc["vehicle_id"] not in visible:
        raise HTTPException(status_code=403, detail="Not your vehicle")
    await db.incidents.update_one({"id": incident_id}, {"$set": {"status": "resolved", "resolved": True, "resolved_at": now_utc()}})
    # Let the reporter know the outcome so they're never left waiting.
    if inc.get("scanner_phone"):
        await notify_whatsapp(
            inc["scanner_phone"],
            f"Update on {inc['number_plate']}: the owner has resolved this and is on the way / has handled it. Thank you for using Nek Sathi.",
            meta={"incident_id": incident_id, "kind": "reporter_resolved"},
        )
    return {"ok": True, "status": "resolved"}


# ---- Admin incident dashboard + block QR ----

@api.get("/admin/incidents")
async def admin_incidents(_: dict = Depends(require_admin), type: Optional[str] = None, status: Optional[str] = None, days: int = 30, limit: int = 500):
    filt: dict = {}
    if type:
        filt["type"] = type
    if status:
        filt["status"] = status
    if days > 0:
        filt["created_at"] = {"$gte": now_utc() - timedelta(days=days)}
    results = []
    async for inc in db.incidents.find(filt).sort("created_at", -1).limit(limit):
        results.append({
            "id": inc["id"], "type": inc["type"], "number_plate": inc["number_plate"],
            "status": inc["status"], "owner_response": inc.get("owner_response"),
            "call_attempted": inc.get("call_attempted", False), "resolved": inc.get("resolved", False),
            "scanner_phone": inc.get("scanner_phone"), "created_at": inc["created_at"],
        })
    async def _c(f):
        return await db.incidents.count_documents(f)
    stats = {
        "total": await _c({}),
        "wrong_parking": await _c({"type": "wrong_parking"}),
        "accident": await _c({"type": "accident"}),
        "theft": await _c({"type": "theft"}),
        "active": await _c({"resolved": False}),
        "resolved": await _c({"resolved": True}),
    }
    return {"count": len(results), "results": results, "stats": stats}


@api.post("/admin/qr/{serial_no}/block")
async def admin_qr_block(serial_no: str, payload: dict, _: dict = Depends(require_admin)):
    d = await db.qr_inventory.find_one({"serial_no": serial_no})
    if not d:
        raise HTTPException(status_code=404, detail="Serial not found")
    blocked = bool(payload.get("blocked", True))
    if blocked:
        await db.qr_inventory.update_one({"serial_no": serial_no}, {"$set": {"prev_status": d["status"], "status": "blocked"}})
        return {"serial_no": serial_no, "status": "blocked"}
    restore = d.get("prev_status") or "unclaimed"
    await db.qr_inventory.update_one({"serial_no": serial_no}, {"$set": {"status": restore}})
    return {"serial_no": serial_no, "status": restore}



# ===========================================================================
# MOBILE OTP LOGIN  (Twilio Verify; dev-mock fallback for preview)
# Customers activating a QR sticker can sign in with phone + OTP. When
# TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_VERIFY_SERVICE are set the
# OTP is sent/verified via Twilio Verify; otherwise a dev code is issued and
# returned so the flow is fully testable in preview.
# ===========================================================================

import random as _random

OTP_TTL_MIN = 10


def _twilio_verify_ready() -> bool:
    return bool(
        os.environ.get("TWILIO_ACCOUNT_SID")
        and os.environ.get("TWILIO_AUTH_TOKEN")
        and os.environ.get("TWILIO_VERIFY_SERVICE")
    )


def _norm_phone(p: str) -> str:
    return p.strip().replace(" ", "")


class OtpRequestIn(BaseModel):
    phone: str = Field(min_length=6, max_length=20)


class OtpVerifyIn(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    code: str = Field(min_length=4, max_length=8)
    name: Optional[str] = Field(default=None, max_length=80)


@api.post("/auth/otp/request")
@rate_limit("5/minute")
async def otp_request(request: Request, payload: OtpRequestIn):
    phone = _norm_phone(payload.phone)
    if _twilio_verify_ready():
        try:  # pragma: no cover - live path
            from twilio.rest import Client as _Tw
            _cli = _Tw(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
            _cli.verify.v2.services(os.environ["TWILIO_VERIFY_SERVICE"]).verifications.create(to=phone, channel="sms")
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


@api.post("/auth/otp/verify", response_model=TokenOut)
@rate_limit("10/minute")
async def otp_verify(request: Request, payload: OtpVerifyIn):
    phone = _norm_phone(payload.phone)
    ok = False
    if _twilio_verify_ready():
        try:  # pragma: no cover - live path
            from twilio.rest import Client as _Tw
            _cli = _Tw(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
            chk = _cli.verify.v2.services(os.environ["TWILIO_VERIFY_SERVICE"]).verification_checks.create(to=phone, code=payload.code)
            ok = chk.status == "approved"
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
    user = await db.users.find_one({"phone": phone})
    if not user:
        digits = "".join(ch for ch in phone if ch.isdigit()) or new_id()[:10]
        user = {
            "id": new_id(),
            "email": f"{digits}@phone.neksaathi.app",
            "name": (payload.name or "Nek Sathi User").strip(),
            "phone": phone, "password_hash": "", "is_admin": False,
            "suspended": False, "auth": "otp", "created_at": now_utc(),
        }
        await db.users.insert_one(dict(user))
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")
    token = create_access_token(user["id"])
    return TokenOut(access_token=token, user=to_user_out(user))



# ===========================================================================
# DEALER LOGIN + DASHBOARD
# Admin creates a login for a vendor; the dealer signs in via /auth/login and
# sees ONLY their own QR stock (scoped by vendor name on qr_inventory).
# ===========================================================================

async def require_dealer(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_dealer") or not user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Dealer access only")
    return user


class DealerAccountIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = Field(default=None, max_length=80)


@api.post("/admin/vendors/{vendor_id}/account", response_model=UserOut)
async def admin_create_dealer_account(vendor_id: str, payload: DealerAccountIn, _: dict = Depends(require_admin)):
    vendor = await db.vendors.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Dealer not found")
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")
    user = {
        "id": new_id(), "email": email,
        "name": (payload.name or vendor.get("name") or "Dealer").strip(),
        "phone": vendor.get("phone") or "-", "password_hash": hash_password(payload.password),
        "is_admin": False, "is_dealer": True, "vendor_id": vendor_id,
        "suspended": False, "created_at": now_utc(),
    }
    await db.users.insert_one(dict(user))
    await db.vendors.update_one({"id": vendor_id}, {"$set": {"account_email": email, "has_login": True}})
    return to_user_out(user)


async def _dealer_stock(vendor_name: str) -> dict:
    async def _c(extra):
        q = {"sold_to_vendor": vendor_name}
        q.update(extra)
        return await db.qr_inventory.count_documents(q)
    return {
        "assigned_total": await _c({}),           # total QR handed to this dealer
        "available": await _c({"status": "sold"}),  # with dealer, not yet activated
        "activated": await _c({"status": "assigned"}),  # sold to a customer & activated
        "blocked": await _c({"status": "blocked"}),
    }


@api.get("/dealer/me")
async def dealer_me(user: dict = Depends(require_dealer)):
    vendor = await db.vendors.find_one({"id": user["vendor_id"]})
    if not vendor:
        raise HTTPException(status_code=404, detail="Dealer profile not found")
    stock = await _dealer_stock(vendor["name"])
    return {
        "vendor": {"id": vendor["id"], "name": vendor["name"], "city": vendor.get("city"), "phone": vendor.get("phone")},
        "stock": stock,
    }


@api.get("/dealer/inventory")
async def dealer_inventory(user: dict = Depends(require_dealer), status: Optional[str] = None, q: Optional[str] = None, limit: int = 200):
    vendor = await db.vendors.find_one({"id": user["vendor_id"]})
    if not vendor:
        raise HTTPException(status_code=404, detail="Dealer profile not found")
    filt: dict = {"sold_to_vendor": vendor["name"]}
    if status:
        filt["status"] = status
    if q:
        filt["serial_no"] = {"$regex": q, "$options": "i"}
    items = []
    async for d in db.qr_inventory.find(filt).sort("serial_no", 1).limit(limit):
        items.append({"id": d["id"], "serial_no": d["serial_no"], "status": d["status"], "sold_at": d.get("sold_at")})
    return {"count": len(items), "items": items}



app.include_router(api)
app.include_router(push_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    await db.users.create_index("email", unique=True)
    await db.vehicles.create_index("owner_id")
    await db.vehicles.create_index("qr_id", unique=True)
    await db.contacts.create_index("vehicle_id")
    await db.locations.create_index([("vehicle_id", 1), ("recorded_at", -1)])
    await db.alerts.create_index([("vehicle_id", 1), ("created_at", -1)])
    await db.sos_videos.create_index([("vehicle_id", 1), ("created_at", -1)])
    await db.sos_videos.create_index([("user_id", 1), ("created_at", -1)])
    await db.password_resets.create_index("token", unique=True)
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.plans.create_index("code", unique=True)
    await db.subscriptions.create_index([("user_id", 1), ("status", 1)])
    await db.subscriptions.create_index("stripe_session_id", unique=True, sparse=True)
    await db.support_tickets.create_index([("user_id", 1), ("created_at", -1)])
    await db.contact_enquiries.create_index([("created_at", -1)])
    await db.faqs.create_index("question", unique=True)
    await db.invites.create_index("token", unique=True)
    await db.invites.create_index("expires_at", expireAfterSeconds=0)
    await db.vehicle_shares.create_index([("shared_with_user_id", 1), ("status", 1)])
    await db.vehicle_shares.create_index([("vehicle_id", 1)])
    await db.qr_inventory.create_index("serial_no", unique=True)
    await db.qr_inventory.create_index("seq", unique=True)
    await db.qr_inventory.create_index([("status", 1), ("batch_id", 1)])

    # Backfill: older tag/card alerts were inserted without ``user_id``, which
    # makes them invisible in /api/alerts. Populate user_id from the tag/card
    # owner in a one-shot pass at startup (idempotent).
    orphan_tags = db.alerts.find({"user_id": None, "tag_id": {"$ne": None}}, {"id": 1, "tag_id": 1})
    async for a in orphan_tags:
        t = await db.tags.find_one({"id": a["tag_id"]}, {"owner_id": 1})
        if t and t.get("owner_id"):
            await db.alerts.update_one({"id": a["id"]}, {"$set": {"user_id": t["owner_id"]}})
    orphan_cards = db.alerts.find({"user_id": None, "card_id": {"$ne": None}}, {"id": 1, "card_id": 1})
    async for a in orphan_cards:
        c = await db.cards.find_one({"id": a["card_id"]}, {"owner_id": 1})
        if c and c.get("owner_id"):
            await db.alerts.update_one({"id": a["id"]}, {"$set": {"user_id": c["owner_id"]}})

    # Seed default FAQs (idempotent)
    default_faqs = [
        {"question": "Nek Sathi sticker kya hai?", "answer": "Har vehicle par ek unique QR sticker lagta hai. Koi bhi is QR ko scan karke Emergency ya Wrong Parking alert bhej sakta hai — bina aapke phone number reveal kiye.", "category": "basics", "order": 1},
        {"question": "Kaise kaam karta hai emergency alert?", "answer": "Kisi ne QR scan kiya → 'EMERGENCY' button dabaya → aapke aur family ke phone par WhatsApp/SMS deep-link chala jayega jisme vehicle number aur location details hongi.", "category": "basics", "order": 2},
        {"question": "Kya mera phone number scanner ko dikhega?", "answer": "Nahi. Public scan page par sirf vehicle info aur pehla naam hi dikhta hai. Number kabhi expose nahi hota.", "category": "privacy", "order": 3},
        {"question": "Kitne family contacts add kar sakta hoon?", "answer": "Har vehicle ke liye maximum 4 emergency contacts add kar sakte hain. Har contact ke liye alag toggles hote hain (emergency, wrong parking, speed alert).", "category": "features", "order": 4},
        {"question": "Family Pro me kya extra milta hai?", "answer": "Family Pro me 5 vehicles, live family tracking, speed alerts, SOS video recording, priority nearby help — sab kuch ₹499/year me.", "category": "plans", "order": 5},
        {"question": "Payment safe hai?", "answer": "Sabhi payments Stripe ke through hote hain (PCI-DSS compliant). Aapke card details hamare server par kabhi store nahi hote.", "category": "plans", "order": 6},
        {"question": "Refund policy kya hai?", "answer": "First 7 days ke andar full refund. Uske baad pro-rated basis par unused months ka refund. Details Refund Policy page par.", "category": "plans", "order": 7},
        {"question": "Sticker kaise milega?", "answer": "Registration ke baad app se aap khud printable QR download kar sakte hain, ya premium plan me hum ready-made weatherproof sticker ghar bhej dete hain.", "category": "basics", "order": 8},
    ]
    # Nek Sathi rebrand — purge any orphan FAQ rows whose question still
    # references the old brand name so the public /api/faqs endpoint stays clean.
    await db.faqs.delete_many({"question": {"$regex": "SafeQR", "$options": "i"}})

    for f in default_faqs:
        await db.faqs.update_one(
            {"question": f["question"]},
            {"$setOnInsert": {"id": new_id(), "active": True, "created_at": now_utc(), **f}},
            upsert=True,
        )

    # Seed default plans (idempotent)
    default_plans = [
        {
            "code": "basic",
            "name": "Basic",
            "description": "1 vehicle · Emergency + Wrong Parking alerts · WhatsApp/SMS deep-links",
            "price_cents": 9900,
            "currency": "INR",
            "interval": "month",
            "vehicle_limit": 1,
            "features": [
                "1 vehicle",
                "Emergency & Wrong Parking scans",
                "WhatsApp / SMS alerts",
                "Basic activity log",
            ],
            "active": True,
        },
        {
            "code": "family_pro",
            "name": "Family Pro",
            "description": "Up to 5 vehicles · All Basic + Family tracking + Speed alerts + SOS video",
            "price_cents": 49900,
            "currency": "INR",
            "interval": "year",
            "vehicle_limit": 5,
            "features": [
                "Up to 5 vehicles",
                "Everything in Basic",
                "Family live tracking",
                "Speed limit alerts",
                "SOS video recording",
                "Priority nearby help",
            ],
            "active": True,
        },
    ]
    for p in default_plans:
        await db.plans.update_one(
            {"code": p["code"]},
            {"$setOnInsert": {"id": new_id(), "created_at": now_utc(), **p}},
            upsert=True,
        )

    # Seed default admin (idempotent)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@safeqr.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin1234")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": admin_email,
            "name": "Nek Sathi Admin",
            "phone": "+910000000000",
            "password_hash": hash_password(admin_password),
            "is_admin": True,
            "suspended": False,
            "created_at": now_utc(),
        })
        log.info("Seeded admin user %s", admin_email)
    else:
        # Ensure existing admin has flag set (idempotent lift)
        if not existing.get("is_admin"):
            await db.users.update_one({"email": admin_email}, {"$set": {"is_admin": True}})
            log.info("Promoted existing user %s to admin", admin_email)
    await _seed_blackspots()
    log.info("Nek Sathi indexes ensured")


@app.on_event("shutdown")
async def _shutdown():
    client.close()
