import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, X, RefreshCw, Loader2, Check } from "lucide-react";

// Grab a single downscaled JPEG data-URL from a live MediaStream.
async function grabFrame(stream, maxW = 1024, quality = 0.72) {
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  try { await video.play(); } catch { /* autoplay */ }
  await new Promise((res) => {
    let tries = 0;
    const tick = () => {
      if ((video.videoWidth > 0 && video.readyState >= 2) || tries > 40) return res();
      tries += 1; setTimeout(tick, 80);
    };
    tick();
  });
  const vw = video.videoWidth || 720, vh = video.videoHeight || 960;
  const scale = Math.min(1, maxW / vw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vw * scale);
  canvas.height = Math.round(vh * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

const stop = (s) => { try { s && s.getTracks().forEach((t) => t.stop()); } catch { /* noop */ } };
const isLive = (s) => { try { return s && s.getVideoTracks().some((t) => t.readyState === "live"); } catch { return false; } };

// Interactive back-camera viewfinder to shoot the vehicle. A front-camera selfie
// is captured silently in the same step (simultaneous when the device allows it,
// otherwise sequentially right after). Returns { car, selfie } (selfie may be null).
export default function CameraCapture({ onDone, onCancel }) {
  const videoRef = useRef(null);
  const backRef = useRef(null);
  const frontRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setErr(""); setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) { setErr("Camera not available on this device."); return; }
    // 1) Back camera — visible viewfinder for the vehicle.
    try {
      backRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch {
      try { backRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      catch { setErr("Camera permission denied. You can still send the alert without a photo."); return; }
    }
    if (videoRef.current) { videoRef.current.srcObject = backRef.current; try { await videoRef.current.play(); } catch { /* noop */ } }
    setReady(true);
    // 2) Try to open the front camera at the SAME time (silent). Falls back later if unsupported.
    try {
      frontRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false });
      // If opening the front stream killed the back stream (single-camera phones), restore it.
      if (!isLive(backRef.current)) {
        stop(frontRef.current); frontRef.current = null;
        try {
          backRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          if (videoRef.current) { videoRef.current.srcObject = backRef.current; try { await videoRef.current.play(); } catch { /* noop */ } }
        } catch { /* noop */ }
      }
    } catch { frontRef.current = null; }
  }, []);

  useEffect(() => { start(); return () => { stop(backRef.current); stop(frontRef.current); }; }, [start]);

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    let car = null, selfie = null;
    try { car = await grabFrame(backRef.current); } catch { /* noop */ }
    // Selfie: simultaneous path if the front stream is already live...
    if (isLive(frontRef.current)) {
      try { selfie = await grabFrame(frontRef.current); } catch { /* noop */ }
    } else {
      // ...otherwise sequential: free the back camera, open the front, grab one frame.
      stop(backRef.current); backRef.current = null;
      try {
        const fs = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false });
        frontRef.current = fs;
        selfie = await grabFrame(fs);
      } catch { /* selfie best-effort */ }
    }
    stop(backRef.current); stop(frontRef.current);
    setBusy(false);
    onDone({ car, selfie });
  };

  return (
    <div className="cam-overlay" data-testid="camera-capture">
      <div className="cam-shell">
        <div className="cam-top">
          <span className="chip"><Camera size={13} /> Photo of the vehicle</span>
          <button className="cam-x" onClick={() => { stop(backRef.current); stop(frontRef.current); onCancel(); }} data-testid="camera-cancel"><X size={20} /></button>
        </div>
        {err ? (
          <div className="cam-err">
            <p className="muted" style={{ fontSize: 14 }}>{err}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={start} data-testid="camera-retry"><RefreshCw size={15} /> Retry</button>
              <button className="btn btn-primary btn-sm" onClick={() => onCancel()} data-testid="camera-skip">Skip photo</button>
            </div>
          </div>
        ) : (
          <>
            <div className="cam-stage">
              <video ref={videoRef} playsInline muted autoPlay className="cam-video" />
              {!ready && <div className="cam-loading"><Loader2 size={30} className="spin" /></div>}
            </div>
            <p className="muted center" style={{ fontSize: 13, margin: "12px 0 4px" }}>Point at the vehicle & number plate, then capture.</p>
            <button className="big-action" style={{ background: "linear-gradient(100deg,#22d3ee,#0ea5b7)" }} disabled={!ready || busy} onClick={capture} data-testid="camera-capture-btn">
              {busy ? <Loader2 size={24} className="spin" /> : <Check size={24} />} Capture photo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
