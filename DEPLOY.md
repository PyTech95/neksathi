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

> Backend badla hai, isliye server update **zaroori** hai. Dhyan: `frontend/build/`
> git me tracked NAHI hai — isliye `git pull` sirf backend + source laata hai; website
> (browser) tabhi update hoti hai jab `npm run build` chalaate ho (A3).

### A1 + A2. Code pull + backend restart  *(REQUIRED — backend changed)*
```bash
cd /var/www/neksathi && git pull && systemctl restart neksathi-backend
```
Naye Python packages nahi aaye, isliye sirf restart — koi `pip install` nahi.
> Agar kabhi `requirements.txt` badle to restart se pehle:
> `cd /var/www/neksathi/backend && pip install -r requirements.txt`

**Status / verify:**
```bash
systemctl status neksathi-backend --no-pager      # 'active (running)' aana chahiye
# fail dikhe to error:
journalctl -u neksathi-backend -n 50 --no-pager
```

### A3. Web frontend rebuild  *(web + admin console changed)*
```bash
cd /var/www/neksathi/frontend && npm run build
# Nginx frontend/build serve karta hai -> site kholke HARD REFRESH (Ctrl+Shift+R)
```
> `frontend/.env` me `REACT_APP_BACKEND_URL` theek ho (ya khaali to site ka /api proxy use hota hai).
> Yeh step sirf **browser/web + admin** ke liye hai — mobile app ke changes AAB se aate hain (PART B).

### Pura server update ek saath
```bash
cd /var/www/neksathi && git pull && systemctl restart neksathi-backend
cd /var/www/neksathi/frontend && npm run build
systemctl status neksathi-backend --no-pager
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

- **Backend + Web:** purane commit pe jao, phir restart + rebuild:
  ```bash
  cd /var/www/neksathi && git checkout <purana-commit> && systemctl restart neksathi-backend
  cd /var/www/neksathi/frontend && npm run build
  ```
  (Wapas latest pe: `git checkout main`.)
- **App:** Play Console → release management → previous version pe roll back.

---

## Permissions note (background location / crash)

- **Background location:** user ko Android settings me location **"Allow all the time"** dena padega,
  warna app band hone par location update nahi hoga.
- **Crash detection:** app khula/active hone par kaam karta hai; impact pe 20s countdown, "I'm OK" se cancel.
