import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { RTC_CONFIG, getIceConfig } from "@/lib/rtc";
import { Phone, PhoneOff, Mic, MicOff, Loader2, ShieldCheck, PhoneMissed, X, Volume2, VolumeX } from "lucide-react";

// WhatsApp-style round call-control button (Mute / Speaker / End).
function CallBtn({ onClick, on, danger, icon: Icon, label, testid }) {
  return (
    <button onClick={onClick} data-testid={testid} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
      <span style={{ width: 62, height: 62, borderRadius: "50%", display: "grid", placeItems: "center",
        background: danger ? "linear-gradient(135deg,#e11d48,#ff3b5c)" : on ? "#fff" : "rgba(255,255,255,.12)",
        color: danger ? "#fff" : on ? "#0a0a12" : "#fff",
        border: danger ? "none" : "1px solid rgba(255,255,255,.18)",
        boxShadow: danger ? "0 10px 26px -8px rgba(255,59,92,.7)" : "none", transition: "background .2s" }}>
        <Icon size={24} />
      </span>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</span>
    </button>
  );
}

// Anonymous scanner side of the in-app live voice call. Places a real WebRTC
// call to the vehicle owner — connects inside the app, no phone numbers shared.
export default function InAppCall({ qrId, onClose }) {
  const [status, setStatus] = useState("connecting"); // connecting | ringing | connected | ended | missed | rejected | error | denied
  // Human reason + raw detail (stage · error) so a failed call says exactly WHY.
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const stageRef = useRef("init"); // unsupported | mic | ice | start | offer | ringing | connect
  const explain = (e) => {
    const name = e?.name || ""; const msg = e?.message || ""; const code = e?.response?.status;
    const st = stageRef.current;
    setDetail(`${st} · ${name || "Error"}${code ? " " + code : ""}${msg ? " · " + String(msg).slice(0, 90) : ""}`);
    if (st === "unsupported") return "This browser can't make calls. Open this link in Chrome, and make sure the address starts with https://";
    if (st === "mic") {
      if (name === "NotAllowedError") return "Microphone blocked. Allow it in your browser settings and try again.";
      if (name === "NotFoundError") return "No microphone found on this device.";
      if (name === "NotReadableError") return "Microphone is busy in another app. Close it and retry.";
      return "This browser can't use the microphone here. Open this link in Chrome (not inside the QR-scanner / WhatsApp browser).";
    }
    if (code === 429) return "Too many attempts — wait a minute and try again.";
    if (st === "start" || st === "offer") return code ? `Server refused the call (HTTP ${code}).` : "Couldn't reach the server. Check your internet and try again.";
    if (st === "connect") return "Your network blocked the voice connection (relay). Try again, or try on WiFi.";
    return "Something went wrong starting the call.";
  };
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const callIdRef = useRef(null);
  const pollRef = useRef(null);
  const remoteRef = useRef(null);
  const remoteSet = useRef(false);
  const pendingCands = useRef([]);
  const appliedCands = useRef(0);
  const endedRef = useRef(false);

  const cleanup = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch (_) {} pcRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    try { localStorage.removeItem("nk_outgoing_call_id"); } catch (_) {}
  };

  const hangup = async (next = "ended") => {
    if (endedRef.current) { onClose?.(); return; }
    endedRef.current = true;
    if (callIdRef.current) { try { await api.post(`/public/call/${callIdRef.current}/end`); } catch (_) {} }
    cleanup();
    setStatus(next);
  };

  const applyRemoteCandidates = async (cands) => {
    if (!remoteSet.current) { pendingCands.current = cands; return; }
    for (let i = appliedCands.current; i < cands.length; i++) {
      try { await pcRef.current.addIceCandidate(cands[i]); } catch (_) {}
    }
    appliedCands.current = cands.length;
  };

  useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        // Calling needs a secure page (https) and a real browser. Inside some
        // QR-scanner / chat in-app browsers, or on http://, getUserMedia is absent.
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          stageRef.current = "unsupported";
          throw new Error(typeof window !== "undefined" && window.isSecureContext === false ? "not a secure context (page is not https)" : "getUserMedia unavailable in this browser");
        }
        stageRef.current = "mic";
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        stageRef.current = "ice";
        const pc = new RTCPeerConnection(await getIceConfig());
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = (e) => { if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]; };
        pc.onicecandidate = (e) => {
          if (e.candidate && callIdRef.current) {
            api.post(`/public/call/${callIdRef.current}/candidate`, { candidate: e.candidate.toJSON() }).catch(() => {});
          }
        };
        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          if (s === "connected") setStatus("connected");
          if (s === "failed") { stageRef.current = "connect"; setReason(explain({ name: "ICE failed", message: "peer connection failed" })); hangup("error"); }
        };

        stageRef.current = "start";
        const { call_id } = (await api.post(`/public/qr/${qrId}/call/start`)).data;
        callIdRef.current = call_id;
        // Remember OUR outgoing call so this same device's incoming-call poller
        // never treats it as a call to answer (e.g. owner testing with their own
        // account on two phones, or a family member scanning a family vehicle).
        try { localStorage.setItem("nk_outgoing_call_id", call_id); } catch (_) {}
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        stageRef.current = "offer";
        await api.post(`/public/call/${call_id}/offer`, { sdp: { type: offer.type, sdp: offer.sdp } });
        if (stopped) return;
        stageRef.current = "ringing";
        setStatus("ringing");

        pollRef.current = setInterval(async () => {
          try {
            const d = (await api.get(`/public/call/${call_id}`)).data;
            if (d.status === "accepted" && d.answer && !remoteSet.current) {
              await pc.setRemoteDescription(d.answer);
              remoteSet.current = true;
              await applyRemoteCandidates(d.callee_candidates || pendingCands.current || []);
            } else if (remoteSet.current) {
              await applyRemoteCandidates(d.callee_candidates || []);
            }
            if (["rejected", "missed", "ended"].includes(d.status)) {
              clearInterval(pollRef.current); pollRef.current = null;
              endedRef.current = true; cleanup(); setStatus(d.status);
            }
          } catch (_) {}
        }, 1200);
      } catch (e) {
        setReason(explain(e));
        setStatus(e?.name === "NotAllowedError" ? "denied" : "error");
      }
    })();
    return () => { stopped = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrId]);

  // call timer once connected
  useEffect(() => {
    if (status !== "connected") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const toggleMute = () => {
    const s = streamRef.current; if (!s) return;
    const on = !muted; setMuted(on);
    s.getAudioTracks().forEach((t) => { t.enabled = !on; });
  };

  // Speaker toggle. In the native WebView, call audio already plays on the
  // loudspeaker; this flips the state and nudges the audio element accordingly.
  const toggleSpeaker = () => {
    const on = !speakerOn; setSpeakerOn(on);
    const el = remoteRef.current;
    if (el) {
      try { el.volume = on ? 1.0 : 0.45; } catch (_) {}
      try { if (typeof el.setSinkId === "function") el.setSinkId("").catch(() => {}); } catch (_) {}
    }
  };

  const fmt = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const done = ["ended", "missed", "rejected", "error", "denied"].includes(status);

  const label = {
    connecting: "Starting secure call…",
    ringing: "Ringing the owner…",
    connected: "Connected",
    ended: "Call ended",
    missed: "Owner didn't answer",
    rejected: "Owner declined",
    error: "Couldn't connect the call",
    denied: "Microphone access is needed to call",
  }[status];

  return (
    <div data-testid="inapp-call-overlay" style={{ position: "fixed", inset: 0, background: "rgba(4,6,14,.82)", backdropFilter: "blur(8px)", zIndex: 6000, display: "grid", placeItems: "center", padding: 20 }}>
      <div className="glass card-pad" data-testid="inapp-call-panel" style={{ width: "min(420px, 94vw)", padding: 30, textAlign: "center", borderRadius: 22, border: "1px solid rgba(233,37,70,.4)" }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 16px", display: "grid", placeItems: "center", background: status === "connected" ? "linear-gradient(135deg,#b3122f,#e92546)" : "linear-gradient(135deg,#b3122f,#e92546)", animation: status === "ringing" ? "sosPulse 1.4s ease-in-out infinite" : "none" }}>
          {status === "missed" ? <PhoneMissed size={36} color="#fff" /> : status === "connected" ? <ShieldCheck size={36} color="#fff" /> : <Phone size={34} color="#fff" />}
        </div>
        <h2 style={{ fontSize: 21, margin: "0 0 4px" }} data-testid="inapp-call-status">{label}</h2>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {status === "connected" ? fmt(seconds) : "Private in-app call · owner's number stays hidden"}
        </p>

        <audio ref={remoteRef} autoPlay data-testid="inapp-call-audio" />

        {(status === "connecting" || status === "ringing") && (
          <div style={{ marginTop: 18 }}><Loader2 className="spin" size={22} /></div>
        )}

        {!done ? (
          <div style={{ display: "flex", gap: 22, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
            {status === "connected" && (
              <>
                <CallBtn onClick={toggleMute} on={muted} icon={muted ? MicOff : Mic} label={muted ? "Unmute" : "Mute"} testid="inapp-call-mute" />
                <CallBtn onClick={toggleSpeaker} on={!speakerOn} icon={speakerOn ? Volume2 : VolumeX} label="Speaker" testid="inapp-call-speaker" />
              </>
            )}
            <CallBtn onClick={() => hangup("ended")} danger icon={PhoneOff} label={status === "connected" ? "End" : "Cancel"} testid="inapp-call-hangup" />
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            {(status === "error" || status === "denied") && (
              <>
                <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }} data-testid="inapp-call-reason">{reason || "Allow microphone in your browser and try again."}</p>
                {detail && <p className="muted" style={{ fontSize: 10.5, opacity: 0.6, marginBottom: 12, wordBreak: "break-all" }} data-testid="inapp-call-detail">{detail}</p>}
              </>
            )}
            {status === "missed" && <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>We've alerted the owner about your call. They'll see it in the app.</p>}
            <button className="btn btn-primary" onClick={onClose} data-testid="inapp-call-close"><X size={16} /> Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
