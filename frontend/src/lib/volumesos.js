import { Capacitor, registerPlugin } from "@capacitor/core";

// Bridge to the native "SOS by volume button" service (android VolumeSosService):
// pressing volume-up 3 times within 5 seconds — on the lock screen, app closed —
// sends an SOS (with location) to the family members the user chose. The sender's
// phone only vibrates briefly; no sound, no popup. No-op on the web.
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

// Runs the trigger path once (vibration + location + SOS) so the user can
// confirm the family receives it, without pressing the keys.
export async function testVolumeSos() {
  if (!isNativeApp()) return false;
  try { await NekNative.testVolumeSos(); return true; } catch (_) { return false; }
}
