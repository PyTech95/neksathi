// Native-hardware bridge for the Capacitor app.
// On a real device it uses Capacitor Geolocation/Camera plugins; on the web it
// transparently falls back to the browser APIs, so the same code runs everywhere.
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Camera, CameraResultType, CameraSource, CameraDirection } from "@capacitor/camera";

export const isNative = Capacitor.isNativePlatform();

// A location error carries a `reason` so callers can show the right prompt:
//   "permission" = the app wasn't allowed location
//   "off"        = device GPS / location services are turned off
//   "timeout"    = on, but no fix in time
//   "unsupported"= no geolocation at all
function locErr(reason, message) { const e = new Error(message || reason); e.reason = reason; return e; }

// Returns { latitude, longitude, accuracy, speed_kmh } or throws a tagged error.
export async function getPosition({ timeout = 8000, enableHighAccuracy = true } = {}) {
  if (isNative) {
    let perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      try { perm = await Geolocation.requestPermissions(); } catch (_) {}
      if (perm.location !== "granted") throw locErr("permission", "Location permission is off for Nek Sathi.");
    }
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy, timeout });
      const sp = pos.coords.speed; return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, speed_kmh: sp != null && sp >= 0 ? sp * 3.6 : null };
    } catch (e) {
      // Capacitor reports "location unavailable"/"disabled" when GPS is off.
      const msg = String(e && e.message || e).toLowerCase();
      if (msg.includes("disabled") || msg.includes("unavailable") || msg.includes("location services")) throw locErr("off", "Your phone's location is turned off.");
      throw locErr("timeout", "Couldn't get your location. Try again.");
    }
  }
  if (!navigator.geolocation) throw locErr("unsupported", "This device has no location.");
  return await new Promise((res, rej) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => { const sp = pos.coords.speed; res({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, speed_kmh: sp != null && sp >= 0 ? sp * 3.6 : null }); },
      (err) => {
        // 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
        if (err && err.code === 1) rej(locErr("permission", "Location permission is blocked in your browser."));
        else if (err && err.code === 3) rej(locErr("timeout", "Couldn't get your location. Try again."));
        else rej(locErr("off", "Your location is turned off."));
      },
      { timeout, enableHighAccuracy });
  });
}

// User-facing text + whether we can deep-link to settings (native only).
export function locationHint(err) {
  const reason = (err && err.reason) || "off";
  const map = {
    off: "Your location is turned off. Please turn on Location to share with your family.",
    permission: "Nek Sathi needs location permission. Please allow it, then try again.",
    timeout: "Couldn't get your location just now. Please try again in a moment.",
    unsupported: "This device can't share location.",
  };
  return { reason, message: map[reason] || map.off, canOpenSettings: isNative && (reason === "off" || reason === "permission") };
}

// Deep-link to the device's location settings (native only; no-op on web).
export async function openLocationSettings() {
  if (!isNative) return false;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const NekNative = registerPlugin("NekNative");
    await NekNative.openLocationSettings();
    return true;
  } catch (_) { return false; }
}

// Captures a front-camera selfie and returns a JPEG data URL, or null on failure/denial.
export async function captureSelfie() {
  if (isNative) {
    try {
      const photo = await Camera.getPhoto({
        quality: 60,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        direction: CameraDirection.Front,
        allowEditing: false,
        saveToGallery: false,
      });
      return photo.dataUrl || null;
    } catch (_) { return null; }
  }
  // Web fallback: silent grab via getUserMedia + canvas.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true; await video.play();
    await new Promise((r) => setTimeout(r, 450));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.7);
    stream.getTracks().forEach((t) => t.stop());
    return data;
  } catch (_) { return null; }
}

// --- Active-SOS location tracking -------------------------------------------
// Keeps posting the user's location while an SOS is active. Uses the native
// Geolocation watch on device (survives foreground; for full background/killed
// operation add a background-geolocation plugin) and navigator.geolocation on web.
let _sos = { id: null, timer: null, last: null, native: false };

export async function startSosTracking(postFn, { intervalMs = 8000 } = {}) {
  await stopSosTracking();
  const onPos = (p) => {
    if (!p?.coords) return;
    _sos.last = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy };
  };
  try {
    if (isNative) {
      _sos.native = true;
      _sos.id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000 }, (pos) => { if (pos) onPos(pos); });
    } else {
      _sos.native = false;
      _sos.id = navigator.geolocation.watchPosition(onPos, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    }
  } catch (_) { /* permission denied — tracking simply won't post */ }
  const send = async () => { if (_sos.last) { try { await postFn(_sos.last); } catch (_) {} } };
  _sos.timer = setInterval(send, intervalMs);
}

export async function stopSosTracking() {
  if (_sos.timer) { clearInterval(_sos.timer); _sos.timer = null; }
  if (_sos.id != null) {
    try {
      if (_sos.native) await Geolocation.clearWatch({ id: _sos.id });
      else navigator.geolocation.clearWatch(_sos.id);
    } catch (_) {}
    _sos.id = null;
  }
  _sos.last = null;
}

