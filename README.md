# Nek Sathi — FINAL integrated source update

This is the existing React/CRA + Capacitor + FastAPI project, with the public website updated IN THE REAL APPLICATION.
It is NOT an image-only bundle or a stand-alone HTML mockup. There is deliberately no PREVIEW.html.

## Fastest VPS update (existing site)
1. Upload `NekSathi-FINAL-Website-Code.zip` to `/root/`.
2. Extract it separately from the live project:

```bash
mkdir -p /root/neksathi-final-update
unzip -o /root/NekSathi-FINAL-Website-Code.zip -d /root/neksathi-final-update
cd /root/neksathi-final-update/neksathi-main
bash DEPLOY_VPS.sh /var/www/neksathi
```

**Replace `/var/www/neksathi` with the actual project path on YOUR VPS.** The script expects its frontend at `PROJECT/frontend` and the existing Nginx root at `PROJECT/frontend/build`.
Do not assume that `/var/www/neksathi` is your actual directory. Check the working site configuration first.
If the API is on a DIFFERENT domain, pass its real origin as the second argument:

```bash
bash DEPLOY_VPS.sh /actual/project/path https://your-api-domain.com
```

Without that optional argument, the web build intentionally uses the SAME domain's `/api` proxy.
The deployment script requires installed Node/npm, bash, rsync and tar. It reuses your working frontend node_modules where present; otherwise it installs dependencies in a separate staging directory. It does NOT run a forced dependency upgrade.
Set `NEKSATHI_FRESH_INSTALL=1` only when you deliberately want a fresh staged npm install.

### Deployment safeguards
The script builds outside the live folder first. A failed build stops before publishing.
It then backs up the current frontend to a private `.neksathi-backups` folder next to your project.
It copies compiled assets before atomically replacing `build/index.html`, and retains older hashed chunks for already-open tabs.
Existing backend, database, TLS/Nginx settings, native android/ios folders and `.env*` files are not overwritten.
The frontend source is also updated after successful compilation. A backend restart is not needed for this source-only website change.
Nginx configuration is checked when nginx is available, but no configuration is edited or service restarted by this script.
Use `ROLLBACK_VPS.sh PROJECT BACKUP.tar.gz` to restore a trusted backup made by the deploy script.

If your Nginx uses a different static root, a CDN upload, or a symlink/release mechanism, build this frontend and publish it using your existing deployment process rather than changing Nginx blindly.

## Local Windows website
Double-click `START_LOCAL.cmd`, or:

```powershell
cd frontend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm start
```

Open `http://localhost:3000`. The included example points API calls to `http://127.0.0.1:8000`.
To use your live backend while testing locally, put its actual origin in `frontend/.env` as `REACT_APP_BACKEND_URL=https://your-domain.com` and restart the dev server. The backend must allow the local browser origin through its CORS configuration.
Public website rendering does not need a running backend. Login, registration, enquiries, SOS and other real workflows need the correctly configured original backend.

## Local Android APK
Windows: run `BUILD_APK.cmd` and enter your REAL public HTTPS backend origin when prompted.
Linux/macOS: `bash BUILD_APK.sh https://your-domain.com`.
Or inside frontend: `npm run build:apk -- https://your-domain.com`.

Install Android Studio, its Android SDK 34, build tools and a compatible JDK (the original Capacitor 6 project uses JDK 17+). Set ANDROID_HOME and JAVA_HOME as needed. Downloads/SDK licence acceptance are required on a first build.
The script rebuilds the web code, runs Capacitor sync, restores a missing Gradle wrapper using an official-source checksum check when needed, then runs assembleDebug.
Successful output: `output/NekSathi-updated-debug.apk`.
The pre-existing `frontend/public/downloads/neksathi.apk` is an OLD binary carried forward from the user's project, NOT a new build. The builder excludes this old downloadable APK from the new app's embedded web assets.

No newly compiled APK is supplied in this ZIP. No release signing key is created or replaced. Debug output is for local testing, not a Google Play release. Native SDK upgrades, version-code changes, signing and Play policy review are outside this public-website update.
The app's HTTPS localhost origin must be allowed by your backend where appropriate; never put a backend localhost/127.0.0.1 origin into an APK intended for a physical phone.
Existing native background/push/device-protection functionality has not been reimplemented or end-to-end tested in this graphics update.

## What changed in the actual app
- `frontend/src/website/Website.jsx`: integrated service images in homepage scenes, inner pages, family journeys and personal safety.
- `frontend/src/website/motion.css`: real image pan/zoom, scan sweep and signal animations, responsive image sizing, pause/reduced-motion support.
- `frontend/src/website/experience.js`: actual slider, motion controls, visibility handling and existing interactions.
- `frontend/src/website/data.js`: in-project optimised WebP asset references.
- `frontend/public/website/generated/`: optimised service assets bundled and referenced by React, not files you must insert manually.
- `frontend/public/index.html`: first hero image preload.
- `frontend/scripts/`: asset validation and local debug APK helper.

The existing app routing already mounts this website through Landing/Website components. Login, member/admin dashboards, QR scan pages and backend endpoints remain in the project. The previous silent illustrated MP4 is retained in the real website video section; no new live-action video is claimed.

## Validation and limits
122 JavaScript/JSX/helper files passed syntax transpilation checks; both website CSS files parsed successfully.
Eight desktop/mobile static-render checks of the current JSX passed without horizontal overflow or broken above-the-fold images. Ten slider-selection checks and two pause checks passed using the actual website motion engine.
These browser checks used inline static rendering in an isolated browser, NOT a bundled React production app. All 25 backend files matched the preceding supplied archive byte-for-byte.
**A clean npm install/CRA production build, live VPS deployment and Android APK compilation were NOT completed in this environment.** npm registry DNS was unavailable; no claim of build success is made. Deployment only publishes after YOUR machine produces a successful build.
See `VALIDATION.json` for this run's results. Keep server environment files and signing keys private.

## Official references for the preserved toolchain
- Capacitor 6 Android: https://capacitorjs.com/docs/v6/android
- Capacitor 6 environment: https://capacitorjs.com/docs/v6/getting-started/environment-setup
- Nginx guide: https://nginx.org/en/docs/beginners_guide.html
