import { Capacitor, registerPlugin } from "@capacitor/core";

// Bridge to the native "Call setup" screen (full-screen call / lock-screen
// permissions). No-op on the web.
const NekNative = registerPlugin("NekNative");

export function openCallSetup() {
  if (!Capacitor.isNativePlatform()) return false;
  try { NekNative.openCallSetup(); return true; } catch (_) { return false; }
}

// Tell native a call just ended, so if it was answered over the lock screen the
// phone returns to its lock screen instead of staying on the app.
export function notifyCallEnded() {
  if (!Capacitor.isNativePlatform()) return;
  try { NekNative.callEnded(); } catch (_) {}
}

// Show the setup screen once, shortly after the user first reaches the app,
// so calls can ring on the lock screen without the user hunting for settings.
export function maybeAutoOpenCallSetup() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (localStorage.getItem("nk_call_setup_done") === "1") return;
    localStorage.setItem("nk_call_setup_done", "1");
    setTimeout(() => openCallSetup(), 1500);
  } catch (_) {}
}

export const isNativeApp = () => {
  try { return Capacitor.isNativePlatform(); } catch (_) { return false; }
};
