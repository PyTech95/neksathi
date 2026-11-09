import { Capacitor } from "@capacitor/core";
import NekNative from "@/lib/neknative";

// Incoming-call ringtone choice (pt 12): default | siren | custom. No-ops on web.
export const isNativeApp = () => { try { return Capacitor.isNativePlatform(); } catch (_) { return false; } };

export async function getRingtone() {
  if (!isNativeApp()) return { mode: "default" };
  try { return (await NekNative.getRingtone()) || { mode: "default" }; } catch (_) { return { mode: "default" }; }
}
export async function setRingtone(mode) {
  if (!isNativeApp()) return;
  try { await NekNative.setRingtone({ mode }); } catch (_) {}
}
export async function pickCustomRingtone() {
  if (!isNativeApp()) return null;
  try { return await NekNative.pickCustomRingtone(); } catch (_) { return null; }
}
