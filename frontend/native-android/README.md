# Native Android layer (Nek Sathi app)

Source of truth for everything in the APK that the web code cannot do. The
generated `frontend/android/` project is **not** committed; these files are
copied into it by `node scripts/apply-native.cjs` before every build.

```
npm install
npx cap add android          # first time only (creates android/)
npm run build && npx cap sync android
node scripts/apply-native.cjs
# put android/app/google-services.json in place (Firebase > Android app com.neksathi.app)
cd android && gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

| File | Purpose |
| --- | --- |
| `java/.../MainActivity.java` | Capacitor activity; registers `NekNativePlugin`; grants mic to the WebView; opens an answered call from the lock screen |
| `java/.../CallMessagingService.java` | FCM service: `incoming_call` → ring + full-screen call UI; `call_cancel` → stop everywhere; other pushes → Capacitor |
| `java/.../IncomingCallActivity.java` | Full-screen Accept/Decline screen over the lock screen (self-closes after 50 s) |
| `java/.../CallActionReceiver.java` | "Decline" action of the call notification |
| `java/.../CallApi.java` | Tiny HTTP client + saved API base/JWT (`nek_calls` prefs) used by native code |
| `java/.../RingPlayer.java` | Looping ringtone + vibration |
| `java/.../CallSetupActivity.java` | One-time permissions screen (full-screen intents, overlay, battery, autostart) |
| `java/.../NekNativePlugin.java` | JS bridge: call setup/auth hints + anti-theft config (`setTheftConfig`, `getTheftStatus`, `requestTheftPermissions`, `openDeviceAdmin`, `openOverlaySettings`, `testIntruderCapture`) |
| `java/.../TheftAdminReceiver.java` | Device Admin receiver: counts wrong unlock attempts (`watch-login`) and starts the capture at the threshold |
| `java/.../IntruderCaptureService.java` | Foreground service: front-camera photo (Camera2) + last known location → `POST /api/devices/{id}/intruder` (queued if offline) |
| `AndroidManifest.xml` | Activities, services, receivers, permissions; removes Capacitor's default FCM service |
| `res/layout/*.xml` | Call screen and call-setup layouts |
| `res/xml/device_admin.xml` | Device-admin policies (`watch-login`, `force-lock`) |
| `res/raw/ringtone.ogg` | Fallback ringtone |

Never commit `android/app/google-services.json` or a signing keystore.
