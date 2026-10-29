import { Capacitor, registerPlugin } from "@capacitor/core";

// Bridge to the native "SOS by volume button" service (android
// VolumeSosService): volume-up pressed 3 times within 5 seconds, on the lock
// screen or with the app closed, sends an SOS to the family circle with the
// phone's location — no countdown, no popup, just a short vibration. No-op on
// the web.
const NekNative = registerPlugin("NekNative");

export const isNativeApp = () => {
  try { return Capacitor.isNativePlatform(); } catch (_) { return false; }
};

const EMPTY = { supported: false };

export async function volumeSosStatus() {
  if (!isNativeApp()) return EMPTY;
  try { return (await NekNative.getVolumeSosStatus()) || EMPTY; } catch (_) { return EMPTY; }
}

export async function setVolumeSos(enabled) {
  if (!isNativeApp()) return EMPTY;
  try { return (await NekNative.setVolumeSos({ enabled: !!enabled })) || EMPTY; } catch (_) { return EMPTY; }
}

// Runs the trigger path once (vibration + location + POST /me/sos) so the user
// can confirm the family receives it, without pressing the buttons.
export async function testVolumeSos() {
  if (!isNativeApp()) return false;
  try { await NekNative.testVolumeSos(); return true; } catch (_) { return false; }
}
