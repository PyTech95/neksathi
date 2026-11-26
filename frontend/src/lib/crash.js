// Crash detection from the device accelerometer (DeviceMotion). A sudden
// high-G impact is treated as a possible crash; the UI then shows a countdown
// ("Are you OK?") and only auto-sends an SOS if the user doesn't cancel. The
// accelerometer alone can't tell a crash from a hard drop, so the human
// confirmation step is the safety net.

export const GRAVITY = 9.80665;
// ~3G total (incl. gravity). A normal ride rarely exceeds ~1.5G; a crash spikes
// far higher. Tunable without touching the detector.
export const DEFAULT_THRESHOLD_MS2 = 29;

export function magnitude(a) {
  if (!a) return 0;
  const x = a.x || 0, y = a.y || 0, z = a.z || 0;
  return Math.sqrt(x * x + y * y + z * z);
}

// Stateful detector: feed accelerometer samples; returns true once per impact,
// then stays quiet for `cooldownMs` so one crash fires a single alert.
export function createCrashDetector({ thresholdMs2 = DEFAULT_THRESHOLD_MS2, cooldownMs = 8000 } = {}) {
  let lastHit = -Infinity;
  return {
    sample(a, now = Date.now()) {
      const m = magnitude(a);
      if (m >= thresholdMs2 && (now - lastHit) > cooldownMs) {
        lastHit = now;
        return true;
      }
      return false;
    },
  };
}

// iOS 13+ gates DeviceMotion behind a permission prompt; Android/most WebViews
// don't. Returns true when motion events may be used.
export async function ensureMotionPermission() {
  try {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      const res = await DeviceMotionEvent.requestPermission();
      return res === "granted";
    }
  } catch (_) {
    return false;
  }
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

// Attach a crash watcher; returns an unsubscribe function.
export function startCrashWatch(onCrash, opts) {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return () => {};
  const det = createCrashDetector(opts);
  const handler = (e) => {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    if (det.sample({ x: a.x, y: a.y, z: a.z })) {
      try { onCrash(); } catch (_) {}
    }
  };
  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}
