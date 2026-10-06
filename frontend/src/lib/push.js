// Push-notification registration for the Capacitor app.
// On a real device it requests permission, registers with FCM/APNs, and sends
// the device token to the backend (POST /api/register-push, relayed to Emergent Push).
// On the web (or when Firebase isn't configured yet) it safely does nothing.
import { Capacitor } from "@capacitor/core";

export async function initPush(userId) {
  if (!Capacitor.isNativePlatform() || !userId) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    await PushNotifications.removeAllListeners();
    PushNotifications.addListener("registration", async (token) => {
      try {
        const api = (await import("@/lib/api")).default;
        await api.post("/register-push", {
          user_id: userId,
          platform: Capacitor.getPlatform(), // "android" | "ios"
          device_token: token.value,
        });
      } catch (_) { /* backend relay optional */ }
    });
    PushNotifications.addListener("registrationError", () => {});
    await PushNotifications.register();
  } catch (_) {
    // Plugin missing or Firebase/APNs not configured yet — ignore silently.
  }
}
