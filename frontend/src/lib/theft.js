import { Capacitor, registerPlugin } from "@capacitor/core";

// Bridge to the native anti-theft engine (Device Admin + front-camera intruder
// capture) — see android TheftAdminReceiver / IntruderCaptureService. Every call
// is a no-op on the web, where the page only manages settings.
const NekNative = registerPlugin("NekNative");

export const isNativeApp = () => {
  try { return Capacitor.isNativePlatform(); } catch (_) { return false; }
};

const EMPTY = { supported: false };

export async function theftStatus() {
  if (!isNativeApp()) return EMPTY;
  try { return (await NekNative.getTheftStatus()) || EMPTY; } catch (_) { return EMPTY; }
}

// {device_id, threshold, enabled} — which backend device record is this phone
// and after how many wrong unlocks to capture.
export async function setTheftConfig(cfg) {
  if (!isNativeApp()) return EMPTY;
  try { return (await NekNative.setTheftConfig(cfg)) || EMPTY; } catch (_) { return EMPTY; }
}

export async function requestTheftPermissions() {
  if (!isNativeApp()) return;
  try { await NekNative.requestTheftPermissions(); } catch (_) {}
}

export async function openDeviceAdmin() {
  if (!isNativeApp()) return false;
  try { await NekNative.openDeviceAdmin(); return true; } catch (_) { return false; }
}

export async function removeDeviceAdmin() {
  if (!isNativeApp()) return EMPTY;
  try { return (await NekNative.removeDeviceAdmin()) || EMPTY; } catch (_) { return EMPTY; }
}

export async function openOverlaySettings() {
  if (!isNativeApp()) return false;
  try { await NekNative.openOverlaySettings(); return true; } catch (_) { return false; }
}

// Runs photo + location + upload once so the user can see a capture appear in
// "Intruder captures" (and on the family's phones) without locking the phone.
export async function testIntruderCapture() {
  if (!isNativeApp()) return false;
  try { await NekNative.testIntruderCapture(); return true; } catch (_) { return false; }
}

// A phone is protected only when every piece is in place.
export function theftReady(s) {
  return !!(s && s.supported && s.admin_active && s.camera && s.enabled && s.device_id && s.auth);
}
