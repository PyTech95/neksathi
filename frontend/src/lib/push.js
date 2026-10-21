import { Capacitor } from "@capacitor/core";
import api from "@/lib/api";

let started = false;

// Register this device for FCM push and send the token to our backend, so the
// server can wake the phone with an "incoming call" notification even when the
// app is in the background or recently closed. No-op on the web.
export async function initPush(userId) {
  if (!userId) return;
  if (!Capacitor.isNativePlatform()) return;
  if (started) return;
  started = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") { started = false; return; }

    // Device token → backend (de-duped server-side).
    PushNotifications.addListener("registration", async (token) => {
      try { await api.post("/me/push-token", { token: token.value, platform: "android" }); } catch (_) {}
    });
    PushNotifications.addListener("registrationError", () => { started = false; });

    // Foreground: the global IncomingCall poller already handles the ringing
    // call, so nothing extra is needed here.
    PushNotifications.addListener("pushNotificationReceived", () => {});

    // Tapped the notification → open the dashboard; the IncomingCall listener
    // there picks up and shows the ringing call.
    PushNotifications.addListener("pushNotificationActionPerformed", () => {
      try { if (window.location.pathname !== "/dashboard") window.location.assign("/dashboard"); } catch (_) {}
    });

    await PushNotifications.register();
  } catch (_) {
    started = false;
  }
}
