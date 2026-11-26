// Background location sharing (native foreground service). Posts the phone's
// location to /me/status periodically even when the app is backgrounded/closed,
// feeding the family timeline + real-time overspeed. No-op on the web.
import { Capacitor } from "@capacitor/core";
import NekNative from "@/lib/neknative";
import { setCallAuth } from "@/lib/callsetup";
import { API } from "@/lib/api";

const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch (_) { return false; } })();

export function bgLocationSupported() { return isNative; }

export async function startBackgroundLocation() {
  if (!isNative) return false;
  // Make sure native has a fresh API base + token to post with.
  try { setCallAuth(API, localStorage.getItem("nk_token")); } catch (_) {}
  const r = await NekNative.startLocationService();
  return !!(r && r.running);
}

export async function stopBackgroundLocation() {
  if (!isNative) return false;
  const r = await NekNative.stopLocationService();
  return !!(r && r.running);
}

export async function backgroundLocationStatus() {
  if (!isNative) return false;
  try {
    const r = await NekNative.getLocationServiceStatus();
    return !!(r && r.running);
  } catch (_) { return false; }
}
