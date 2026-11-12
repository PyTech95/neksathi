# Nek Sathi v1.10.1 — 2-device test guide (siren / SIM / lock / intruder)

Ye un fixes ko apne 2 phone pe test karne ke steps hain jo is release me aaye:
remote siren, family-phone siren, SIM-removal alert, remote lock, intruder photo,
caching aur logo/Pixel-10 header.

---

## 0. Pehle ye 2 cheezein zaroori (warna kuch kaam nahi karega)

1. **Backend redeploy** (VPS pe):
   ```
   cd /var/www/neksathi && git pull && systemctl restart neksathi   # (jo bhi service name ho)
   ```
   Siren/lock/SIM ke naye push backend se jaate hain — purane backend pe nahi chalega.

2. **Dono phone pe NAYA app install** (`versionCode 12`, `versionName 1.10.1`):
   - `android/app/build.gradle` me `versionCode 12`, `versionName "1.10.1"` kar do.
   - `native-android/java/*` + `native-android/AndroidManifest.xml` + `native-android/res/*`
     android project me copy karke rebuild karo (wahi process jo pichli baar tha).
   - **Siren/lock/theft_siren bilkul NAYE message type hain — purane build me ye handler
     hain hi nahi, isliye dono phone naya build hona chahiye.**

### Har phone pe ek baar setup (warna FCM/siren nahi aayega)
- App me **login** (isse FCM token + api/token native prefs me save hota hai).
- **Notifications** permission ON.
- Theft test ke liye: **Device Admin enable**, **protection ON**, aur
  Realme/Xiaomi/Oppo pe **Autostart ON + battery "No restrictions"**.
- Internet ON.

### Logcat (kya ho raha hai dekhne ke liye) — phone USB se laptop pe:
```
adb logcat | grep -iE "NekTheft|NekSim|NekTheftEvent|intruder|siren|FCM|theft"
```

---

## Test 1 — Remote siren (apne khoye phone ko bajana)

**Setup:** Device A = test phone (login kiya hua). Siren **browser/web portal se** bajao
(kisi 3rd device ya laptop pe `www.neksathi.in` login karke), taaki sirf Device A baje.

> Note: siren push account ke **sabhi** phones pe jaata hai. Agar dono test phone **same
> account** pe hain to dono bajenge — ye normal hai. Single-phone saaf test ke liye web se bajao.

1. Web → **Anti-Theft → My devices → Device A ka "Siren" button**.
2. ✅ Device A pe (lock screen pe bhi) tez siren + vibration aani chahiye + full-screen alert.
3. Web pe **"Stop siren"** → ✅ Device A chup.
4. Ya Device A app khol lo → siren apne aap band (app khulte hi stop ho jaata hai).

**Agar na baje:** Device A pe notifications ON? internet? naya build? Logcat me siren dikha?

---

## Test 2 — Family member ke phone pe siren (mobile lost)

**Setup:** Device A = owner account. Device B = **alag account** (family member),
dono **ek hi Family circle** me (jaise tumhare screenshot me "Test" circle 2/5 me hai).
Dono login + notifications ON.

Trigger (koi bhi ek):
- Device A se SIM nikaalo (Test 3), **ya**
- Device A pe galat PIN daalke intruder trigger karo (Test 4), **ya**
- Admin/owner se intruder event aaye.

✅ **Device B** (family member) ke phone pe tez siren + "🚨 ... alert" full-screen aana chahiye,
tap karne pe Family page khulta hai. (Pehle sirf chupchaap notification aati thi — ab awaaz aayegi.)

---

## Test 3 — SIM removal alert

**Setup:** Device A pe protection ON.

1. Device A **band kiye bina** SIM tray nikaalo (SIM eject).
2. ✅ Anti-Theft screen → **"SIM change alerts"** me entry aani chahiye (pehle hamesha
   "No SIM changes detected" rehta tha — wo bug tha, ab theek).
3. ✅ Device A **lock + siren** ON ho jaana chahiye; family (Device B) ko siren.

> ⚠️ Honest baat: kuch phone (Android 14/15, MIUI/Realme) **SIM_STATE broadcast** turant
> nahi dete jab app background me ho — ye Android ki OEM limitation hai, hamari nahi.
> **Pakka chalने wala** backstop: SIM nikaalkar **phone restart** karo → boot pe
> "device restarted" theft event jaata hai (lock + family alert). Isliye demo me:
> SIM nikaalo → phone off/on → alert aata hai. Agar bina restart ke bhi aa jaaye to aur accha.

---

## Test 4 — Intruder photo + location (galat PIN)

**Sabse aasaan:** Anti-Theft → **"Test capture now"** dabao → 3–10 sec me neeche
"Intruder captures" me ek photo + "View location" aana chahiye.

Real test:
1. Device A lock karo (PIN/pattern set hona chahiye).
2. Lock screen pe **galat PIN** threshold (jaise 2) baar daalo.
3. ✅ Front-camera photo + location capture → owner + family ko.
4. ✅ **Photo ab black nahi** honi chahiye (exposure settle fix). Thoda dark ho sakti hai
   agar kamre me andhera ho — wo normal hai; pure black nahi aani chahiye.

> Agar "5 failed attempts" dikhe jabki threshold 2 set kiya — ye theek hai: 2 pe photo
> ban gayi, aur tum trying karte rahe to count badhta gaya; 20 sec me 1 hi photo (spam na ho).

---

## Test 5 — Remote lock

1. Web/portal → Device A ka **"Lock"**.
2. ✅ Device A ki screen turant **lock** ho jaani chahiye (Device Admin on hone pe).
3. "Unlock"/"Mark safe" → DB flag clear + siren band. **Phone ka PIN Android security ki
   wajah se app nahi hata sakta** — screen khud se nahi khulti, user ko PIN daalna padega. Ye expected.

---

## Test 6 — Caching + logo + Pixel 10 (bas dekhna hai)

- **Family tab:** Profile → Family jaao, wapas aao → ✅ **turant purana data** dikhe,
  spinner har baar nahi (background me chupchaap refresh hoga).
- **Logo:** light theme me top-left **"Nek"** ab **dikhega** (pehle white-on-white tha,
  sirf "Sathi" laal dikhta tha).
- **Pixel 10:** header/alert-bell **status bar ke neeche** aa gaya hoga, overlap nahi.
  (Purane phone pe pehle bhi sahi tha — Android 15 edge-to-edge ki wajah se sirf Pixel 10 pe tha.)

---

## Quick checklist

| # | Feature | Pass? |
|---|---------|-------|
| 1 | Web se Siren → phone bajta hai | ☐ |
| 2 | Theft event → family phone pe siren | ☐ |
| 3 | SIM nikaalne pe "SIM change alerts" me dikhta hai | ☐ |
| 4 | "Test capture now" → photo (black nahi) + location | ☐ |
| 5 | Remote Lock → phone lock | ☐ |
| 6 | Family tab instant load, Nek logo dikhta, Pixel 10 header theek | ☐ |

Jo bhi ☐ fail ho uska number + phone model + logcat ka screenshot bhej dena — fix kar dunga.
