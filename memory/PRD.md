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

## Backlog / not ported to web (available in original backend, need UI)
- P1: QR Tags (kids/pets/bags/keys) CRUD + public tag scan page (`/api/tags`, `/api/public/tag/{qr}`).
- P1: Share Tap digital business cards + vCard (`/api/cards`, `/api/public/card/{qr}/vcf`).
- P2: Subscriptions/Stripe checkout (DRY-RUN in preview), plans.
- P2: Family invites + shared vehicles, live tracking map, blackspots, nearby help.
- P2: Admin: alerts feed + CSV export, plans CRUD, support tickets, QR inventory/vendors.
- Mobile-only (needs Expo job): native camera SOS video, push notifications, accelerometer accident detection, overspeed GPS.
