import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { KeyRound, Mail, ArrowRight, ShieldCheck, RotateCw, Lock, CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function ForgotPassword() {
  const nav = useNavigate();
  const { t } = useT();
  const [step, setStep] = useState(1);        // 1 email · 2 code · 3 new password · 4 done
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);        // code validity countdown (seconds)

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const sendCode = useCallback(async () => {
    const r = await api.post("/auth/forgot-password", { email: email.trim().toLowerCase() });
    setDevCode(r.data.dev_code);
    setLeft((r.data.expires_in_minutes || 5) * 60);
    return r;
  }, [email]);

  const requestCode = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await sendCode(); setStep(2); }
    catch (e) { setErr(e?.response?.data?.detail || t("auth.fp.sendErr")); }
    finally { setBusy(false); }
  };

  const resend = async () => {
    if (busy) return;
    setErr(""); setBusy(true); setCode("");
    try { await sendCode(); } catch (e) { setErr(e?.response?.data?.detail || t("auth.fp.sendErr")); }
    finally { setBusy(false); }
  };

  const verifyCode = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api.post("/auth/forgot-password/verify", { email: email.trim().toLowerCase(), code: code.trim() });
      setTicket(r.data.reset_ticket);
      setStep(3);
    } catch (e) { setErr(e?.response?.data?.detail || t("auth.fp.invalidCode")); }
    finally { setBusy(false); }
  };

  const resetPassword = async (e) => {
    e.preventDefault(); setErr("");
    if (pw1.length < 6) { setErr(t("auth.fp.pwShort")); return; }
    if (pw1 !== pw2) { setErr(t("auth.fp.pwMismatch")); return; }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token: ticket, new_password: pw1 });
      setStep(4);
    } catch (e) { setErr(e?.response?.data?.detail || t("auth.fp.resetErr")); }
    finally { setBusy(false); }
  };

  const mmss = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div className="page" data-testid="forgot-password-page">
      <div className="container-nk" style={{ maxWidth: 440 }}>
        <div className="glass card-pad fade-up" style={{ padding: 32 }}>
          <div className="center"><div className="brand-badge" style={{ width: 52, height: 52, borderRadius: 15, margin: "0 auto" }}><KeyRound size={24} /></div></div>
          <h1 className="center" style={{ fontSize: 28, marginTop: 14 }}>{t("auth.fp.title1")} <span className="neon">{t("auth.fp.title2")}</span></h1>

          {step === 1 && (
            <>
              <p className="center muted" style={{ marginBottom: 20 }}>{t("auth.fp.step1sub")}</p>
              <form onSubmit={requestCode}>
                <div className="field"><label>{t("auth.fp.email")}</label>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="forgot-email" placeholder="you@example.com" />
                </div>
                {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="forgot-error">{err}</p>}
                <button className="btn btn-primary btn-block" disabled={busy} data-testid="forgot-send-btn"><Mail size={16} /> {busy ? t("auth.fp.sending") : t("auth.fp.sendCode")}</button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <p className="center muted" style={{ marginBottom: 16 }}>{t("auth.fp.step2a")} <b style={{ color: "#fff" }}>{email.trim()}</b>.</p>
              <form onSubmit={verifyCode}>
                {devCode ? (
                  <div className="glass" style={{ padding: 12, marginBottom: 14, borderColor: "rgba(233,37,70,.4)" }} data-testid="forgot-dev-code">
                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>{t("auth.fp.previewNote")}</p>
                    <p className="neon head" style={{ fontSize: 26, letterSpacing: 4, margin: "4px 0 0" }}>{devCode}</p>
                  </div>
                ) : (
                  <div className="glass" style={{ padding: "10px 12px", marginBottom: 14, fontSize: 13, borderColor: "rgba(52,211,153,.35)" }} data-testid="forgot-sent">
                    {t("auth.fp.emailedCode", { time: left > 0 ? mmss : t("auth.fp.aFewMin") })}
                  </div>
                )}
                <div className="field"><label>{t("auth.fp.codeLabel")}</label>
                  <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" placeholder="••••••" data-testid="forgot-code" />
                </div>
                {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="forgot-verify-error">{err}</p>}
                <button className="btn btn-primary btn-block" disabled={busy} data-testid="forgot-verify-btn"><ShieldCheck size={16} /> {busy ? t("auth.fp.checking") : t("auth.fp.verify")}</button>
                <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={resend} disabled={busy} data-testid="forgot-resend-btn">
                  <RotateCw size={15} /> {t("auth.fp.resend")}
                </button>
              </form>
            </>
          )}

          {step === 3 && (
            <>
              <p className="center muted" style={{ marginBottom: 18 }}>{t("auth.fp.step3sub")}</p>
              <form onSubmit={resetPassword}>
                <div className="field"><label>{t("auth.fp.newPw")}</label>
                  <input className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} required minLength={6} placeholder={t("auth.fp.newPwPh")} data-testid="forgot-new-password" />
                </div>
                <div className="field"><label>{t("auth.fp.confirmPw")}</label>
                  <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={6} placeholder={t("auth.fp.confirmPwPh")} data-testid="forgot-confirm-password" />
                </div>
                {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="forgot-reset-error">{err}</p>}
                <button className="btn btn-primary btn-block" disabled={busy} data-testid="forgot-reset-btn"><Lock size={16} /> {busy ? t("auth.fp.saving") : t("auth.fp.setNew")}</button>
              </form>
            </>
          )}

          {step === 4 && (
            <div className="center" style={{ padding: "10px 0" }} data-testid="forgot-done">
              <CheckCircle2 size={44} style={{ color: "#34d399" }} />
              <h2 style={{ fontSize: 22, margin: "12px 0 6px" }}>{t("auth.fp.updated")}</h2>
              <p className="muted" style={{ marginBottom: 18 }}>{t("auth.fp.updatedSub")}</p>
              <button className="btn btn-primary btn-block" onClick={() => nav("/login")} data-testid="forgot-go-login"><ArrowRight size={16} /> {t("auth.fp.backLogin")}</button>
            </div>
          )}

          {step !== 4 && (
            <p className="center muted" style={{ marginTop: 18, fontSize: 14 }}>
              {t("auth.fp.remembered")} <Link to="/login" className="neon" style={{ fontWeight: 700 }}>{t("auth.fp.backLogin")}</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
