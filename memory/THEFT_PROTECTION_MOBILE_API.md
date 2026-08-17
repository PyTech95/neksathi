# Theft Protection — Mobile App Integration Guide

The web/backend handles storage, alerts, dashboards and the lock *command*.
The **native mobile app** (Android Device Admin / iOS) does the actual:
- silent intruder-photo capture on failed unlock
- enforcing the lock (WindowManager / DevicePolicyManager)

All endpoints require the user's JWT: `Authorization: Bearer <token>`.
Base: `${REACT_APP_BACKEND_URL}/api`

## 1. Register the device (once, after login)
POST /devices
{ "name": "Pixel 8", "platform": "android", "push_token": "<fcm>", "lock_threshold": 3,
  "guardian_contact_id": null, "super_admin_alerts": true }
→ { id, name, lock_threshold, locked, ... }   // store `id` locally as DEVICE_ID

## 2. Report an intruder (on N failed unlock attempts)
POST /devices/{DEVICE_ID}/intruder
{ "photo_base64": "data:image/jpeg;base64,...", "attempt_count": 3,
  "latitude": 28.61, "longitude": 77.20 }
→ { id, triggered_lock, view_token, ... }
- Backend stores it, alerts family + guardian + (super admin if enabled) via WhatsApp/SMS/push/email,
  and auto-backs the photo to the owner's Google Drive if connected.
- If attempt_count >= lock_threshold → device is flagged LOCKED (triggered_lock=true).

## 3. Poll the lock command (background, e.g. every 30–60s or on FCM push)
GET /devices/{DEVICE_ID}/lock-state  → { "locked": true|false, "lock_threshold": 3 }
- When locked=true → the app must lock the screen and keep it locked.
- Also updates last_seen.

## 4. Owner remote controls (used by the web portal, also available to app)
POST /devices/{DEVICE_ID}/lock    → { locked: true }
POST /devices/{DEVICE_ID}/unlock  → { locked: false }
PUT  /devices/{DEVICE_ID}         → update name/threshold/guardian/super_admin_alerts
DELETE /devices/{DEVICE_ID}

## Owner web views
- /theft-protection : manage devices + view intruder captures (+ remote lock/unlock)
- Public alert link (sent to family): /intruder/{view_token}

## Super admin
- GET /admin/intruder-events  (admin only) → all captures across users
- Web: /admin/intruder

## Notes
- Photos: keep JPEG under ~2–3 MB base64. WhatsApp/SMS carry a TEXT alert + secure link
  (`/intruder/{view_token}`); the full photo shows in the app, dashboard and email.
- Threshold is 2–5 (owner-configurable, default 3).
