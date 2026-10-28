import api from "@/lib/api";

// Self-hosted WebRTC config. Public STUN + free public TURN (OpenRelay by
// Metered) so peer-to-peer voice connects even on strict/symmetric NAT and
// mobile carrier networks. No paid service / no API key required.
// Your own TURN server makes in-app calls connect reliably on mobile data /
// strict carrier NAT (the free public TURN below is often unreachable). Set it
// in frontend/.env:
//   REACT_APP_TURN_URLS=turn:your.turn.host:3478,turns:your.turn.host:5349
//   REACT_APP_TURN_USERNAME=...   REACT_APP_TURN_CREDENTIAL=...
// (A free TURN API key from metered.ca also works.)
const _turn = [];
if (process.env.REACT_APP_TURN_URLS) {
  _turn.push({
    urls: process.env.REACT_APP_TURN_URLS.split(",").map((s) => s.trim()).filter(Boolean),
    username: process.env.REACT_APP_TURN_USERNAME || "",
    credential: process.env.REACT_APP_TURN_CREDENTIAL || "",
  });
}

export const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ..._turn,
    // Fallback public TURN (may be unreliable — configure your own above):
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

// Fetch fresh, short-lived TURN credentials from our own backend (self-hosted
// coturn) so WebRTC relays audio reliably on mobile data / strict NAT. Falls
// back to the static config above if the request fails.
export async function getIceConfig() {
  try {
    const { data } = await api.get("/turn-credentials");
    // Only trust the backend list when a real TURN relay is configured there.
    // When it isn't, the backend returns a STUN-only entry — using that would
    // silently drop every TURN fallback below and calls would fail on mobile
    // data / carrier NAT.
    if (data && data.configured && Array.isArray(data.iceServers) && data.iceServers.length) {
      return {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          ...data.iceServers,
        ],
      };
    }
  } catch (_) {}
  return RTC_CONFIG;
}

// Selectable incoming-call ringtones (WebAudio, no asset files).
export const RINGTONES = [
  { id: "classic", name: "Classic" },
  { id: "chime", name: "Chime" },
  { id: "urgent", name: "Urgent" },
  { id: "pulse", name: "Pulse" },
  { id: "arcade", name: "Arcade" },
];

const PATTERNS = {
  classic: [{ f: 880, t: 0, d: 0.22 }, { f: 660, t: 0.25, d: 0.22 }],
  chime: [{ f: 660, t: 0, d: 0.16 }, { f: 880, t: 0.18, d: 0.16 }, { f: 1175, t: 0.36, d: 0.24 }],
  urgent: [{ f: 1000, t: 0, d: 0.12 }, { f: 1000, t: 0.16, d: 0.12 }, { f: 1000, t: 0.32, d: 0.12 }],
  pulse: [{ f: 440, t: 0, d: 0.2 }, { f: 990, t: 0.24, d: 0.3 }],
  arcade: [{ f: 523, t: 0, d: 0.1 }, { f: 784, t: 0.12, d: 0.1 }, { f: 1046, t: 0.24, d: 0.14 }, { f: 784, t: 0.4, d: 0.1 }],
};
const CYCLE = { classic: 1600, chime: 1900, urgent: 1100, pulse: 1700, arcade: 1600 };

export function makeRingtone(toneId = "classic") {
  // User-uploaded custom ringtone (stored as a data URL in localStorage).
  if (toneId === "custom") {
    let src = null;
    try { src = localStorage.getItem("nk_custom_ringtone"); } catch (_) {}
    if (!src) return makeRingtone("classic"); // fall back if none saved
    let audio = null;
    return {
      start() {
        if (audio) return;
        try {
          audio = new Audio(src);
          audio.loop = true;
          audio.volume = 1;
          audio.play().catch(() => {});
        } catch (_) {}
      },
      stop() {
        if (audio) { try { audio.pause(); audio.currentTime = 0; } catch (_) {} audio = null; }
      },
    };
  }
  const pat = PATTERNS[toneId] || PATTERNS.classic;
  const cycle = CYCLE[toneId] || 1600;
  let ctx = null;
  let timer = null;
  const play = () => {
    if (!ctx) return;
    const base = ctx.currentTime;
    pat.forEach(({ f, t, d }) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const s = base + t;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.55, s + 0.02); // louder than before
      g.gain.exponentialRampToValueAtTime(0.0001, s + d);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(s);
      o.stop(s + d + 0.03);
    });
  };
  return {
    start() {
      if (timer) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      ctx.resume();
      play();
      timer = setInterval(play, cycle);
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}

// Mobile vibration (safe no-op on desktop / unsupported browsers).
export function vibrate(pattern = [500, 300, 500]) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
}
export function stopVibrate() {
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (_) {}
}

// Play a single ringtone cycle for previewing in Settings.
export function previewRingtone(toneId) {
  const r = makeRingtone(toneId);
  r.start();
  setTimeout(() => r.stop(), 1800);
  vibrate([200]);
  return r;
}
