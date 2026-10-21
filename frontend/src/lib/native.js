// Native-hardware bridge for the Capacitor app.
// On a real device it uses Capacitor Geolocation/Camera plugins; on the web it
// transparently falls back to the browser APIs, so the same code runs everywhere.
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Camera, CameraResultType, CameraSource, CameraDirection } from "@capacitor/camera";

export const isNative = Capacitor.isNativePlatform();

// Returns { latitude, longitude, accuracy } or throws.
export async function getPosition({ timeout = 8000, enableHighAccuracy = true } = {}) {
  if (isNative) {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      const req = await Geolocation.requestPermissions();
      if (req.location !== "granted") throw new Error("Location permission denied");
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy, timeout });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
  }
  const pos = await new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(res, rej, { timeout, enableHighAccuracy }));
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
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

