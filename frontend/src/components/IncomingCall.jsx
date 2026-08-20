import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { RTC_CONFIG, makeRingtone } from "@/lib/rtc";
import { Phone, PhoneOff, Mic, MicOff, ShieldCheck, Car } from "lucide-react";

// Global owner-side listener for incoming in-app live voice calls. Mounted once
// for logged-in users; polls for ringing calls, shows an incoming-call modal
// with a ringtone, and runs the WebRTC answer flow on Accept.
export default function IncomingCall() {
  const [incoming, setIncoming] = useState(null); // {call_id, number_plate}
  const [active, setActive] = useState(null);      // {call_id, number_plate}
  const [status, setStatus] = useState("idle");    // idle | connecting | connected | ended
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const ring = useRef(makeRingtone());
  const busyId = useRef(null); // call currently being handled (ring/active) to avoid duplicates

  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const remoteRef = useRef(null);
  const pollRef = useRef(null);
  const remoteSet = useRef(false);
  const appliedCands = useRef(0);
  const endedRef = useRef(false);

  // Poll for ringing calls addressed to this owner.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (busyId.current) return; // already ringing/active — don't stack
      try {
        const items = (await api.get("/me/calls/incoming")).data.items || [];
        if (stop) return;
        const c = items.find((x) => x.has_offer) || items[0];
        if (c) {
          busyId.current = c.call_id;
          setIncoming({ call_id: c.call_id, number_plate: c.number_plate });
          ring.current.start();
        }
      } catch (_) {}
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const cleanup = () => {
    ring.current.stop();
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (pcRef.current) { try { pcRef.current.close(); } catch (_) {} pcRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    remoteSet.current = false; appliedCands.current = 0;
  };

  const reset = () => { cleanup(); busyId.current = null; setIncoming(null); setActive(null); setStatus("idle"); setSeconds(0); setMuted(false); endedRef.current = false; };

  const reject = async () => {
    ring.current.stop();
    const id = busyId.current;
    if (id) { try { await api.post(`/me/calls/${id}/reject`); } catch (_) {} }
    reset();
  };

  const hangup = async () => {
    if (endedRef.current) { reset(); return; }
    endedRef.current = true;
    const id = busyId.current;
    if (id) { try { await api.post(`/me/calls/${id}/end`); } catch (_) {} }
    setStatus("ended");
    setTimeout(reset, 900);
  };

  const accept = async () => {
    const id = busyId.current;
    if (!id) return;
    ring.current.stop();
    setIncoming(null);
    setActive({ call_id: id, number_plate: incoming?.number_plate });
    setStatus("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (e) => { if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]; };
      pc.onicecandidate = (e) => {
        if (e.candidate) api.post(`/me/calls/${id}/candidate`, { candidate: e.candidate.toJSON() }).catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setStatus("connected");
        if (pc.connectionState === "failed") hangup();
      };

      // fetch the caller's offer (it may arrive a moment after ringing started)
      let offer = null;
      for (let i = 0; i < 12 && !offer; i++) {
        const d = (await api.get(`/me/calls/${id}`)).data;
        if (["ended", "rejected", "missed"].includes(d.status)) { reset(); return; }
        offer = d.offer;
        if (!offer) await new Promise((r) => setTimeout(r, 600));
      }
      if (!offer) { hangup(); return; }
      await pc.setRemoteDescription(offer);
      remoteSet.current = true;
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await api.post(`/me/calls/${id}/accept`, { sdp: { type: answer.type, sdp: answer.sdp } });

      pollRef.current = setInterval(async () => {
        try {
          const d = (await api.get(`/me/calls/${id}`)).data;
          const cands = d.caller_candidates || [];
          for (let i = appliedCands.current; i < cands.length; i++) {
            try { await pc.addIceCandidate(cands[i]); } catch (_) {}
          }
          appliedCands.current = cands.length;
          if (["ended", "rejected", "missed"].includes(d.status)) { setStatus("ended"); setTimeout(reset, 900); }
        } catch (_) {}
      }, 1200);
    } catch (e) {
      // mic denied or error → end the call so the caller isn't left hanging
      try { await api.post(`/me/calls/${id}/end`); } catch (_) {}
      reset();
    }
  };

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

  if (!incoming && !active) return null;

  return (
    <div data-testid="incoming-call-overlay" style={{ position: "fixed", inset: 0, background: "rgba(4,6,14,.82)", backdropFilter: "blur(8px)", zIndex: 6000, display: "grid", placeItems: "center", padding: 20 }}>
      <audio ref={remoteRef} autoPlay data-testid="incoming-call-audio" />
      {incoming && !active ? (
        <div className="glass card-pad" data-testid="incoming-call-ringing" style={{ width: "min(420px, 94vw)", padding: 30, textAlign: "center", borderRadius: 22, border: "1px solid rgba(34,211,238,.45)" }}>
          <div style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 16px", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#7c3aed,#22d3ee)", animation: "sosPulse 1.3s ease-in-out infinite" }}>
            <Phone size={34} color="#fff" />
          </div>
          <p className="muted" style={{ fontSize: 12.5, letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>Incoming call</p>
          <h2 style={{ fontSize: 22, margin: "6px 0 4px" }}>Someone scanned your vehicle</h2>
          <p className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><Car size={14} /> {incoming.number_plate}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22 }}>
            <button className="btn btn-danger" onClick={reject} data-testid="incoming-call-reject"><PhoneOff size={18} /> Decline</button>
            <button className="btn btn-primary" onClick={accept} data-testid="incoming-call-accept"><Phone size={18} /> Answer</button>
          </div>
        </div>
      ) : (
        <div className="glass card-pad" data-testid="incoming-call-active" style={{ width: "min(420px, 94vw)", padding: 30, textAlign: "center", borderRadius: 22, border: "1px solid rgba(34,211,238,.4)" }}>
          <div style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 16px", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#0891b2,#22d3ee)" }}>
            {status === "connected" ? <ShieldCheck size={36} color="#fff" /> : <Phone size={34} color="#fff" />}
          </div>
          <h2 style={{ fontSize: 21, margin: "0 0 4px" }} data-testid="incoming-call-active-status">{status === "connected" ? "Connected" : status === "ended" ? "Call ended" : "Connecting…"}</h2>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{status === "connected" ? fmt(seconds) : `Caller about ${active?.number_plate || "your vehicle"}`}</p>
          {status !== "ended" && (
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22 }}>
              {status === "connected" && (
                <button className="btn btn-ghost" onClick={toggleMute} data-testid="incoming-call-mute">{muted ? <MicOff size={18} /> : <Mic size={18} />} {muted ? "Unmute" : "Mute"}</button>
              )}
              <button className="btn btn-danger" onClick={hangup} data-testid="incoming-call-hangup"><PhoneOff size={18} /> End call</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
