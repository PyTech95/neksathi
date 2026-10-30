import { Capacitor } from "@capacitor/core";
import NekNative from "@/lib/neknative";

// Helpers for the "make the SOS alert show on the lock screen" setup. Whether the
// full-screen SOS pops over the lock screen depends on per-device permissions
// (Android 14 full-screen-intent + OEM show-on-lock-screen / background / battery);
// these open the right settings screens. No-ops on the web.
export const isNativeApp = () => { try { return Capacitor.isNativePlatform(); } catch (_) { return false; } };

export async function sosDisplayStatus() {
  if (!isNativeApp()) return { supported: false };
  try { return (await NekNative.getSosDisplayStatus()) || { supported: false }; } catch (_) { return { supported: false }; }
}
export async function openFullScreenSettings() {
  if (!isNativeApp()) return; try { await NekNative.openFullScreenIntentSettings(); } catch (_) {}
}
export async function openAppInfo() {
  if (!isNativeApp()) return; try { await NekNative.openAppInfoSettings(); } catch (_) {}
}
export async function requestBatteryExempt() {
  if (!isNativeApp()) return; try { await NekNative.requestIgnoreBatteryOptimizations(); } catch (_) {}
}
