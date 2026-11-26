import { useState } from "react";
import Copyright from "@/components/Copyright";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useT } from "@/lib/i18n";
import { LogIn, Smartphone, Compass } from "lucide-react";

export default function Login() {
  const { login, enterGuest } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const next = new URLSearchParams(loc.search).get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      nav(next || (u?.is_dealer ? "/dealer" : u?.is_org ? "/org" : "/dashboard"));
    } catch (e) {
      setErr(e?.response?.data?.detail || t("auth.loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" data-testid="login-page">
      <div className="container-nk" style={{ maxWidth: 440 }}>
        <div className="glass card-pad fade-up" style={{ padding: 32 }}>
          <h1 style={{ fontSize: 30, marginBottom: 6 }}>{t("auth.welcome1")} <span className="neon">{t("auth.welcome2")}</span></h1>
          <p className="muted" style={{ marginBottom: 22 }}>{t("auth.loginSub")}</p>
          <form onSubmit={submit}>
            <div className="field">
              <label>{t("auth.emailOrMobile")}</label>
              <input className="input" type="text" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" placeholder="you@example.com  or  9876543210" />
            </div>
            <div className="field">
              <label>{t("auth.password")}</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" placeholder="••••••••" />
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <Link to="/forgot-password" className="neon" style={{ fontSize: 13, fontWeight: 700 }} data-testid="login-forgot-password-link">{t("auth.forgot")}</Link>
              </div>
            </div>
            {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="login-error">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy} data-testid="login-submit">
              <LogIn size={17} /> {busy ? t("auth.signingIn") : t("auth.signIn")}
            </button>
          </form>
          <Link to="/otp-login" className="btn btn-ghost btn-block" style={{ marginTop: 12 }} data-testid="otp-login-link">
            <Smartphone size={16} /> {t("auth.otpLoginBtn")}
          </Link>
          <p className="muted center" style={{ marginTop: 18, fontSize: 14 }}>
            {t("auth.noAccount")} <Link to="/register" className="neon" style={{ fontWeight: 700 }}>{t("auth.createOne")}</Link>
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 4px" }}>
            <span style={{ flex: 1, height: 1, background: "var(--panel-brd)" }} />
            <span className="muted" style={{ fontSize: 12 }}>{t("common.or")}</span>
            <span style={{ flex: 1, height: 1, background: "var(--panel-brd)" }} />
          </div>
          <button type="button" className="btn btn-ghost btn-block" data-testid="explore-guest"
            onClick={() => { enterGuest(); nav("/explore"); }}>
            <Compass size={16} /> {t("auth.explore")}
          </button>
        </div>
        <Copyright />
      </div>
    </div>
  );
}
