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
