# Nek Saathi — PRD (Emergent web adaptation)

**Date:** 2026-06 (restored/adapted in this pod)
**Original app:** "Nek Saathi" / "SafeQR Guardian" — an Expo React Native (SDK 54) + FastAPI + MongoDB mobile app for vehicle-safety QR stickers.

## IMPORTANT environment note
This preview pod was provisioned with the **React web (CRA/craco + shadcn) base image**, NOT the Expo base image. The uploaded codebase's Expo/React-Native frontend **cannot run here** (needs Metro + Expo tooling + platform-managed EXPO_PACKAGER_* vars). Per platform rules, a pod's base image is fixed at creation.

**Decision (user asked to "deploy here / preview link"):**
- Kept the ORIGINAL FastAPI backend (`/app/backend/server.py`, unchanged) running on this pod. It is fully compatible.
- Built a NEW React web frontend (`/app/frontend/src/**`) against that backend, covering the core QR-scan value as a web app.
- The full native mobile app (native camera SOS, push notifications, accelerometer accident detection, GPS sensors) would require a **new Mobile App job** on Emergent (Expo image).

## Original problem statement
User uploaded a zip of the Expo app and said "deploy here" then "preview link".

## Stack (as running now)
- Backend: FastAPI + Motor (MongoDB), JWT auth (bcrypt), original 3000+ line server.py. Runs via supervisor on :8001, all routes under `/api`.
- Frontend: React 19 + react-router-dom 7 + axios + qrcode.react + lucide-react. Dark-neon glassmorphism theme (Chakra Petch + Manrope fonts). Runs via supervisor (craco) on :3000.
- DB: local MongoDB (`test_database`).

## What's been implemented (web)
- Landing page (hero, features, how-it-works, CTA).
- Auth: register + login (JWT in localStorage), auth-guarded routes, admin-only guard.
- Owner Dashboard: list/add/delete vehicles.
- Vehicle detail: live QR code (points to /scan/{qr_id}), copy link, download PNG, preview public page, lost-mode toggle, family contacts (add/list/delete, max 4).
- Public scan page `/scan/:qrId`: vehicle info + 5 big alert actions (emergency, wrong_parking, theft, fire, towing) with optional note/phone/geolocation -> posts alert, owner phone never shown.
- Alerts feed: typed icons, note, callback phone, map link.
- Admin console: stats cards + users table with search + suspend/reactivate.

## Testing
- iteration_1.json: backend 100% (12 pytest), frontend 100% (12 UI flows). No blocking issues.
- iteration_2.json: frontend 100% for the 3 new features (Tags, Cards, Subscriptions dry-run) + regression clean.
- iteration_3.json: frontend 100% for Live Tracking, Family Invites, Admin Alerts+CSV + regression clean.
- iteration_4.json: **Car QR module** — backend 17/17 pytest, frontend 100%, privacy assertions verified (owner phone never exposed on public/call screens).
- iteration_5.json: **Mobile OTP login** — frontend 100% (6/6), backend OTP verified via curl.

## Mobile OTP login — implemented 2026-06 (batch 5)
- `/otp-login` 2-step (phone → code). Backend POST /api/auth/otp/request + /api/auth/otp/verify.
- Twilio Verify when TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN+TWILIO_VERIFY_SERVICE set; else DEV code returned & shown in UI.
- Auto-creates user by phone (placeholder email {digits}@phone.neksaathi.app). Entry: Login page link + QR claim redirect (/otp-login?next=/claim/:serial).

## Live comms — Twilio wired 2026-06 (batch 6)
- Twilio account "Neksathi" (**Trial**). Env set in backend/.env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE (VA…, auto-created), TWILIO_WHATSAPP_FROM=+14155238886 (sandbox), NEK_PORTAL_NUMBER.
- **OTP SMS: LIVE** via Twilio Verify. Trial limit: only sends to numbers verified in Twilio console until account is upgraded (unverified → 403 shown in UI). Dev-code path no longer shows once Verify is configured.
- **WhatsApp: LIVE** via sandbox — recipient must join the sandbox (send the join code) to receive; send failures are swallowed & audit-logged in db.notifications (status sent/failed), so incident flow never breaks.
- **Masked call: still MOCK** — trial account has no voice number (TWILIO_FROM unset → _telco_provider()=='whatsapp'). Buy a Twilio voice number + set TWILIO_FROM (and a public voice webhook/IVR) to bridge for real.
- To fully unlock: upgrade Twilio from Trial (or verify test numbers), join WhatsApp sandbox, purchase a voice number.

## GO-LIVE checklist for comms (pending user keys)
- WhatsApp notify: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM → notify_whatsapp() auto-goes live.
- OTP SMS: set TWILIO_VERIFY_SERVICE (+ SID/token) → OTP auto-goes live.
- Masked call: set TWILIO_ACCOUNT_SID/TOKEN/TWILIO_FROM (Twilio) or EXOTEL_SID/EXOTEL_TOKEN (Exotel) → _telco_provider() switches; note: real IVR/proxy bridge webhook still needs wiring for true two-leg masking.

## Car QR Code module — implemented 2026-06 (batch 4)
- **Admin Car-QR** (`/admin/qr`): bulk generate (≤10k), batches, CSV export, printable stickers (`stickers.html`), inventory w/ status filter+search, block/unblock, mark-sold to dealer.
- **Dealers** (`/admin/dealers`): vendor list + summary (qty/billed/outstanding) + create.
- **QR Activation** (`/claim/:serial`): unclaimed→login+register vehicle→Activated; already-assigned→auto-redirect to public `/scan/:qr_id`; blocked→blocked screen.
- **Public scan** (`/scan/:qrId`): "How can we help?" → Wrong Parking / Accident / Theft. Wrong-parking starts a 15-min incident + WhatsApp/push notify; reporter waiting screen polls status; owner responds **I AM COMING** (or can't) from `/incidents`; reporter sees "owner is coming". **Masked portal call** (Reporter→NekSathi portal→Owner) never reveals owner number.
- **Owner Incidents** (`/incidents`): respond (coming/can't) + resolve.
- **Admin Incidents** (`/admin/incidents`): stats + filterable history.
- **Privacy**: owner/family numbers never returned to reporters; call bridged via portal number; audit in db.call_records / db.notifications.
- **MOCKED (ready for live keys)**: WhatsApp `notify_whatsapp()` (audit-logged; live when TWILIO_WHATSAPP_FROM + Twilio creds set) and masked call (live with Twilio/Exotel creds via telco-config). Backend tests: `/app/backend/tests/test_car_qr_incidents.py`.

## What's been implemented (web) — updated 2026-06 (batch 3)
- **Live Tracking** `/track/:id`: Leaflet/OSM map with GPS trail, current-speed vs limit stats, "Simulate a drive" (posts pings, triggers overspeed alerts), speed-alert list.
- **Family Invites**: vehicle detail "Invite family" -> shareable `/invite/:token` link; `/invite/:token` accept page (login-redirect via ?next=); Dashboard "Shared with me" section (GET /shared-vehicles); shared vehicles' alerts fold into /alerts.
- **Admin Alerts**: filterable feed (type/days/plate) + **CSV export** (auth blob download).

## What's been implemented (web) — updated 2026-06
- (all of iteration 1 above) PLUS:
- **QR Tags**: `/tags` list+create (kid/pet/bag/luggage/keys/phone/laptop/door/other, med info for people, reward text), `/tag/:id` detail (QR, copy/download, lost mode), public `/t/:qrId` scan with Found/Emergency/Theft/Damage/Contact actions + med badge.
- **Digital Cards (Share Tap)**: `/cards` list+create (title/company/bio/contact/socials/accent), `/card/:id` detail (QR), public `/c/:qrId` profile with call/email/web tiles, **Save Contact vCard** download (`/api/public/card/{qr}/vcf?dl=1`), social chips, and a contact-message form.
- **Subscriptions**: `/subscription` shows seeded Basic (₹99/mo) & Family Pro (₹499/yr) plans with features; Subscribe uses checkout-session → (DRY-RUN) auto-confirm → active banner. Real Stripe key would redirect to hosted checkout.
- Nav updated: Vehicles / Tags / Cards / Alerts / Plans (+ Admin for admins).

## Backlog / not ported to web
Original app has ~60 screens; remaining web parity targets:
- P1: Settings (profile edit, change password, data export, delete account, consent, language/theme), Forgot/Reset password UI.
- P1: Support (user tickets) + Admin Support tickets; Contact form.
- P2: Family screen (manage/revoke shares), Nearby help, Analytics dashboard, Onboarding.
- P2: Admin: Plans CRUD UI, Subscriptions list, Contacts/enquiries, Telco config, Vendors, QR inventory, FAQs; Claim flow (/claim/:serial); Legal (privacy/terms/refund/cookie) + About.
- Mobile-only (needs Expo job): native camera SOS video, push notifications, accelerometer accident detection, overspeed GPS sensors. (available in original backend, need UI)
- P1: QR Tags (kids/pets/bags/keys) CRUD + public tag scan page (`/api/tags`, `/api/public/tag/{qr}`).
- P1: Share Tap digital business cards + vCard (`/api/cards`, `/api/public/card/{qr}/vcf`).
- P2: Subscriptions/Stripe checkout (DRY-RUN in preview), plans.
- P2: Family invites + shared vehicles, live tracking map, blackspots, nearby help.
- P2: Admin: alerts feed + CSV export, plans CRUD, support tickets, QR inventory/vendors.
- Mobile-only (needs Expo job): native camera SOS video, push notifications, accelerometer accident detection, overspeed GPS.
