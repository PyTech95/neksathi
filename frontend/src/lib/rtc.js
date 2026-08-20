// Self-hosted WebRTC config. Public STUN servers only (no paid TURN service),
// so peer-to-peer voice works on most networks; very strict/symmetric NATs may
// occasionally fail to connect — acceptable for this in-app call feature.
export const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

// A short, pleasant two-tone ringtone using WebAudio (no asset files).
export function makeRingtone() {
  let ctx = null;
  let timer = null;
  const beep = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    [880, 660].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const start = t + i * 0.25;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(start);
      o.stop(start + 0.24);
    });
  };
  return {
    start() {
      if (timer) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      ctx.resume();
      beep();
      timer = setInterval(beep, 1600);
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}
