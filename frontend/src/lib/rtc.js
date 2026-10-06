// Self-hosted WebRTC config. Public STUN + free public TURN (OpenRelay by
// Metered) so peer-to-peer voice connects even on strict/symmetric NAT and
// mobile carrier networks. No paid service / no API key required.
export const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

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
