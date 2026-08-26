# NekSathi Companion App — Build Prompt (Android APK)

Paste the **MASTER PROMPT** below into your app-building AI agent (or use it as a spec).
It targets **Expo React Native** because it produces a real Android APK with the least
setup and reuses the same JS/JSON stack as the NekSathi backend.

---

## 0. Facts your builder needs (do not change)

- **Backend base URL:** `https://neksathi-deploy.preview.emergentagent.com`
- **All API paths are prefixed with `/api`.** e.g. `POST https://neksathi-deploy.preview.emergentagent.com/api/auth/login`
- **Auth:** JWT bearer. `POST /api/auth/login` returns `{ "access_token": "...", "token_type": "bearer", "user": {...} }`.
  Send `Authorization: Bearer <access_token>` on every authenticated call.
- **Test accounts:** `demo@neksathi.app` / `demo1234` (normal user), `admin@safeqr.com` / `admin1234` (admin).
- **Mobile OTP login:** `POST /api/auth/otp/request { "phone": "+9198..." }` then
  `POST /api/auth/otp/verify { "phone", "code", "name?" }` → returns the same token shape.
  (OTP is delivered over WhatsApp in live mode; use email/password for automated testing.)

### Core endpoints (all require `Authorization: Bearer`)
| Purpose | Method + Path | Body (key fields) |
|---|---|---|
| Register | `POST /api/auth/register` | `{ email, password, name, phone }` |
| Login | `POST /api/auth/login` | `{ email, password }` |
| Current user | `GET /api/auth/me` | — |
| Update profile | `PUT /api/auth/me` | `{ name?, phone?, ... }` |
| Emergency contacts | `GET/POST /api/me/emergency-contacts` | `{ name, phone, relation? }` |
| **One-Tap SOS** | `POST /api/me/sos` | `{ latitude, longitude, message?, photo_base64? }` |
| SOS history | `GET /api/me/sos-events` | — |
| Push my location | `POST /api/me/location` | `{ latitude, longitude, battery?, moving? }` |
| Live share | `POST /api/me/live-share` | `{ duration_minutes }` |
| My status (check-in) | `POST /api/me/status` | `{ latitude, longitude, ... }` |
| Safe zones | `GET/POST /api/me/safe-zones` | `{ name, latitude, longitude, radius_m }` |
| Family map | `GET /api/family` | — |
| Join family | `POST /api/family/join` | `{ code }` |
| Vehicles | `GET/POST /api/vehicles` | `{ name, plate, ... }` |
| Tags | `GET/POST /api/tags` | — |
| Cards | `GET/POST /api/cards` | — |
| Alerts feed | `GET /api/alerts` | — |
| Incidents | `GET /api/incidents` | — |
| Subscription plans | `GET /api/plans` | — |

### Anti-theft device endpoints (advanced — native features)
| Purpose | Method + Path | Body |
|---|---|---|
| Register device | `POST /api/devices` | `{ name, platform:"android", push_token, lock_threshold, super_admin_alerts }` → save returned `id` as `DEVICE_ID` |
| Report intruder | `POST /api/devices/{DEVICE_ID}/intruder` | `{ photo_base64, attempt_count, latitude, longitude }` |
| Poll lock command | `GET /api/devices/{DEVICE_ID}/lock-state` | → `{ locked, lock_threshold }` |
| Lock / Unlock | `POST /api/devices/{DEVICE_ID}/lock` \| `/unlock` | — |
| SIM-swap alert | `POST /api/devices/{DEVICE_ID}/sim-swap` | `{ new_number?, carrier?, imsi?, latitude?, longitude? }` |
| Poll siren | `GET /api/devices/{DEVICE_ID}/siren-state` | → `{ siren_active }` |

---

## MASTER PROMPT — copy everything below into your app builder

> **Build a native Android companion app ("NekSathi") using Expo (React Native) + expo-router, in TypeScript, that talks to my existing backend. Produce an installable Android APK I can sideload for testing.**
>
> **Backend**
> - Base URL: `https://neksathi-deploy.preview.emergentagent.com`, all endpoints prefixed with `/api`.
> - Put the base URL in an env/config file (`EXPO_PUBLIC_API_URL`) — never hardcode it in components.
> - Auth is JWT bearer. On login/register/OTP-verify the API returns `{ access_token, token_type, user }`. Store `access_token` securely with `expo-secure-store` and attach `Authorization: Bearer <token>` to every request via an axios instance interceptor. On 401, clear the token and route to Login.
>
> **Phase 1 — Auth (build first, test end-to-end before moving on)**
> 1. Login screen: email + password → `POST /api/auth/login`. Save token + user, go to the Home tab.
> 2. Register screen: name, email, phone, password → `POST /api/auth/register`.
> 3. Mobile-OTP login screen: phone → `POST /api/auth/otp/request`; then a 6-digit code + optional name → `POST /api/auth/otp/verify`. Handle the live case where no code is returned in the response (code arrives via WhatsApp).
> 4. Persist session: on app start, if a token exists call `GET /api/auth/me`; if it succeeds go Home, else go Login. Add a Logout action that clears secure storage.
> 5. Map any error to a readable string (FastAPI returns `detail` as a string or an array of `{msg}` objects).
>
> **Phase 2 — Personal Safety (the testing core)**
> - Bottom tabs: **Home, Family, Safety, Profile.**
> - **One-Tap SOS** big button on Home: request foreground location permission (`expo-location`), get current coords, `POST /api/me/sos { latitude, longitude }`, show a confirmation + the returned event. List past events from `GET /api/me/sos-events`.
> - **Emergency contacts** screen: list/add/delete via `/api/me/emergency-contacts`.
> - **Live location share**: `POST /api/me/live-share { duration_minutes }`, show the share link; button to stop.
> - **Background location ping**: every 60s while a "sharing"/"SOS active" toggle is on, `POST /api/me/location { latitude, longitude, battery }` (use `expo-location` + `expo-battery`). Use a foreground-service notification on Android so it keeps running.
>
> **Phase 3 — Family Guardian**
> - **Family** tab: `GET /api/family` → show members on a map (`react-native-maps`) with name, last location, battery, last-seen. Pull-to-refresh + auto-refresh every 30s.
> - Join a family via invite code: `POST /api/family/join { code }`.
> - Safe zones: list/create via `/api/me/safe-zones` (name, lat, lng, radius). Show them as circles on the map.
>
> **Phase 4 — Smart QR (read-only first)**
> - Screens to list **Vehicles / Tags / Cards** from `/api/vehicles`, `/api/tags`, `/api/cards`, with a QR view for each (use `react-native-qrcode-svg`). Add-new forms optional.
>
> **Phase 5 — Alerts & Profile**
> - **Alerts/Incidents**: `GET /api/alerts`, `GET /api/incidents` in a list.
> - **Profile**: show `GET /api/auth/me`, edit via `PUT /api/auth/me`, change password `POST /api/auth/change-password`, logout.
>
> **Phase 6 — Push notifications (optional for first APK)**
> - Integrate `expo-notifications`, get the device push token, and send it when registering a device (Phase 7). Handle foreground + tapped-notification navigation.
>
> **Phase 7 — Anti-Theft (ADVANCED — requires native modules; do LAST)**
> Note: these need Android **Device Admin / DevicePolicyManager**, camera-on-lock, and SIM/`READ_PHONE_STATE` listeners, which are NOT available in Expo Go. Build these as an **Expo config plugin / custom dev client (prebuild)** or a bare workflow:
> - Register this device: `POST /api/devices { name, platform:"android", push_token, lock_threshold:3, super_admin_alerts:true }`; store the returned `id` as `DEVICE_ID`.
> - Poll `GET /api/devices/{DEVICE_ID}/lock-state` every 30–60s (and on push); when `locked=true`, enforce a lock screen overlay and keep it locked until `unlock`.
> - On N failed unlock attempts, silently capture a selfie and `POST /api/devices/{DEVICE_ID}/intruder { photo_base64, attempt_count, latitude, longitude }`.
> - Watch SIM/IMSI change → `POST /api/devices/{DEVICE_ID}/sim-swap { new_number?, carrier?, imsi? }`.
> - Poll `GET /api/devices/{DEVICE_ID}/siren-state`; when `siren_active`, play a full-volume alarm even on silent.
>
> **Quality bar**
> - TypeScript, expo-router file-based navigation, a shared `api.ts` axios client, a simple `AuthContext`.
> - Loading/empty/error states on every screen. No secrets hardcoded. Request permissions with clear rationale.
> - Give every interactive element a stable `testID`.

---

## APK build steps (do these after the app runs in Expo Go / dev client)

```bash
# 1. Create the app (if starting fresh)
npx create-expo-app neksathi-app -t
cd neksathi-app

# 2. Add the API base URL (Expo public env var)
echo 'EXPO_PUBLIC_API_URL=https://neksathi-deploy.preview.emergentagent.com' > .env

# 3. Install the core libs the prompt uses
npx expo install expo-secure-store expo-location expo-battery expo-notifications \
  react-native-maps react-native-qrcode-svg
npm i axios

# 4. Run & test on your phone first (install "Expo Go" from Play Store, scan the QR)
npx expo start

# 5. Build a real APK in the cloud with EAS (free tier)
npm i -g eas-cli
eas login                       # create a free Expo account if needed
eas build:configure
# In eas.json set the build profile to output an APK:
#   "preview": { "android": { "buildType": "apk" } }
eas build -p android --profile preview
# EAS returns a download URL — install that .apk on your Android phone
# (enable "Install unknown apps" for your browser/file manager)
```

Notes:
- **Phases 1–5 work in Expo Go / standard EAS APK** — that's your fast testing loop.
- **Phase 7 (Device Admin / intruder / SIM)** needs `npx expo prebuild` + custom native code
  (or bare React Native); it won't run in Expo Go. Do it only after the MVP is validated.
- Test against the **preview backend URL above** now; when you deploy the backend, swap
  `EXPO_PUBLIC_API_URL` to the deployed URL and rebuild.

## Fastest way to just start testing
Use accounts `demo@neksathi.app / demo1234`. Build Phases 1–2 only → EAS APK →
tap SOS → confirm the event appears in the web portal at `/alerts` and `/incidents`.
That single loop proves the mobile→backend wiring before you build the rest.
