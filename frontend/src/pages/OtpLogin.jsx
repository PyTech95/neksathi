import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Smartphone, ArrowRight, ShieldCheck } from "lucide-react";

export default function OtpLogin() {
  const { loginWithToken } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const next = new URLSearchParams(loc.search).get("next");
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const requestOtp = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await api.post("/auth/otp/request", { phone: phone.trim() });
      setDevCode(r.data.dev_code); // null when live SMS is configured
      setStep(2);
    } catch (e) { setErr(e?.response?.data?.detail || "Could not send code"); }
    finally { setBusy(false); }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await api.post("/auth/otp/verify", { phone: phone.trim(), code: code.trim(), name: name || null });
      loginWithToken(r.data.access_token, r.data.user);
      nav(next || "/dashboard");
    } catch (e) { setErr(e?.response?.data?.detail || "Invalid code"); }
    finally { setBusy(false); }
  };

  return (
    <div className="page" data-testid="otp-login-page">
      <div className="container-nk" style={{ maxWidth: 440 }}>
        <div className="glass card-pad fade-up" style={{ padding: 32 }}>
          <div className="center"><div className="brand-badge" style={{ width: 52, height: 52, borderRadius: 15, margin: "0 auto" }}><Smartphone size={24} /></div></div>
          <h1 className="center" style={{ fontSize: 28, marginTop: 14 }}>Login with <span className="neon">mobile OTP</span></h1>
          <p className="center muted" style={{ marginBottom: 20 }}>Fast sign-in for QR activation.</p>

          {step === 1 && (
            <form onSubmit={requestOtp}>
              <div className="field"><label>Mobile number</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required data-testid="otp-phone" placeholder="+91 98765 43210" /></div>
              {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="otp-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="otp-request-btn"><ArrowRight size={17} /> {busy ? "Sending…" : "Send OTP"}</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={verifyOtp}>
              {devCode && (
                <div className="glass" style={{ padding: 12, marginBottom: 14, borderColor: "rgba(34,211,238,.4)" }} data-testid="otp-dev-code">
                  <p className="muted" style={{ fontSize: 12 }}>Preview mode (no SMS keys yet) — your code:</p>
                  <p className="neon head" style={{ fontSize: 26, letterSpacing: 4 }}>{devCode}</p>
                </div>
              )}
              <div className="field"><label>Name (new users)</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="otp-name" placeholder="Your name" /></div>
              <div className="field"><label>Enter 6-digit code</label><input className="input" value={code} onChange={(e) => setCode(e.target.value)} required data-testid="otp-code" placeholder="••••••" inputMode="numeric" /></div>
              {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="otp-verify-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="otp-verify-btn"><ShieldCheck size={17} /> {busy ? "Verifying…" : "Verify & continue"}</button>
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => { setStep(1); setCode(""); setErr(""); }} data-testid="otp-change-number">Change number</button>
            </form>
          )}

          <p className="center muted" style={{ marginTop: 18, fontSize: 14 }}>Prefer email? <Link to="/login" className="neon" style={{ fontWeight: 700 }}>Password login</Link></p>
        </div>
      </div>
    </div>
  );
}
