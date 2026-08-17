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

## Theft button + required photo + reason analytics — 2026-06 (batch 19)
- **Theft / Suspicious** re-added as the 8th public scan reason (`PublicScan.jsx` REASONS). Backend already supported `theft` (URGENT).
- **Required photo**: the vehicle photo is now mandatory to send an alert (button disabled + red "Take a photo (required)" until captured) — stronger proof against false reports. Safety exception: **Emergency & Theft keep the photo optional** (`photoOptional` flag) so a genuine emergency is never blocked if the camera is denied.
- **Reason analytics**: owner Incidents page (`Incidents.jsx`) shows an "Alert reasons breakdown" band — a per-reason count chip (icon + colour + count), aggregated client-side from the owner's incidents, so patterns stand out.
- Verified via screenshot (theft button present; wrong-parking alert disabled w/o photo, label "required"; emergency stays optional) + clean compile.
- **Vobiz masked calling**: pending user credentials (Auth ID, Auth Token, masking DID). Will wire via integration playbook once received — replaces/augments MSG91 voice in comms.py, with a backend answer-URL webhook to bridge reporter↔owner privately.

## Vobiz masked-calling integration — 2026-06 (batch 20)
- **Vobiz two-way private call bridge** wired into the incident + tag masked-call flows (`comms.py` + `server.py`). Reporter is dialed FROM the Vobiz masking DID; on answer, Vobiz fetches our answer webhook which returns `<Dial callerId="DID"><Number>owner</Number></Dial>` XML — neither party sees the other's real number.
- `comms.py`: added `e164()`, `vobiz_live()`, `vobiz_did()`, `vobiz_place_call()` (POST https://api.vobiz.ai/api/v1/Account/{auth_id}/Call/ with X-Auth-ID/X-Auth-Token headers).
- `server.py`: `_bridge_masked_call()` provider router (Vobiz → MSG91 → mock); new public webhooks `POST /api/vobiz/answer` (returns bridge XML, uses a `db.call_sessions` token→target map), `/api/vobiz/dial-result`, `/api/vobiz/hangup` (audit to db.call_records). Incident-call + tag-call endpoints now route through `_bridge_masked_call`.
- Env: `VOBIZ_AUTH_ID`, `VOBIZ_AUTH_TOKEN`, `VOBIZ_MASKING_DID=+918065353952` all set → **Vobiz voice is now LIVE**. Answer/hangup URLs are built from `PUBLIC_APP_URL` — **on the deployed site (neksathi.in) the backend's `PUBLIC_APP_URL` MUST be `https://neksathi.in`** so the answer_url points there. DID attached in Vobiz Console to an XML Application with Answer URL `https://neksathi.in/api/vobiz/answer`.
- Verified via curl: incident masked call now returns `provider:"vobiz"`, status `calling` (Vobiz accepted the request → auth valid); answer webhook returns correct bridge XML (target → E.164, DID as callerId); session token flow works. No real number was rung (invalid test destination used).
- **Photo now REQUIRED for ALL 8 reasons** (user choice, batch 20) — `photoOptional` removed from emergency + theft. Note: on a device with no/denied camera the alert can't be sent; acceptable per explicit user decision for a phone-scan product.

## Admin call logs + emergency photo bypass — 2026-06 (batch 21)
- **Admin Call Logs** (`/admin/calls`, `AdminCalls.jsx`, hub card `link-admin-calls`): monitors every masked call attempt — subject (plate/tag), type (vehicle/tag), provider (Vobiz/MSG91/mock), status, duration, masked reporter number, timestamp. Stat cards (total / via Vobiz / connected / mock). Backend `GET /admin/call-records` (admin-only) with provider filter; reporter numbers masked via `_mask_phone`, owner/guardian numbers NEVER returned.
- Call records now stamp `call_token`, `number_plate`, `kind` (incident|tag_guardian) and `duration_sec`. Vobiz `dial-result`/`hangup` webhooks patch `duration_sec` + `final_status` onto the matching record by token.
- **Emergency photo bypass** (`PublicScan.jsx`): `photoOptional` restored to **Emergency** so a user with a blocked/absent camera can still raise an emergency. Photo remains REQUIRED for the other 7 reasons (wrong_parking, vehicle_blocking, headlight_on, door_open, vehicle_damage, other, theft).
- Verified: curl (`/admin/call-records` returns masked reporter, provider vobiz, subject plate, duration) + screenshot (admin call-logs page renders with stats, filter, table). Test call records cleaned.

## Call recordings in admin logs — 2026-06 (batch 22)
- **Vobiz call recording**: the answer XML now emits a `<Record fileFormat="mp3" recordSession="true" callbackUrl=.../api/vobiz/recording?token=...>` before `<Dial>`, so the full bridged call is recorded. New `POST /api/vobiz/recording` webhook stores `recording_url` (+ `recording_duration`) on the matching call record by token.
- Admin Call Logs (`AdminCalls.jsx`) has a **Recording** column with a ▶ Play link (opens the Vobiz mp3) when available; `GET /admin/call-records` returns `recording_url`.
- Verified via curl: answer XML contains `<Record>`; recording webhook stores the URL; admin endpoint returns it.
- ⚠️ **Consent note**: recording calls has legal/consent obligations in many regions — consider a short "this call may be recorded" notice; flagged to user.

## Live web-portal alarm — 2026-06 (batch 23)
- **In-portal live alarm** for vehicle owners (no external keys, works on preview + anywhere). New `GET /incidents/live` (auth) returns the owner's unresolved incidents from the last 24h. New `LiveAlarm.jsx` mounted in `TopNav`: polls every 10s, baselines existing incidents on load, and on any NEW incident shows a glowing red **banner** (type + plate + note + View/Mute/Dismiss), plays a **Web Audio alarm** (3 rising beeps, mute toggle persisted in localStorage), and shows a **bell badge** with the active count. Audio unlocked on first pointer gesture (autoplay policy).
- Solves the "owner/family get no alarm on the web portal" gap that existed because WhatsApp/SMS (MSG91) and push (EMERGENT_PUSH_KEY) are still mock/unconfigured.
- Verified E2E via screenshot: logged in as demo owner → triggered an emergency incident → red banner appeared + bell showed "1" within the poll cycle. Test data cleaned.
- IMPORTANT diagnosis logged: the alert *code* fires correctly (incident created + notify dispatched) but delivery is MOCK — real owner/family delivery needs MSG91 WhatsApp/SMS go-live (templates + balance) and/or Emergent Deploy for mobile push.

## Masked call bridge → owner + family simul-ring — 2026-06 (batch 24)
- **Fixed "owner/family not getting the call"**: the Vobiz answer webhook previously dialed only the owner. Now `_bridge_masked_call` accepts a list of targets and the incident-call endpoint passes **owner + all family contacts**; the answer XML **simul-rings all of them** in one `<Dial>` (whoever answers first connects), behind the masking DID caller id. Added a "Please hold, connecting you privately to the vehicle owner" greeting.
- Flow reminder (correct architecture for a single shared DID): reporter taps Call → enters their number (required, so we can call them) → Vobiz calls the reporter from the DID → on answer, bridges to owner+family. Reporter's number is required because dial-in masking on one shared DID can't route to the right owner without an IVR.
- Verified via curl: answer XML contains `<Number>owner</Number><Number>family</Number>` with `callerId=DID`.
- ⚠️ **Deploy note**: this fix is in PREVIEW. Production (neksathi.in) must be **redeployed** to get it, and its `PUBLIC_APP_URL` must equal the environment placing the call so Vobiz can reach `/api/vobiz/answer`.

## Reporter dial pad — 2026-06 (batch 25)
- Replaced the plain number input in the scan → "Call owner" flow with a **touch dial pad** (`PublicScan.jsx` `dialPad()`): number display box + 3×4 keypad (1-9, +, 0, ⌫), Call button enabled only at ≥10 digits. Used in both the initial call step and the need_phone step. Verified via screenshot. CSS in index.css (`.dial-display/.dial-grid/.dial-key`).


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

## Update 2026-06 — WhatsApp OTP LIVE
- OTP login now delivered over WhatsApp (MSG91) — user confirmed real delivery + login working.
- Server generates 6-digit code, stores in db.otp_codes (10-min TTL), delivers via approved Utility template `neksathi1` (body_1 = OTP), verifies locally.
- Kept SEPARATE from general alert WhatsApp (new env `MSG91_WHATSAPP_OTP_TEMPLATE`); general incident alerts remain MOCK until `MSG91_WHATSAPP_TEMPLATE` is set.
- comms.py: `whatsapp_otp_live()`, `send_whatsapp_otp(phone, code)`. server.py: WhatsApp branch in `/api/auth/otp/request` (channel="whatsapp"), verify uses local store.
- env set: MSG91_WHATSAPP_NUMBER=15553779998, MSG91_WHATSAPP_OTP_TEMPLATE=neksathi1, MSG91_WHATSAPP_LANG=en. Namespace not required for this account.
- STILL MOCK: SMS OTP (MSG91_OTP_TEMPLATE_ID/SMS_FLOW_ID empty — "SMS later"), general WhatsApp alerts, Stripe payments.

## Update 2026-06 — Personal Safety Suite (Phase 1) — from 26-feature roadmap
New "Safety Center" at /safety (nav link "SOS"). All backend curl-tested + frontend screenshot-verified.
DONE:
- #1 One-Tap SOS — big panic button, 3s countdown, grabs GPS, fans out to all trusted contacts (WhatsApp+SMS+push) w/ Google Maps link. POST /api/me/sos, GET /api/me/sos-events. Collection: sos_events.
- #5 + #18 Trusted/Emergency Contacts (UNLIMITED) — full CRUD, primary flag. /api/me/emergency-contacts (GET/POST/PUT/DELETE). Collection: emergency_contacts.
- #6 Important Helplines — tap-to-call directory (112,100,101,102,108,1091,1098,1930,1073,14567,139).
- #17 Emergency Siren — Web Audio wailing siren (no asset), start/stop.
- #3 Live Location Sharing — revocable public link /live/:token (Leaflet map, 5s auto-refresh). Sharer device posts /api/me/location via watchPosition. Endpoints: POST /api/me/live-share, GET /api/me/live-shares, POST /api/me/live-share/{id}/stop, POST /api/me/location, GET /api/public/live/{token}. Collections: live_shares, user_locations.
- #4 Emergency Notifications — already existed; now also driven by SOS fan-out.
Files: backend/server.py (Personal Safety + Live Location sections), frontend/src/pages/Safety.jsx, LiveView.jsx; routes in App.js; nav in TopNav.jsx.

REMAINING from 26-list (buildable on web): #7 Nearby Police (needs Maps/Places API), #8 Stolen-Mobile FIR guide, #9 Safe Link Checker (needs URL-reputation API), #10 Unsafe File Checker (needs file-scan API), #16 Google Drive upload for SOS evidence, #24 Geo-Fencing/Safe Zones, #26 100-Member Community Group, #14 Surround Audio, #15 Emergency Photo (personal).
REMAINING comms: live WhatsApp incident alerts (#4 upgrade — set MSG91_WHATSAPP_TEMPLATE), Delivery Reports dashboard, OTP Resend Timer, SMS OTP fallback.
MOBILE-ONLY (need Expo app): #11,#19,#20,#21,#22,#23,#25.

## Update 2026-06 — Safety Suite (Phase 2) — 4 more features (testing_agent iter13: BE 12/12, FE ~95%)
- #7 Nearby Police Stations — GET /api/safety/nearby-police?lat&lng&radius via OpenStreetMap Overpass (3 mirrors + User-Agent, 30-min Mongo cache db.police_cache). Frontend: Safety page NearbyPolice card (Leaflet map + list + retry btn). FREE, no key. DONE.
- #26 Community Safety Group — one neighbourhood group, cap 100. Endpoints: GET /api/community, POST /community/join|leave, POST /community/posts (needs membership), POST /community/posts/{id}/like (toggle), DELETE /community/posts/{id} (own/admin). Collections: community_members, community_posts. Frontend: /community page (nav "Community"). DONE.
- #9 Safe Link Checker — POST /api/safety/link-check via VirusTotal v3 (submit + poll, 24h cache db.url_checks). Graceful {configured:false} until VIRUSTOTAL_API_KEY set in backend/.env. Frontend: Safety page LinkChecker card. BUILT — NEEDS VT API KEY to go live.
- #4 Live WhatsApp Alerts — flipped ON: MSG91_WHATSAPP_TEMPLATE=nek_sathi_alert. comms.send_whatsapp confirmed MSG91 accepts (hasError:false, request_id). All notify_whatsapp (incident + SOS) now live.
Files touched: backend/server.py (link_check, nearby_police, community_*), frontend Safety.jsx (LinkChecker, NearbyPolice), Community.jsx, App.js routes (/community), TopNav.jsx (nav-community). backend/.env (VIRUSTOTAL_API_KEY="", MSG91_WHATSAPP_TEMPLATE).
STILL PENDING (buildable on web): #8 Stolen-Mobile FIR guide, #10 Unsafe File Checker (VirusTotal file scan — same key), #16 Google Drive upload, #24 Geo-Fencing, #14 Surround Audio, #15 personal Emergency Photo, Delivery Reports dashboard, OTP Resend Timer, SMS OTP fallback.
MOBILE-ONLY: #11,#19,#20,#21,#22,#23,#25.

## Update 2026-06 — Safety Suite (Phase 3) — 4 more features (curl + screenshot verified)
- #10 Unsafe File Checker — POST /api/safety/file-check (multipart UploadFile, SHA-256 lookup then upload+poll VirusTotal), GET /api/safety/file-status/{sha} for polling. Graceful {configured:false} without VIRUSTOTAL_API_KEY. Frontend: FileChecker card on Safety page. BUILT — needs VT key (same as #9).
- #8 Stolen-Mobile FIR Guide + #12 CEIR block — new page /stolen-phone (nav card on Safety page). 6 steps + IMEI tip + official gov links (ceir.gov.in, sancharsaathi.gov.in, cybercrime.gov.in, digitalpolice.gov.in). No key. DONE.
- OTP Resend Timer — OtpLogin.jsx: 30s countdown resend button (otp-resend-btn), WhatsApp channel note (otp-channel-note). DONE.
- Delivery Reports — GET /api/admin/notifications (stats + filterable list). Admin page /admin/comms (AdminComms.jsx), linked from Admin hub (link-admin-comms). Shows WhatsApp/SMS sent/mock/failed with filters. DONE. Verified: 134 msgs, live WhatsApp "sent" visible.
Files: backend/server.py (file_check, file_status, admin_notifications), frontend Safety.jsx (FileChecker + stolen-phone card), StolenPhone.jsx, AdminComms.jsx, OtpLogin.jsx, Admin.jsx, App.js routes (/stolen-phone, /admin/comms).
STILL PENDING (buildable): #24 Geo-Fencing/Safe Zones, #14 Surround Audio, #15 personal Emergency Photo. NEEDS CREDS: #16 Google Drive (OAuth), SMS OTP fallback (DLT SMS template). NEEDS KEY: activate #9 + #10 with VIRUSTOTAL_API_KEY.
MOBILE-ONLY: #11,#19,#20,#21,#22,#23,#25.

## Update 2026-06 — Safety Suite (Phase 4) — 3 more features (testing_agent iter14: BE 20/20, FE 100%)
- #24 Geo-Fencing / Safe Zones — /safe-zones page (Leaflet map, tap/use-location to set center, radius slider, notify toggle). Endpoints: GET/POST/DELETE /api/me/safe-zones, GET /api/me/geofence-events. Transitions evaluated on every POST /api/me/location (_evaluate_geofences) -> logs enter/exit, pushes user, WhatsApps contacts on EXIT. Collections: safe_zones, geofence_events. DONE.
- #15 Emergency Photo on SOS — POST /api/me/sos accepts photo_base64 (silent front-camera capture via canvas in Sos component, toggle sos-photo-toggle default ON). GET /api/me/sos-events returns has_photo (no base64); GET /api/me/sos-events/{id}/photo returns the image. DONE.
- #14 Surround Audio Recording — MediaRecorder card (audio-panel) on Safety page. Endpoints: POST/GET /api/me/audio-evidence, GET /{id}/play, DELETE /{id}. Collection: audio_evidence. DONE.
Files: backend/server.py (safe-zones, geofence, audio-evidence, sos photo, _evaluate_geofences), frontend Safety.jsx (Sos photo capture + AudioRecorder + safe-zones-card), SafeZones.jsx, App.js route /safe-zones. Backend tests: /app/backend/tests/test_safety_iter14.py.
STILL PENDING — NEEDS CREDS: #16 Google Drive upload (OAuth), SMS OTP fallback (DLT SMS template). NEEDS KEY: activate #9 Safe Link + #10 File Checker with VIRUSTOTAL_API_KEY.
MOBILE-ONLY: #11,#19,#20,#21,#22,#23,#25.
NOTE (non-blocking, deferred per scope): server.py ~5.3k lines could be split into routers; safe_zones could use 2dsphere index at scale.

## Update 2026-06 — Google Drive Backup (#16) — BUILT, awaiting OAuth credentials
Per-user OAuth (drive.file scope). Each user connects their OWN Drive; SOS photos + audio auto-upload (fire-and-forget) to a private "Nek Sathi" folder.
- Backend (server.py Google Drive section): GET /api/google-drive/status, GET /api/google-drive/connect-ticket (auth, 5-min JWT ticket), GET /api/google-drive/connect?ticket= (redirects to Google), GET /api/google-drive/oauth/callback (exchange + store tokens, redirect FRONTEND_URL/settings?drive=), DELETE /api/google-drive/disconnect (revokes), POST /api/google-drive/evidence (manual upload). Auto-backup wired into trigger_sos (photo) + add_audio_evidence (audio) via asyncio.create_task(_gdrive_autobackup). Collections: google_drive_tokens, google_oauth_states. Sync google client calls run via asyncio.to_thread.
- Frontend: GoogleDriveCard in Settings.jsx (connect via ticket redirect, disconnect, status, reads ?drive= query). Graceful "not set up" when unconfigured.
- Libs added (requirements.txt): google-auth, google-auth-oauthlib, google-api-python-client, google-auth-httplib2.
- env placeholders (backend/.env): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, FRONTEND_URL (all empty).
- NEEDS FROM USER: Google Cloud OAuth Web Client ID + Secret; register redirect URIs (preview: https://qrscan-preview-1.preview.emergentagent.com/api/google-drive/oauth/callback ; prod: https://neksathi.in/api/google-drive/oauth/callback). Enable Drive API, consent screen (External + test users), scope drive.file.
- Verified graceful paths via curl (status configured:false, connect-ticket 400, evidence 409) + Settings card screenshot.

## Update 2026-06 — Google Drive #16 made ADMIN-CONFIGURABLE (user request)
- Config now stored in Mongo collection app_settings {key:'google_drive', client_id, client_secret, redirect_uri, frontend_url} with env fallback. Helper _gdrive_cfg() merges DB over env; all gdrive endpoints + _gdrive_upload_sync now take config (no more hardcoded env reads).
- Admin endpoints: GET/PUT /api/admin/integrations/google-drive (require_admin). GET masks secret (has_secret bool) + returns default_redirect_uri. PUT only overwrites secret when a non-empty value given.
- Admin UI: /admin/integrations (AdminIntegrations.jsx) — shows redirect URIs to register (copy buttons: preview + neksathi.in prod), Drive-API/scope note, and credential form. Linked from Admin hub (link-admin-integrations, HardDrive icon). Verified: GET/PUT curl (configured toggles true), status reflects config, admin page screenshot.
- Still needs: app owner to paste real Google OAuth Client ID + Secret in Admin → Integrations (test creds were saved then cleared). Then users connect their own Drive from Settings → Google Drive backup.
ALL 26-feature web-buildable items now BUILT. Remaining activation: VirusTotal key (#9,#10 via .env), Google OAuth creds (#16 via Admin→Integrations), SMS OTP fallback (DLT template). Mobile-only: #11,19,20,21,22,23,25.
