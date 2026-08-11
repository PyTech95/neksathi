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

## Landing overhaul + E2E live test — 2026-06 (batch 8, this fork)
- Rewrote `/app/frontend/src/pages/Landing.jsx`: hero with live-scan demo link (/scan/45805f3a-f10a-4534-bc7d-29699029b2cf), stat band, 3 emergency-action cards (Wrong Parking / Accident / Theft), wrong-parking 15-min timeline, factory→family lifecycle, features grid, privacy band, FAQ (details/summary), CTA. All data-testids present. Verified via screenshot — renders clean, no console errors.
- **E2E live verification (iteration_7.json): PASS.** Backend 39/39 pytest green. Frontend all flows PASS: public scan → wrong-parking/accident/theft incident creation, masked call transitions to call-connecting with NO owner phone leaked, admin/owner/dealer logins + dashboards, QR claim (fresh serial claim + 409 double-claim). No open issues.
- **Masked voice call is now REAL** (batch 6/7 update): Twilio trial voice number +19412394367 wired (TWILIO_FROM set); trial dials only to Twilio-verified numbers, otherwise DEMO simulated "connecting". Owner number never exposed.

## Admin Plans Editor + Support Inbox + refresh-safe scan — 2026-06 (batch 9, this fork)
- **Refresh-Safe Waiting**: already implemented — PublicScan appends `?incident=<id>` to the URL on alert and restores the waiting/"owner is coming" state on reload (PublicScan.jsx lines 28-35, 56).
- **Reporter WhatsApp Updates**: already implemented — when the owner taps "I AM COMING", backend `respond_incident` (server.py ~3626) sends the reporter a WhatsApp update (mock via notify_whatsapp; live when Twilio WhatsApp creds set).
- **Admin Plans Editor** (`/admin/plans`, `AdminPlans.jsx`): create/edit/archive/reactivate subscription plans (code, name, price ₹→paise, interval, vehicle_limit, features, active) via existing `/admin/plans` CRUD. Active plans flow straight to the user Plans page. Linked from Admin hub card.
- **Support Inbox**: user `Support.jsx` (`/support`, nav link) to create tickets + view replies/status; admin `AdminSupport.jsx` (`/admin/support`) inbox with status filter, threaded replies, and status changes (open/in_progress/resolved/closed). Uses existing `/support/tickets`, `/support/tickets/me`, `/admin/support/tickets` (+PATCH). Linked from Admin hub card.
- Verified: admin plans list/create/update/archive and full ticket lifecycle (user create → admin reply+resolve → user sees reply) all pass via curl; Admin Plans UI verified via screenshot. Frontend compiles clean (only a pre-existing Admin.jsx eslint warning).

## Contact enquiries + ticket badge + plan highlight + reporter resolve — 2026-06 (batch 10, this fork)
- **Contact Enquiries**: public `Contact.jsx` (`/contact`, linked from landing footer) posts to `POST /contact`; admin `AdminContacts.jsx` (`/admin/contacts`) lists enquiries with status filter and one-tap status actions via new `PATCH /admin/contacts/{id}` (new|in_progress|replied|closed).
- **Ticket / Enquiry Badge**: new `GET /admin/inbox/summary` ({open_tickets, new_enquiries, total}). TopNav shows a red badge on the admin "Admin" link (nav-admin-badge = total); Admin hub cards show per-section counts (hub-badge) on Support inbox and Contact enquiries.
- **Plan Highlight**: `popular` flag added to PlanIn/PlanOut; POST/PUT `/admin/plans` enforce a single popular plan (setting one clears the rest). AdminPlans editor has a "Most popular" toggle + card chip; user Plans page (`Subscription.jsx`) now highlights `p.popular` (replaced the hardcoded family_pro check).
- **Reporter Live Status**: `resolve_incident` now sends the reporter a WhatsApp "owner resolved / arriving" follow-up (mock via notify_whatsapp; audit-logged, swallowed on trial).
- Verified: all backend flows via curl (single-popular enforcement, contact submit + status PATCH, inbox summary, reporter-resolved notification audit) and **testing_agent frontend run — 19/19 flows PASS, no bugs** (iteration_8.json). Demo left clean (family_pro sole popular plan).

## Owner Settings (profile & notification preferences) — 2026-06 (batch 11, this fork)
- New `Settings.jsx` (`/settings`, nav link `nav-settings`): owners edit name & phone, toggle 6 notification preferences (WhatsApp / Push / Email / Incident alerts / Overspeed alerts / Offers), and change password.
- Backend: added `NotifyPrefs` model, extended `UserOut` + `to_user_out` + `ProfileUpdate`, and `PUT /auth/me` now persists `notify_prefs`. Reused existing `POST /auth/change-password`. AuthContext user refreshed after save.
- Verified via curl (GET defaults → PUT name/phone/prefs → GET persists) and screenshot (page renders, toggles reflect saved state, nav link present). Demo user restored to clean defaults.

## Profile photo / avatar — 2026-06 (batch 12, this fork)
- Owners can now add an avatar in Settings: file picker → client-side downscale to 256px JPEG → stored as `avatar_base64` on the user (backend: added to UserOut/ProfileUpdate/update_me, ~1.5MB cap). Preview circle + Change/Remove buttons.
- Avatar shows in the top nav next to "Settings" (nav-avatar), and new Share-Tap cards default their photo to the owner's avatar so public shared cards feel personal (PublicCard already renders photo_base64).
- Verified via curl (avatar persists on /auth/me; card create stores photo) and screenshot (Settings avatar UI + nav avatar). Test data cleaned; demo user reset.

## Multi-persona expansion + landing revamp — 2026-06 (batch 13, this fork)
- **Repositioned beyond cars**: Nek Sathi now targets people & belongings. Landing page revamped — broadened hero copy, new "Built for everyone" personas section (School kids, Patients & elderly, Office & workplace, Pets, Travel/luggage, Vehicles) with stock imagery, and a "Trusted by families & teams" testimonials band.
- **New tag personas**: added `patient` and `staff` tag types (TAG_META + backend Literal). Guardian/ICE fields (guardian_name, guardian_phone) added to person/kid/patient/staff tags (TagIn/TagOut) and shown in the Tags create form.
- **Emergency ICE + masked guardian call**: public tag page (`/t/:qr`) shows an ICE card (blood group, allergies/medical notes, guardian NAME) and a privacy-safe **"Call guardian (private)"** button → new `POST /public/tag/{qr}/call` masked-call endpoint. Guardian/owner phone is NEVER returned; `has_guardian` flag drives the button (tightened to person-types).
- **Tag alerts now notify guardian + owner** via WhatsApp (mock, pref-gated) + push (pref-gated).
- **Notification preferences honoured**: incident create, overspeed alerts and tag alerts now respect the owner's `notify_prefs` (whatsapp/push channels + incident_alerts/speed_alerts) via `_prefs()` helper. Family contacts on incidents are always alerted; the owner's own channel honours their toggles.
- Verified via curl (guardian create/read with phone never leaked, masked call, has_guardian correctness) and **testing_agent (iteration_9.json): 20+ flows PASS, no defects**.

## Bulk tag orders + emergency broadcast + persona pages — 2026-06 (batch 14, this fork)
- **Bulk Tag Orders**: admins can pre-designate a QR batch as `product_type=tag` for an organization (`org_name`) in /admin/qr. Scanning an unclaimed tag serial opens `/claim/{serial}` which now branches to a TAG registration form (name, type, and medical + guardian fields for person/kid/patient/staff) — mirroring the car claim flow. Backend: BulkGenerateIn(product_type, org_name) → stored as intended_type/org_name; /public/claim returns them; /qr/claim tag branch persists guardian/medical.
- **Emergency Broadcast**: `kid_help`/`sos`/`emergency` tag scans now ALWAYS alert BOTH guardian and owner (bypassing notification prefs) with a live Google-Maps location link. Non-emergency scans still honour prefs.
- **Persona Landing Pages**: `/for/schools`, `/for/hospitals`, `/for/offices` (PersonaLanding.jsx) — tailored hero + imagery, 4 benefit cards, "how the bulk order works" steps, and Register/Contact CTAs. Landing persona cards link to them via "Learn more →". Invalid persona redirects home.
- Verified via curl + **testing_agent (iteration_10.json): backend 7/7 pytest, frontend 100%, no defects**. Guardian phone never leaked; emergency notifies both parties. Test data cleaned.

## Organization portal + go-live hardening — 2026-06 (batch 15)
- **Organization portal**: admin creates schools/hospitals/offices + a login (/admin/orgs); org logs in via normal /login and lands on /org showing issued/activated/pending tag counts, the activated tag list, and scan alerts across their tags. New role flags is_org/org_id (mirrors dealer pattern, reuses existing bcrypt+JWT, verified no password_hash leak, require_org 403 gating). Tag batches linked to org via /admin/qr org dropdown; claim stamps org_id onto the tag.
- **Tag editing**: TagDetail edit modal — update name/type/description, guardian, medical info & photo (client-downscaled). Uses existing PUT /tags/{id} (owner-scoped).
- **Emergency SMS fallback**: send_sms() helper; if a live WhatsApp emergency send fails, SMS fires to guardian (mock on trial, graceful).
- **Solutions nav dropdown**: guest top-nav links to /for/schools|hospitals|offices.
- **Go-live hardening**: deployment_agent scan = PASS (no blockers — no hardcoded secrets/URLs, env-driven, /api-prefixed, CORS ok). Added .limit() guards to /vehicles(100), /tags(500), /cards(100) per recommendation.
- Verified: **testing_agent iteration_11 — backend 8/8 pytest, frontend 100%, no defects**. Demo org 'Sunrise School' (school@nek.dev/school1234) retained.

## Chunked SOS upload + WhatsApp Business wiring — 2026-06 (batch 16)
- **Resumable chunked SOS video upload** (mobile long clips): POST /user/sos-video/init → /chunk (≤5MB each, idempotent per index) → GET /status/{upload_id} (missing indexes for resume) → POST /complete (assembles in order, alerts + pushes family, clears chunks; 400 if incomplete, 413 if >~60MB). Indexes added on sos_chunks/sos_uploads. Curl-verified incl. out-of-order + resume + early-complete-400.
- **WhatsApp Business wiring**: notify_whatsapp() + _whatsapp_live() now support an approved WhatsApp Business **Messaging Service** via TWILIO_WHATSAPP_MESSAGING_SID (falls back to TWILIO_WHATSAPP_FROM). Env-driven, production-ready — awaiting the user's approved sender/MSID to flip off sandbox. MOBILE_API.md updated with the chunked endpoints.

## Dual-camera photo evidence on public scan — 2026-06 (batch 17)
- **Photo evidence + silent reporter selfie** on the public QR scan flow (`PublicScan.jsx`). On Wrong Parking / Accident / Theft the reporter gets a "Take a photo (optional)" step: the **back camera** opens a viewfinder to shoot the vehicle, and a **front-camera selfie of the reporter is captured silently** in the same step. New `CameraCapture.jsx` component: tries **true simultaneous** dual-camera first, falls back to **sequential** (snap car → silently grab front frame) on single-camera phones (iOS). Images downscaled to ~1024px JPEG client-side.
- Backend: `IncidentCreateIn` + `create_incident` now accept/store `evidence_photo_base64` (vehicle) and `reporter_photo_base64` (selfie), 5MB/photo guard; evidence mirrored into the alerts feed. `GET /incidents` returns both photos to the owner. Public incident status (`_incident_public`) intentionally does NOT return the selfie — reporter never sees it (fully silent per user).
- Owner Incidents page (`Incidents.jsx`) shows both thumbnails ("Vehicle" + "Reporter"), click to open full size.
- Photo is **optional/skippable** (so a denied camera permission never blocks the safety-critical alert). Note: browsers show an OS camera-use indicator + permission prompt — unavoidable; capture only works if the reporter grants camera access.
- Verified: curl (incident create with both photos → owner /incidents returns both; public status hides selfie) + screenshot (photo step renders on wrong-parking). Camera hardware capture itself needs a real-device test.

## MSG91 go-live status — 2026-06 (batch 17)
- Auth Key saved in backend/.env (validated — MSG91 accepted it). ⚠️ Account balance = 0 (needs top-up). Still MOCK because per-channel template/flow IDs (OTP template, SMS flow, WhatsApp number/template, voice caller id) are not yet provided. Deployment scan = PASS, zero code blockers — app can deploy today in mock mode.
- User exploring **Vobiz** for masked voice routing (REST API, number masking + click-to-call; can slot into comms.py alongside MSG91). Awaiting Vobiz Auth ID/Token + masking DID.

## Expanded scan reasons + admin false-report guard — 2026-06 (batch 18)
- **7-reason public scan screen** (`PublicScan.jsx`, data-driven `REASONS` config): Wrong Parking, Vehicle Blocking, Headlight ON, Door / Window Open, Emergency, Vehicle Damage, Other — each with its own gradient + lucide icon. Replaced the old 3-button (parking/accident/theft) choose screen. `accident`/`theft` types kept valid in the backend for backward compatibility, just no longer on the public menu.
- Backend `IncidentCreateIn` Literal extended; centralized `INCIDENT_TITLES` + `_incident_body()` per-type; `WINDOW_TYPES` (parking + blocking = 15-min countdown + I-am-coming) and `URGENT_TYPES` (emergency/accident/theft/damage bypass owner notify-prefs + always offer a private call). Photo evidence + silent selfie apply to every reason.
- Owner (`Incidents.jsx`) + Admin (`AdminIncidents.jsx`) META + filter updated for all reasons.
- **Admin false-report guard**: `GET /admin/incidents` returns both photos; admin Incident-history table has an "Evidence" column showing the Vehicle photo + Reporter selfie (click to enlarge) to trace misuse.
- Verified: curl (all 7 reason types create incidents; admin returns both photos) + screenshot (all reason buttons render, emergency keeps photo step).


- iteration_7.json: **Landing overhaul + full QR/parking/accident E2E** — backend 39/39 pytest, frontend 100% on all tested flows. No issues.
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
