import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { RTC_CONFIG } from "@/lib/rtc";
import { Phone, PhoneOff, Mic, MicOff, Loader2, ShieldCheck, PhoneMissed, X } from "lucide-react";

// Anonymous scanner side of the in-app live voice call. Places a real WebRTC
// call to the vehicle owner — connects inside the app, no phone numbers shared.
export default function InAppCall({ qrId, onClose }) {
  const [status, setStatus] = useState("connecting"); // connecting | ringing | connected | ended | missed | rejected | error | denied
  const [muted, setMuted] = useState(false);
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const pc = new RTCPeerConnection(RTC_CONFIG);
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
          if (s === "failed") hangup("error");
        };

        const { call_id } = (await api.post(`/public/qr/${qrId}/call/start`)).data;
        callIdRef.current = call_id;
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        await api.post(`/public/call/${call_id}/offer`, { sdp: { type: offer.type, sdp: offer.sdp } });
        if (stopped) return;
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
      <div className="glass card-pad" data-testid="inapp-call-panel" style={{ width: "min(420px, 94vw)", padding: 30, textAlign: "center", borderRadius: 22, border: "1px solid rgba(34,211,238,.4)" }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 16px", display: "grid", placeItems: "center", background: status === "connected" ? "linear-gradient(135deg,#0891b2,#22d3ee)" : "linear-gradient(135deg,#7c3aed,#22d3ee)", animation: status === "ringing" ? "sosPulse 1.4s ease-in-out infinite" : "none" }}>
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
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22 }}>
            {status === "connected" && (
              <button className="btn btn-ghost" onClick={toggleMute} data-testid="inapp-call-mute">
                {muted ? <MicOff size={18} /> : <Mic size={18} />} {muted ? "Unmute" : "Mute"}
              </button>
            )}
            <button className="btn btn-danger" onClick={() => hangup("ended")} data-testid="inapp-call-hangup">
              <PhoneOff size={18} /> {status === "connected" ? "End call" : "Cancel"}
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            {status === "denied" && <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Allow microphone in your browser and try again.</p>}
            {status === "missed" && <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>We've alerted the owner about your call. They'll see it in the app.</p>}
            <button className="btn btn-primary" onClick={onClose} data-testid="inapp-call-close"><X size={16} /> Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
