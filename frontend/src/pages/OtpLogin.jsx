import { useState, useEffect, useCallback } from "react";
import Copyright from "@/components/Copyright";
import { Link, useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useT } from "@/lib/i18n";
import { Smartphone, ArrowRight, ShieldCheck, RotateCw, MessageCircle } from "lucide-react";

export default function OtpLogin() {
  const { loginWithToken } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const next = new URLSearchParams(loc.search).get("next");
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");   // exactly 10 digits; +91 is fixed in the UI
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(null);
  const [channel, setChannel] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const tmr = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(tmr);
  }, [resendIn]);

  // India only for now: +91 is fixed in the UI and the user types exactly 10
  // digits. We send +91XXXXXXXXXX to the backend.
  const full = "+91" + phone;
  const send = useCallback(async () => {
    const r = await api.post("/auth/otp/request", { phone: "+91" + phone });
    setDevCode(r.data.dev_code);
    setChannel(r.data.channel);
    setResendIn(30);
    return r;
  }, [phone]);

  const requestOtp = async (e) => {
    e.preventDefault();
    if (phone.length !== 10 || !"6789".includes(phone[0])) { setErr(t("auth.otp.invalidPhone")); return; }
    setErr(""); setBusy(true);
    try {
      await send();
      setStep(2);
    } catch (e) { setErr(e?.response?.data?.detail || t("auth.otp.sendErr")); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (resendIn > 0 || busy) return;
    setErr(""); setBusy(true);
    try { await send(); } catch (e) { setErr(e?.response?.data?.detail || t("auth.otp.resendErr")); }
    finally { setBusy(false); }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const r = await api.post("/auth/otp/verify", { phone: "+91" + phone, code: code.trim() });
      loginWithToken(r.data.access_token, r.data.user);
      // First-time user → Profile page to complete name / email (optional).
      if (r.data.is_new) nav("/settings?complete=1");
      else nav(next || "/dashboard");
    } catch (e) { setErr(e?.response?.data?.detail || t("auth.otp.invalidCode")); }
    finally { setBusy(false); }
  };

  return (
    <div className="page" data-testid="otp-login-page">
      <div className="container-nk" style={{ maxWidth: 440 }}>
        <div className="glass card-pad fade-up" style={{ padding: 32 }}>
          <div className="center"><div className="brand-badge" style={{ width: 52, height: 52, borderRadius: 15, margin: "0 auto" }}><Smartphone size={24} /></div></div>
          <h1 className="center" style={{ fontSize: 28, marginTop: 14 }}>{t("auth.otp.title1")} <span className="neon">{t("auth.otp.title2")}</span></h1>
          <p className="center muted" style={{ marginBottom: 20 }}>{t("auth.otp.sub")}</p>

          {step === 1 && (
            <form onSubmit={requestOtp}>
              <div className="field"><label>{t("auth.otp.mobile")}</label>
                <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "0 12px", background: "rgba(255,255,255,.06)", border: "1px solid var(--panel-brd)", borderRight: "none", borderRadius: "10px 0 0 10px", fontWeight: 700 }}>+91</span>
                  <input className="input" style={{ borderRadius: "0 10px 10px 0" }} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} required data-testid="otp-phone" placeholder="98765 43210" inputMode="numeric" maxLength={10} />
                </div>
              </div>
              {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="otp-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="otp-request-btn"><ArrowRight size={17} /> {busy ? t("auth.otp.sending") : t("auth.otp.send")}</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={verifyOtp}>
              {devCode ? (
                <div className="glass" style={{ padding: 12, marginBottom: 14, borderColor: "rgba(233,37,70,.4)" }} data-testid="otp-dev-code">
                  <p className="muted" style={{ fontSize: 12 }}>{t("auth.otp.previewNote")}</p>
                  <p className="neon head" style={{ fontSize: 26, letterSpacing: 4 }}>{devCode}</p>
                </div>
              ) : (
                <div className="glass" style={{ padding: "10px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, borderColor: "rgba(52,211,153,.35)" }} data-testid="otp-channel-note">
                  <MessageCircle size={16} style={{ color: "#25d366" }} />
                  <span style={{ fontSize: 13 }}>{channel === "whatsapp" ? t("auth.otp.sentWa") : t("auth.otp.sentSms")}<b style={{ color: "#fff" }}>{full}</b>.</span>
                </div>
              )}
              <div className="field"><label>{t("auth.otp.enterCode")}</label><input className="input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required data-testid="otp-code" placeholder="••••••" inputMode="numeric" maxLength={6} /></div>
              {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="otp-verify-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="otp-verify-btn"><ShieldCheck size={17} /> {busy ? t("auth.otp.verifying") : t("auth.otp.verify")}</button>
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={resend} disabled={resendIn > 0 || busy} data-testid="otp-resend-btn">
                <RotateCw size={15} /> {resendIn > 0 ? t("auth.otp.resendIn", { n: resendIn }) : t("auth.otp.resend")}
              </button>
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => { setStep(1); setCode(""); setErr(""); setResendIn(0); }} data-testid="otp-change-number">{t("auth.otp.changeNumber")}</button>
            </form>
          )}

          <p className="center muted" style={{ marginTop: 18, fontSize: 14 }}>{t("auth.otp.preferEmail")} <Link to="/login" className="neon" style={{ fontWeight: 700 }}>{t("auth.otp.passwordLogin")}</Link></p>
        </div>
        <Copyright />
      </div>
    </div>
  );
}
