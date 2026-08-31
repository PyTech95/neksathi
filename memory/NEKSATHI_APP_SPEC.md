# Nek Sathi — Complete Functional & Flow Specification (for mobile app build)

> Build a cross-platform mobile app (Android + iOS) that talks to the EXISTING backend.
> Do NOT build a new backend. Reuse every endpoint below. Nothing here is optional unless marked.

## 0. Platform facts
- **Backend base URL:** `https://neksathi-deploy.preview.emergentagent.com`
- **Every endpoint is prefixed with `/api`** → e.g. `POST /api/auth/login`.
- **Auth:** JWT bearer. Login/register/otp-verify return `{ access_token, token_type:"bearer", user }`.
  Store the token securely; send `Authorization: Bearer <token>` on all authenticated calls. On 401 → logout.
- **Content:** JSON. Photos/audio/video sent as base64 or chunked upload (see modules).
- **Realtime:** WebRTC signaling over REST polling for masked voice calls; app polls state endpoints
  (lock-state, siren-state, active-sos, calls/incoming) every ~5–15s. Optional push to reduce polling.
- **Roles:** `user` (default), family member (a user linked into a family), `admin` (full console),
  `org`/`dealer` (B2B portals), and `public` (anonymous QR-scan flows, no login).

---

## 1. AUTH & ACCOUNT
**Screens:** Splash/Onboarding, Register, Login (email+password), OTP Login (phone), Forgot/Reset Password, Profile/Settings.
**Flows:**
- Register: `POST /api/auth/register {name,email,phone,password}` → token.
- Login: `POST /api/auth/login {email,password}` → token.
- OTP login: `POST /api/auth/otp/request {phone}` → then `POST /api/auth/otp/verify {phone,code,name?}` → token.
  (OTP is delivered via WhatsApp/SMS in production; no code shown on screen.)
- Forgot: `POST /api/auth/forgot-password {email}` → `POST /api/auth/reset-password {token,new_password}`.
- Session bootstrap: on app open, if token exists call `GET /api/auth/me`.
- Profile: `GET/PUT /api/auth/me`; change password `POST /api/auth/change-password`;
  privacy consent `POST /api/auth/me/consent`; data export `GET /api/auth/me/export`; delete account `DELETE /api/auth/me`.

## 2. ONE-TAP SOS (Personal Safety) — core
**Screens:** Safety/SOS home (big panic button + 3s countdown + cancel), SOS history, Emergency Contacts, Live-share sheet.
**Flows:**
- Send SOS: capture GPS + a silent front-camera selfie → `POST /api/me/sos {latitude,longitude,message?,photo_base64?}`.
- After sending, keep pushing location every ~8s: `POST /api/me/location {latitude,longitude,battery?,moving?}` until user acks.
- Mark safe / cancel escalation: `POST /api/me/sos-events/{event_id}/ack`.
- History: `GET /api/me/sos-events`; photo: `GET /api/me/sos-events/{event_id}/photo`.
- Emergency contacts: `GET/POST /api/me/emergency-contacts`, `PUT/DELETE /api/me/emergency-contacts/{id}`.
- Live location share (timed): `POST /api/me/live-share {duration_minutes}`, list `GET /api/me/live-shares`, stop `POST /api/me/live-share/{id}/stop`.
- Check-in / status: `POST /api/me/status {latitude,longitude,...}`.
- **Audio evidence:** record & upload `POST /api/me/audio-evidence`, list `GET /api/me/audio-evidence`, play `GET /api/me/audio-evidence/{id}/play`, delete.
- **SOS video (chunked upload):** `POST /api/user/sos-video/init` → `.../chunk` → `.../complete`; status `GET /api/user/sos-video/status/{upload_id}`; list `GET /api/user/sos-videos`; fetch `GET /api/sos-video/{id}`.

## 3. SAFE ZONES (Geofencing)
**Screen:** Safe Zones (map + list).
- `GET/POST /api/me/safe-zones {name,latitude,longitude,radius_m}`, delete `/{zone_id}`.
- Geofence enter/exit events: `GET /api/me/geofence-events`.

## 4. FAMILY GUARDIAN
**Screen:** Family (live map of members, invite code, alert rules, check-ins, digests, nudges, zones).
**Flows:**
- Family: `GET /api/family`, create `POST /api/family`, join `POST /api/family/join {code}`, leave `POST /api/family/leave`.
- Members: remove `DELETE /api/family/members/{id}`, activity feed `GET /api/family/members/{id}/activity`, post activity `POST /api/family/activity`.
- Live family SOS banner: `GET /api/family/active-sos` (poll).
- Alert rules: `GET/PUT /api/family/alert-rules`; my sharing prefs `PUT /api/family/my-sharing`.
- Check-ins: `GET /api/family/check-ins`, request `POST /api/family/check-in`, respond `POST /api/family/check-in/{id}/respond`.
- Daily digest: `GET /api/family/digest`, send `POST /api/family/digest/send`.
- Nudge ("are you ok?"): `POST /api/family/nudge`, state `GET /api/family/nudge-state`, clear `POST /api/family/nudge/clear`.
- Family zones: `GET /api/family/zones`, mute `PUT /api/family/zones/{id}/mute`; place events `GET /api/family/place-events`.

## 5. TEMPORARY CIRCLES (time-boxed sharing)
**Screen:** Temporary Circles (/circles).
- Create `POST /api/circles/temp {duration...}`, list `GET /api/circles/temp`, detail `GET /api/circles/temp/{id}`.
- Join `POST /api/circles/temp/join {code}`, leave `.../{id}/leave`, end `.../{id}/end`, live ping `.../{id}/ping`.

## 6. ANTI-THEFT / STOLEN PHONE (device security) — native
**Screens:** Theft Protection dashboard, Stolen Phone flow, Intruder gallery.
**Flows (needs native Device Admin / camera / SIM listener):**
- Register device: `POST /api/devices {name,platform,push_token,lock_threshold,super_admin_alerts}`; list `GET /api/devices`; update `PUT /api/devices/{id}`; delete.
- Remote lock/unlock: `POST /api/devices/{id}/lock` | `/unlock`; poll `GET /api/devices/{id}/lock-state`.
- Siren: `POST /api/devices/{id}/siren`; poll `GET /api/devices/{id}/siren-state`.
- Intruder selfie on failed unlocks: `POST /api/devices/{id}/intruder {photo_base64,attempt_count,latitude,longitude}`; gallery `GET /api/intruder-events`, photo `/{id}/photo`.
- SIM-swap detection: `POST /api/devices/{id}/sim-swap {new_number?,carrier?,imsi?}`; events `GET /api/sim-events`.
- Mark recovered: `POST /api/devices/{id}/recover`.

## 7. SMART QR — VEHICLES
**Screens:** Dashboard (vehicle list), Vehicle Detail (QR sticker), Live Track.
- CRUD: `GET/POST /api/vehicles`, `GET/PUT/DELETE /api/vehicles/{id}`.
- Owner contacts on the sticker: `GET/POST /api/vehicles/{id}/contacts`, delete `/{contact_id}`.
- Sharing/co-owners: invites `POST /api/vehicles/{id}/invites`; shares `GET /api/vehicles/{id}/shares`, delete `/{share_id}`; shared-with-me `GET /api/shared-vehicles`.
- Location & tracking: `POST /api/vehicles/{id}/location`, `GET /api/vehicles/{id}/track`.
- Accident/impact: `POST /api/vehicles/{id}/accident`.
- Lost/parking mode: `POST /api/vehicles/{id}/lost_mode`.
- Vehicle SOS videos: `POST /api/vehicles/{id}/sos-video`, `GET /api/vehicles/{id}/sos-videos`.

## 8. SMART QR — TAGS (bags, kids, pets, luggage)
**Screens:** Tags list, Tag Detail (QR).
- CRUD: `GET/POST /api/tags`, `GET/PUT/DELETE /api/tags/{id}`.
- Scan history: `GET /api/tags/{id}/scans`. Lost mode: `POST /api/tags/{id}/lost_mode`.

## 9. SMART QR — CARDS (digital ICE / contact cards)
**Screens:** Cards list, Card Detail (QR + vCard).
- CRUD: `GET/POST /api/cards`, `GET/PUT/DELETE /api/cards/{id}`.

## 10. QR CLAIM (activate a physical sticker)
**Screen:** Claim (enter/scan serial).
- `POST /api/qr/claim {serial_no,...}`; public preview `GET /api/public/claim/{serial_no}`.

## 11. IN-APP QR SCANNER
**Screen:** Scanner (camera). Decodes a Nek Sathi QR and routes to the matching public flow
(`/scan/:id`, `/t/:id`, `/c/:id`, `/live/:token`, `/claim/:serial`, `/track/:id`).

## 12. MASKED CALLING (privacy voice calls, WebRTC + Vobiz bridge)
**Screens:** Incoming-call overlay (accept/reject), in-call screen.
- My calls: incoming `GET /api/me/calls/incoming` (poll), recent `GET /api/me/calls/recent`, detail `/{id}`.
- Signaling: accept `POST /api/me/calls/{id}/accept`, reject `/reject`, end `/end`, ICE `/candidate`.
- Caller (public/anon) side: `GET /api/public/call/{id}`, `/offer`, `/candidate`, `/end`.
- Start a call from a scanned QR/tag: `POST /api/public/qr/{id}/call/start`, `/bridge`, `POST /api/public/tag/{id}/call`.

## 13. COMMUNITY & SAFETY MAP
**Screen:** Community feed + local safety map.
- Feed: `GET /api/community`, join/leave, posts `POST /api/community/posts`, like `/{id}/like`, delete.
- Danger/black-spots: `GET /api/blackspots`, `GET /api/nearby`, nearby police `GET /api/safety/nearby-police`.
- Safety checks: scan a file `POST /api/safety/file-check` + `GET /api/safety/file-status/{sha}`; link check `POST /api/safety/link-check`.

## 14. ALERTS & INCIDENTS
**Screens:** Alerts feed, Incidents list/detail.
- `GET /api/alerts`; incidents `GET /api/incidents`, live `GET /api/incidents/live`.
- Actions: `POST /api/incidents/{id}/respond`, `/resolve`, `/extend`.

## 15. SUBSCRIPTIONS (Stripe)
**Screen:** Plans / Subscription.
- Plans `GET /api/plans`; my sub `GET /api/subscriptions/me` (or `/api/subscriptions/me`).
- Checkout `POST /api/subscriptions/checkout-session`; confirm `POST /api/subscriptions/confirm`.

## 16. SUPPORT, CONTACT, FAQ
- Tickets: `GET/POST /api/support/tickets`, mine `GET /api/support/tickets/me`.
- Contact form: `POST /api/contact`. FAQs: `GET /api/faqs`.

## 17. GOOGLE DRIVE BACKUP (evidence)
- Connect `GET /api/google-drive/connect` / `connect-ticket` / `oauth/callback`, status, disconnect.
- Backup evidence `POST /api/google-drive/evidence`.

## 18. PUSH NOTIFICATIONS
- After login, register the device token: `POST /api/register-push {user_id,platform,device_token}`.
  (Android=FCM google-services.json, iOS=APNs.)

## 19. ANALYTICS / SUMMARY (dashboards)
- `GET /api/summary`, `GET /api/analytics`, `GET /api/analytics/access`.

## 20. PUBLIC (ANONYMOUS) SCAN FLOWS — no login
When someone scans a sticker/QR:
- Resolve: `GET /api/public/qr/{id}` / `resolve/{id}`; tag `GET /api/public/tag/{id}`; card `GET /api/public/card/{id}` + vCard `/vcf`.
- Notify owner: `POST /api/public/qr/{id}/alert` | `/incident` | `/message`; tag `POST /api/public/tag/{id}/alert`.
- Live location view: `GET /api/public/live/{token}`; incident view `GET /api/public/incident/{id}` + `/call`; intruder view `GET /api/public/intruder/{token}`.
- Invites: `GET /api/invites/{token}`, accept `POST /api/invites/{token}/accept`.

## 21. ADMIN CONSOLE (role=admin) — build if you need the admin app; otherwise web-only
Stats `GET /api/admin/stats`; users `GET /api/admin/users` + suspend; subscriptions; alerts (+export);
incidents; contacts (+patch); orgs (+account); vendors CRUD + orders + payments + summary; plans CRUD;
faqs CRUD; QR inventory/batches/generate-bulk/mark-sold/block/export/stickers; intruder-events; call-records;
support tickets (+patch); telco-config (get/put); google-drive integration; inbox summary; notifications.

## 22. B2B PORTALS (org / dealer)
- Org: `GET /api/org/me`, `/inventory`, `/tags`, `/alerts`.
- Dealer: `GET /api/dealer/me`, `/inventory`.

---

## Recommended mobile build order (fastest to value)
1. Auth (login/register/OTP + session) → 2. SOS + Emergency Contacts + Live location →
3. Family Guardian (map) → 4. Smart QR (Vehicles/Tags/Cards + in-app Scanner) →
5. Alerts/Incidents + Community → 6. Subscriptions → 7. Masked calling →
8. Anti-theft/Stolen-phone (needs native Device Admin) → 9. Push → 10. Google Drive backup → 11. Admin/B2B (optional separate app).

## Cross-cutting requirements (do not miss)
- Global real-time overlays for the logged-in user, polled and shown app-wide:
  incoming masked call (accept/reject), family member SOS alert (with siren sound), and "check-in" nudges.
- Permissions: Location (fine + background for active SOS), Camera (SOS selfie + QR scan),
  Microphone (masked calls + audio evidence), Notifications, and (anti-theft) Device Admin + phone/SIM state.
- Every list has loading/empty/error states; every destructive action confirms.
- Money/plan gating: some features are limited by the user's subscription plan (`GET /api/plans` + `/subscriptions/me`).
