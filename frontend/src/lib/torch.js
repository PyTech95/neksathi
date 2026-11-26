// Flashlight / torch control. In the installed app it drives the native
// CameraManager torch via the NekNative plugin (no camera permission needed).
// On the web it falls back to the experimental MediaStreamTrack `torch`
// constraint (works on some Android Chrome builds), kept best-effort.
import { Capacitor } from "@capacitor/core";
import NekNative from "@/lib/neknative";

const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch (_) { return false; } })();
let webTrack = null; // kept alive so the torch stays on until turned off

export function torchSupported() {
  if (isNative) return true;
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function setTorch(on) {
  if (isNative) {
    const r = await NekNative.setTorch({ on: !!on });
    return !!(r && r.on);
  }
  // ---- web best-effort ----
  if (on) {
    if (!webTrack) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
      webTrack = stream.getVideoTracks()[0];
    }
    try {
      await webTrack.applyConstraints({ advanced: [{ torch: true }] });
    } catch (e) {
      stopWebTrack();
      throw new Error("This browser can't control the flashlight. Please use the Nek Sathi app.");
    }
    return true;
  }
  stopWebTrack();
  return false;
}

function stopWebTrack() {
  if (webTrack) {
    try { webTrack.applyConstraints({ advanced: [{ torch: false }] }); } catch (_) {}
    try { webTrack.stop(); } catch (_) {}
    webTrack = null;
  }
}
