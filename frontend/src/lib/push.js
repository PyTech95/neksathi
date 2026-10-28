import { Capacitor } from "@capacitor/core";
import api from "@/lib/api";

let started = false;

// Register this device for FCM push and send the token to our backend, so the
// server can wake the phone with an "incoming call" notification even when the
// app is in the background or recently closed. No-op on the web.
export async function initPush(userId) {
  if (!userId) return;
  if (!Capacitor.isNativePlatform()) return;
  // Opt-out: a build without Firebase/FCM config (no google-services.json) would
  // CRASH on PushNotifications.register(). Set REACT_APP_DISABLE_PUSH=1 in such a
  // build (e.g. a quick test APK) to skip push entirely. Real builds that ship
  // google-services.json leave this unset so push works normally.
  if (process.env.REACT_APP_DISABLE_PUSH === "1") return;
  if (started) return;
  started = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") { started = false; return; }

    // High-importance channel so alerts show as a heads-up banner on the lock
    // screen with sound/vibration (WhatsApp-style). The backend targets this
    // channel id. Creating it again is a harmless no-op.
    try {
      await PushNotifications.createChannel({
        id: "nek_alerts", name: "Nek Sathi alerts",
        description: "Vehicle incidents, family alerts and SOS",
        importance: 5, visibility: 1, sound: "default", vibration: true, lights: true,
      });
    } catch (_) {}

    // Device token → backend (de-duped server-side).
    PushNotifications.addListener("registration", async (token) => {
      try { await api.post("/me/push-token", { token: token.value, platform: "android" }); } catch (_) {}
    });
    PushNotifications.addListener("registrationError", () => { started = false; });

    // Foreground: the global IncomingCall poller already handles the ringing
    // call, so nothing extra is needed here.
    PushNotifications.addListener("pushNotificationReceived", () => {});

    // Tapped the notification → open the screen it points to (e.g. /incidents
    // for a wrong-parking alert, so "I AM COMING" is right there). Falls back
    // to the dashboard, where the IncomingCall listener shows a ringing call.
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      try {
        const url = (action && action.notification && action.notification.data && action.notification.data.action_url) || "/dashboard";
        if (window.location.pathname !== url) window.location.assign(url);
      } catch (_) {}
    });

    await PushNotifications.register();
  } catch (_) {
    started = false;
  }
}
