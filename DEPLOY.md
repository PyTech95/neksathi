# Nek Sathi — Deploy Guide (step by step)

Yeh guide batati hai: **server (VPS) kaise update karein**, **signed AAB (Play Store)** kaise banayein,
aur **debug APK (phone pe test)** kaise banayein. Commands exact hain — explanation Hinglish me.

---

## Is release me kya badla (reference)

- **Backend** (naye/badle endpoints): helpline numbers (fire/women/child), `/alerts/count`,
  QR pause (`/vehicles/{id}/qr-pause`), blocked numbers (`/me/blocked-numbers`),
  wallet (`/me/wallet`), my story (`/me/story`), device locate (`/devices/{id}/ping`),
  email/mobile login, admin users list.
  **➜ Koi NAYA Python package nahi add hua** — isliye `pip install` ki zaroorat nahi.
- **Frontend (web + app)**: splash, notification bell, guest mode, onboarding, home hero,
  helplines, wallet, my story, QR pause UI, block number UI.
- **Native (sirf app)**: torch, background location, crash detection, video doorbell, device locate.
  ➜ Yeh sirf tab chalenge jab aap **AAB/APK banakar phone pe** test karein.

---

## PART A — SERVER UPDATE (VPS pe)

> Backend badla hai, isliye server update **zaroori** hai (web ke saath).

### A1. Code pull karo
```bash
# VPS pe SSH karke, apne project folder me jao (jahan repo cloned hai)
cd /path/to/neksathi        # <-- apna actual path
git pull
```

### A2. Backend restart karo  *(REQUIRED — backend changed)*
Naye Python packages nahi aaye, isliye bas **restart** karna hai.
Apne setup ke hisab se inme se **jo chalta hai wahi** use karo:

```bash
# systemd (service):
sudo systemctl restart neksathi        # <-- apne service ka naam

# ya pm2:
pm2 restart neksathi

# ya manual/screen/tmux (purana uvicorn band karke):
cd backend
uvicorn server:app --host 0.0.0.0 --port 8006
```
> Agar kabhi `requirements.txt` badle to restart se pehle: `cd backend && pip install -r requirements.txt`

**Verify (OTP/login chal raha hai?):**
```bash
# site kholo aur login -> OTP aana chahiye, ya:
curl -s https://<your-domain>/api/health
```

### A3. Web frontend rebuild + publish  *(web changed)*

**Option 1 — in place (jahan repo live hai, wahi build karo):**
```bash
cd frontend
# frontend/.env me REACT_APP_BACKEND_URL theek ho (ya khaali rakho to site ka /api proxy use hota hai)
npm run build
# Nginx frontend/build serve karta hai -> site kholke HARD REFRESH (Ctrl+Shift+R)
```

**Option 2 — repo ka isolated deploy script (agar live project is checkout se alag folder me hai):**
```bash
bash DEPLOY_VPS.sh /absolute/path/to/live-project https://<your-domain>
# Yeh alag se build karke live project ke frontend/build me publish karta hai + backup banata hai.
# (Yeh sirf frontend ke liye hai — backend isse restart NAHI hota, A2 alag se karo.)
```

---

## PART B — APP BUILD (apni machine pe — keystore wahi rahega)

> **Keystore machine pe hi rehta hai, kahin bhejna nahi.**
> Prereqs: JDK 17+, Android SDK 34, `ANDROID_HOME` set, `android/` folder + keystore setup (jaisa Android Studio me hai).

### B0. ZAROORI — app ka backend URL
App domain se serve nahi hoti, isliye use **public HTTPS backend** chahiye.
Build se pehle check karo `frontend/.env` me:
```
REACT_APP_BACKEND_URL=https://<your-domain>
```

### B1. Latest code pull
```bash
cd ...\FINAL\frontend
git pull
```

### B2a. Signed AAB (Play Store ke liye)  ✅ main release
```bash
node scripts/build-aab.cjs
```
Yeh khud-ba-khud: web build → cap sync → native copy → **versionCode +1 & versionName bump** → sign.
Output:
```
android/app/build/outputs/bundle/release/app-release.aab
```
➜ Yahi `.aab` **Play Console** pe upload karo.

### B2b. Debug APK (sirf phone pe jaldi test ke liye — Play Store ke liye NAHI)
```bash
# Windows:
set NEKSATHI_API_ORIGIN=https://<your-domain> && npm run build:apk
# Mac/Linux:
NEKSATHI_API_ORIGIN=https://<your-domain> npm run build:apk
```
Output:
```
output/NekSathi-updated-debug.apk
```
➜ Yeh APK phone me install karke naye native features (torch, background location, crash detection,
video call, device locate) test karo.

---

## PART C — SAHI ORDER (ek baar me)

1. **Server:** `git pull` → backend **restart** (A2) → web **rebuild** (A3).
2. **App:** pehle **B2b APK** banakar phone pe test → sab theek lage to **B2a AAB** banakar Play Console pe.
3. **Verify karo:**
   - Web/App dono: splash, login (email **ya** mobile), notification bell (6-6 + View more),
     Appearance (Light/Dark/System ek line), QR pause, Helplines, Wallet, My Story, Block number.
   - Sirf app (device pe): Torch, Background location (Android "Allow all the time" permission do),
     Crash detection, Video call (2 phone chahiye), Device locate.

---

## ROLLBACK (kuch galat ho jaaye to)

- **Web:** Option 2 (DEPLOY_VPS.sh) har run pe backup banata hai `.neksathi-backups/` me — wahi tar extract kar do.
  Ya in-place: `cd frontend && git checkout <purana-commit> && npm run build`.
- **Backend:** `git checkout <purana-commit>` → backend **restart** (A2).
- **App:** Play Console → release management → previous version pe roll back.

---

## Permissions note (background location / crash)

- **Background location:** user ko Android settings me location **"Allow all the time"** dena padega,
  warna app band hone par location update nahi hoga.
- **Crash detection:** app khula/active hone par kaam karta hai; impact pe 20s countdown, "I'm OK" se cancel.
