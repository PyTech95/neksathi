# NekSathi — Deployment Import Log

**Date:** 2026-06 (import + hardening session)

## What this session did
Imported the uploaded NekSathi codebase (React + FastAPI + MongoDB) into `/app`, got it
running in preview, and hardened it for Emergent one-click deployment.

## App summary
All-in-one personal safety & mobile-security platform: One-Tap SOS, Family Guardian (live map),
Anti-theft/Stolen-phone, Temporary Circles, Smart QR (vehicles/tags/cards), masked calling,
subscriptions (Stripe), and a full admin console. ~40 frontend pages, ~7000-line FastAPI backend.

## Import steps completed
- Copied backend (`server.py`, `comms.py`, `email_client.py`, `push.py`, `vcard.py`, `sticker_html.py`, tests)
  and frontend `src/` + configs into `/app`, preserving platform-protected `.env` files.
- Installed backend deps (`emergentintegrations` via special index; rest via filtered requirements to
  avoid the litellm-URL vs emergentintegrations pip conflict). Installed frontend deps via yarn.
- Added required backend env vars: `JWT_SECRET`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`,
  `PUBLIC_APP_URL`, `FRONTEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (kept `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`).
- Fixed `qrcode.react` module-resolution (reinstall + frontend restart).

## Deployment hardening
- **Removed destructive startup delete**: `db.faqs.delete_many({... regex SafeQR ...})` in `server.py`
  ran on every boot. Removed; FAQ seeding is now purely idempotent `$setOnInsert` upserts.
- deployment_agent: **PASS** (only acceptable TTL-index warnings on ephemeral `password_resets` & `invites`).

## Verification (preview URL)
- `GET /api/` → 200, `GET /api/faqs` → 200, admin login → 200 (JWT issued).
- Landing page renders correctly; frontend compiles (lint warnings only).

## Integrations — all feature-flagged, degrade gracefully when keys absent
MSG91 (WhatsApp/SMS/OTP), Vobiz (masked calls), Stripe (subscriptions), VirusTotal, Google OAuth
(Drive backup), Emergent email/push. To activate any, set its env vars in backend/.env (and in the
deployment env-var settings before/after deploy):
- MSG91: `MSG91_AUTHKEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_SMS_FLOW_ID`, `MSG91_WHATSAPP_NUMBER`,
  `MSG91_WHATSAPP_TEMPLATE`/`_OTP_TEMPLATE`, `MSG91_CALLER_ID`, etc.
- Vobiz: `VOBIZ_AUTH_ID`, `VOBIZ_AUTH_TOKEN`, `VOBIZ_MASKING_DID`.
- Stripe: `STRIPE_API_KEY`.
- VirusTotal: `VIRUSTOTAL_API_KEY`.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`.
- Emergent: `EMERGENT_EMAIL_KEY`, `EMERGENT_PUSH_KEY`.

## Deploy target
User chose **Emergent one-click deploy** ("deploy here"). Deploy via the **Deploy** button in the UI.

## Backlog / next
- Set real integration keys in deployment env before going live (MSG91 verified business WhatsApp number, live Stripe key, etc.).
- Optional: lock `CORS_ORIGINS` to the final deployed origin instead of `*`.
- Optional: custom domain via Deploy → Link domain (Entri).
