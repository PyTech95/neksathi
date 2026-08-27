# Nek Sathi — Mobile App (Capacitor: Android + iOS)

The existing React web app is now wrapped with **Capacitor** so it runs as a native
**Android** and **iOS** app while talking to the **same backend**
(`https://neksathi-deploy.preview.emergentagent.com`). One codebase — no UI rewrite.

```
frontend/
├── build/                     # compiled web assets (Capacitor webDir)
├── capacitor.config.json      # appId com.neksathi.app, appName "Nek Sathi"
├── android/                   # native Android project (open in Android Studio)
└── ios/                       # native iOS project (open in Xcode on a Mac)
```

## Everyday workflow (after you change the web app)
```bash
cd frontend
yarn build            # rebuild web assets
npx cap sync          # copy assets + plugins into android/ and ios/
```

---

## Build the Android APK

### Option A — GitHub Actions (recommended, zero local setup)
A workflow is included at `.github/workflows/android-build.yml`. Push the repo to GitHub
(use the **Save to GitHub** button) → open the **Actions** tab → run **"Build Android APK"**
(or just push to `main`) → download `neksathi-debug-apk` from the run's **Artifacts**.
Runs on Ubuntu x86_64, so it "just works".

### Option B — Android Studio (local, easiest for iterating)
1. Install Android Studio.
2. Open the `frontend/android` folder.
3. Let Gradle sync, then **Build → Build APK(s)** (or Run on an emulator/device).
4. APK output: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

### Option C — Command line (on any x86_64 machine with Android SDK + JDK 17)
```bash
cd frontend
yarn build && npx cap sync android
cd android && ./gradlew assembleDebug
# -> app/build/outputs/apk/debug/app-debug.apk
```

Install on a phone: enable **Install unknown apps**, then open the `.apk`.

---

## Build the iOS app (requires macOS)
iOS binaries can only be produced on a Mac.
```bash
cd frontend
yarn build && npx cap sync ios
sudo gem install cocoapods       # first time only
npx cap open ios                 # opens Xcode
```
In Xcode: pick your Apple **Team** (needs a free/paid Apple Developer account),
select a device/simulator, and **Run** / **Product → Archive** to distribute.

---

## Notes
- The app calls the backend via `REACT_APP_BACKEND_URL` baked into the web build.
  To point the app at your **deployed** backend, set that env var before `yarn build`
  (in CI it's set in the workflow), then `npx cap sync` and rebuild.
- CORS: backend currently allows all origins, and the app uses bearer-token auth
  (no cookies), so the Capacitor `https://localhost` origin works out of the box.
- v1 is a **wrap-as-is** (web UI in a native shell). Native features (background GPS,
  camera, push, anti-theft device-admin) can be added later via Capacitor plugins.
