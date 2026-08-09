# Nek Sathi — Mobile App API Contract (backend is READY)

Base URL = the deployed backend origin + `/api` (mobile config: `EXPO_PUBLIC_API_URL`).
Auth = JWT Bearer. Login/OTP return `access_token`; send it as `Authorization: Bearer <token>`.
All endpoints below are LIVE and curl-verified (2026-06). CORS = `*` (native + web ok).

## Auth
- POST /api/auth/register  {email,password,name,phone} -> {access_token, user}
- POST /api/auth/login     {email,password} -> {access_token, user}
- POST /api/auth/otp/request  {phone}         (Twilio Verify — live once account upgraded)
- POST /api/auth/otp/verify   {phone, code} -> {access_token, user}
- GET  /api/auth/me        -> UserOut (id,email,name,phone,is_admin,is_dealer,is_org,org_id,notify_prefs,avatar_base64)
- PUT  /api/auth/me        {name?,phone?,notify_prefs?,avatar_base64?}
- POST /api/auth/change-password {old_password,new_password}

## Push notifications (Emergent Push relay)
- POST /api/register-push  {user_id, platform:"android"|"ios", device_token}
  -> {status:"registered"|"deferred"}. Call after login with the Expo/FCM/APNs token.
  NOTE: currently unauthenticated (takes user_id in body) — safe to call post-login;
  can be hardened to derive user_id from JWT if desired.
- Server fans out pushes automatically on: overspeed, accident, vehicle/tag scans,
  SOS video, family-invite accepted. Payload data: {title,message,action_url}.

## Vehicles
- GET  /api/vehicles                         -> [VehicleOut] (limit 100)
- POST /api/vehicles                          {number_plate,vehicle_type,make_model?,color?,photo_base64?,speed_limit_kmh?}
- GET/PUT/DELETE /api/vehicles/{id}
- POST /api/vehicles/{id}/lost_mode           {enabled}
- Contacts (max 4): GET/POST /api/vehicles/{id}/contacts, DELETE .../contacts/{cid}

## Live tracking (mobile GPS loop)
- POST /api/vehicles/{id}/location  {latitude,longitude,speed_kmh,heading?}
  Auto-raises an overspeed alert + push when speed_kmh > vehicle.speed_limit_kmh (pref-gated).
- GET  /api/vehicles/{id}/track?limit=50      -> recent LocationOut points

## Crash / accident sensor (accelerometer)
- POST /api/vehicles/{id}/accident  {latitude?,longitude?,speed_before_kmh?,impact_g?,resolved?,resolution?}
  resolution ∈ safe|need_help|no_response. Unresolved -> pushes owner + family accounts.

## SOS video (panic recording)
- POST /api/user/sos-video   {video_base64, duration_ms, latitude?, longitude?, vehicle_id?}
  base64 cap ~28MB (~20MB video). Pushes user + family. (For big files use CHUNKED below.)
- POST /api/vehicles/{id}/sos-video  {video_base64,duration_ms,latitude?,longitude?}
- GET  /api/user/sos-videos , /api/vehicles/{id}/sos-videos , /api/sos-video/{video_id}

## SOS video — CHUNKED / RESUMABLE upload (for long clips on mobile)
Use this instead of the single-shot upload for anything large; each chunk <= 5MB base64.
1. POST /api/user/sos-video/init      {total_chunks, duration_ms, latitude?, longitude?, vehicle_id?}
   -> {upload_id, chunk_max_bytes, total_chunks}
2. POST /api/user/sos-video/chunk     {upload_id, index, data_base64}   (repeat; idempotent per index)
   -> {received, total, index}
3. GET  /api/user/sos-video/status/{upload_id}  -> {status, total, received:[...], missing:[...]}
   Resume after a dropped connection by re-sending only the `missing` indexes.
4. POST /api/user/sos-video/complete  {upload_id}  -> SOSVideoMeta (assembles, alerts + pushes family, clears chunks)
   Returns 400 if any chunk is missing, 413 if assembled > ~60MB.

## QR Tags (kids/patients/staff/pets/bags) + public scan
- CRUD: GET/POST /api/tags, GET/PUT/DELETE /api/tags/{id}, POST /api/tags/{id}/lost_mode
- Public (no auth): GET /api/public/tag/{qr_id}, POST /api/public/tag/{qr_id}/alert,
  POST /api/public/tag/{qr_id}/call (masked guardian call)
- Emergency scan types (kid_help/sos/emergency) broadcast to owner+guardian with location.

## Public vehicle QR (no auth) — parking/accident/theft
- GET /api/public/qr/{qr_id}, POST /api/public/qr/{qr_id}/alert
- Wrong-parking flow + masked call: POST /api/public/incident/... (see server.py)

## Alerts feed
- GET /api/alerts?limit=100  (own + shared vehicles + user alerts)

## Notes for the mobile build
- Reuse the SAME JWT from /auth/login or /auth/otp/verify across all calls.
- notify_prefs on the user gate WhatsApp/push/incident/speed alerts server-side.
- Twilio: OTP + masked voice are LIVE once the Twilio account is off trial (done).
  WhatsApp still on sandbox until an approved WhatsApp Business sender is set.
