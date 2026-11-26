import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/context/AuthContext";
import { Siren, Users, QrCode, Bell, ShieldCheck, ArrowRight, ArrowLeft, Check } from "lucide-react";

// First-run product tour. Shown once per device, the first time a signed-in
// user opens the app. Fully skippable. We store a flag so it never nags again.
const KEY = "nk_onboarded";
const seen = () => { try { return localStorage.getItem(KEY) === "1"; } catch (_) { return true; } };
const markDone = () => { try { localStorage.setItem(KEY, "1"); } catch (_) {} };

const STEPS = [
  { icon: <ShieldCheck size={30} />, accent: "#e92546", title: "Welcome to Nek Sathi", body: "आपकी सुरक्षा, हमारी ज़िम्मेदारी. A quick 30-second tour of what you can do here." },
  { icon: <Siren size={30} />, accent: "#ff3b5c", title: "One-tap SOS", body: "Press SOS to sound a siren, auto-capture a photo, and share your live location with family instantly." },
  { icon: <Users size={30} />, accent: "#ff4d67", title: "Family, always in the loop", body: "Add your family circle and see each other live on the map, with check-in and arrival alerts." },
  { icon: <QrCode size={30} />, accent: "#e92546", title: "Smart QR & scan-to-alert", body: "Put a Nek Sathi QR on your vehicle, bag or child's tag. Anyone can scan it to reach you in an emergency." },
  { icon: <Bell size={30} />, accent: "#f5a524", title: "All your alerts in one place", body: "Tap the bell any time to see who scanned your QR, overspeed and theft alerts — newest first." },
];

export default function Onboarding() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    // Only in the installed app, for a signed-in user, once.
    let native = false;
    try { native = Capacitor.isNativePlatform(); } catch (_) {}
    if (native && user && !seen()) {
      const t = setTimeout(() => setShow(true), 600); // let the home paint first
      return () => clearTimeout(t);
    }
  }, [user]);

  if (!show) return null;
  if (typeof document === "undefined") return null;

  const last = i === STEPS.length - 1;
  const step = STEPS[i];
  const close = () => { markDone(); setShow(false); };

  const node = (
    <div data-testid="onboarding" style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div className="glass" style={{ width: "100%", maxWidth: 460, margin: 12, borderRadius: 22, padding: "24px 22px 20px", background: "var(--panel, #0f0f17)", border: "1px solid var(--panel-brd)", boxShadow: "0 28px 70px -14px rgba(0,0,0,.85)", animation: "modalPop .24s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {STEPS.map((_, k) => (
              <span key={k} style={{ width: k === i ? 22 : 7, height: 7, borderRadius: 999, background: k === i ? "var(--accent)" : "var(--panel-brd)", transition: "width .2s, background .2s" }} />
            ))}
          </div>
          {!last && (
            <button type="button" onClick={close} data-testid="onboarding-skip" style={{ background: "none", border: "none", color: "var(--muted)", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Skip</button>
          )}
        </div>

        <div style={{ textAlign: "center", padding: "6px 4px 2px" }}>
          <span style={{ width: 66, height: 66, borderRadius: 18, margin: "0 auto 16px", display: "grid", placeItems: "center", background: `${step.accent}22`, color: step.accent, border: `1px solid ${step.accent}55` }}>{step.icon}</span>
          <h2 style={{ fontSize: 22, margin: "0 0 8px", color: "var(--text)" }}>{step.title}</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: "0 auto", maxWidth: 360 }}>{step.body}</p>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {i > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setI((n) => n - 1)} data-testid="onboarding-back" style={{ flex: "0 0 auto" }}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => (last ? close() : setI((n) => n + 1))} data-testid={last ? "onboarding-done" : "onboarding-next"} style={{ flex: 1, justifyContent: "center" }}>
            {last ? <><Check size={16} /> Get started</> : <>Next <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
