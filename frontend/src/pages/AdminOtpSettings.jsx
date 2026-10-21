import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Smartphone, ShieldCheck, Save, Loader2, CheckCircle2, AlertTriangle, KeyRound, ArrowLeft } from "lucide-react";

function StatusPill({ on, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700,
      padding: "4px 10px", borderRadius: 999,
      background: on ? "rgba(52,211,153,.15)" : "rgba(255,255,255,.07)",
      border: `1px solid ${on ? "rgba(52,211,153,.5)" : "rgba(255,255,255,.14)"}`,
      color: on ? "#34d399" : "#9aa0ab" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? "#34d399" : "#6b7280" }} />
      {label}: {on ? "LIVE" : "demo"}
    </span>
  );
}

export default function AdminOtpSettings() {
  const [cfg, setCfg] = useState(null);
  const [live, setLive] = useState(false);          // true = msg91 (real SMS), false = demo (on screen)
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [authkey, setAuthkey] = useState("");       // blank = keep saved key
  const [otpTemplate, setOtpTemplate] = useState("");
  const [smsSender, setSmsSender] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    const r = await api.get("/admin/telco-config");
    setCfg(r.data);
    // Show "Live" only when msg91 is chosen AND a key/live-status actually backs
    // it — a fresh install (no keys) honestly shows Demo.
    setLive(r.data.provider === "msg91" && (!!r.data.live?.otp || !!r.data.msg91_authkey));
    setSmsEnabled(!!r.data.sms_enabled);
    setOtpTemplate(r.data.msg91_otp_template_id || "");
    setSmsSender(r.data.msg91_sms_sender || "");
  };
  useEffect(() => { load().catch((e) => setErr(e?.response?.data?.detail || "Could not load settings")); }, []);

  const save = async () => {
    setBusy(true); setMsg(""); setErr("");
    try {
      const body = {
        provider: live ? "msg91" : "mock",
        sms_enabled: live ? smsEnabled : false,
        msg91_otp_template_id: otpTemplate.trim() || null,
        msg91_sms_sender: smsSender.trim() || null,
      };
      if (authkey.trim()) body.msg91_authkey = authkey.trim();   // only send when changed
      await api.put("/admin/telco-config", body);
      setAuthkey("");
      await load();
      setMsg(live ? "Saved — real OTP SMS is now active (if keys are valid)." : "Saved — demo mode: OTP shows on screen.");
    } catch (e) { setErr(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };

  if (!cfg) return <div className="page"><div className="container-nk"><div className="spinner" /></div></div>;
  const hasKey = !!cfg.msg91_authkey; // masked string when a key is saved

  return (
    <div className="page" data-testid="admin-otp-settings-page">
      <div className="container-nk" style={{ maxWidth: 640 }}>
        <Link to="/admin" className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }}><ArrowLeft size={15} /> Back to console</Link>
        <span className="chip"><Smartphone size={13} /> OTP / SMS gateway</span>
        <h1 style={{ fontSize: 32, marginTop: 12, marginBottom: 8 }}>Mobile OTP <span className="neon">mode</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Choose how login / verification OTPs are delivered. In <b>Demo</b> the code shows on screen (great for testing).
          Switch to <b>Live</b>, add your gateway key, and real OTPs go to the user’s mobile by SMS.
        </p>

        {/* live status snapshot */}
        <div className="glass card-pad" style={{ padding: 16, marginBottom: 18, display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="otp-live-status">
          <StatusPill on={cfg.live?.otp} label="SMS OTP" />
          <StatusPill on={cfg.live?.whatsapp_otp} label="WhatsApp OTP" />
          <StatusPill on={cfg.live?.sms} label="SMS" />
        </div>

        <div className="glass card-pad" style={{ padding: 24, marginBottom: 18 }}>
          {/* Demo <-> Live toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{live ? "Live mode" : "Demo mode"}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {live ? "Real OTP delivered to the mobile number via your SMS gateway." : "OTP is shown on screen — no SMS is sent."}
              </div>
            </div>
            <button type="button" onClick={() => setLive((v) => !v)} data-testid="otp-mode-toggle" aria-pressed={live}
              style={{ width: 58, height: 32, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0,
                background: live ? "linear-gradient(100deg,#b3122f,#e92546)" : "rgba(255,255,255,.14)", position: "relative", transition: "background .2s" }}>
              <span style={{ position: "absolute", top: 3, left: live ? 29 : 3, width: 26, height: 26, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </button>
          </div>

          {live && (
            <div style={{ marginTop: 18, borderTop: "1px solid var(--panel-brd)", paddingTop: 18 }} data-testid="otp-live-fields">
              <div className="field">
                <label><KeyRound size={14} style={{ verticalAlign: "-2px" }} /> MSG91 Auth Key</label>
                <input className="input" value={authkey} onChange={(e) => setAuthkey(e.target.value)} data-testid="otp-authkey"
                  placeholder={hasKey ? `${cfg.msg91_authkey} — leave blank to keep` : "Paste your MSG91 auth key"} />
                {hasKey && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>A key is already saved. Leave blank to keep it, or paste a new one to replace.</p>}
              </div>
              <div className="field">
                <label>OTP Template ID (DLT-approved)</label>
                <input className="input" value={otpTemplate} onChange={(e) => setOtpTemplate(e.target.value)} data-testid="otp-template" placeholder="MSG91 OTP template id" />
              </div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>Sender ID (optional, 6 chars)</label>
                <input className="input" value={smsSender} onChange={(e) => setSmsSender(e.target.value)} data-testid="otp-sender" placeholder="NEKSAT" maxLength={6} />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginTop: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} data-testid="otp-sms-enabled" />
                Also send transactional SMS alerts live (needs SMS flow id in server .env)
              </label>
              {!cfg.live?.otp && (
                <p style={{ color: "#f5a524", fontSize: 13, marginTop: 12, display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  Live is selected but OTP isn’t active yet — it needs both a valid Auth Key and OTP Template ID. Save after entering them.
                </p>
              )}
            </div>
          )}

          {msg && <p style={{ color: "#34d399", fontWeight: 600, marginTop: 14 }} data-testid="otp-save-notice"><CheckCircle2 size={15} style={{ verticalAlign: "-2px" }} /> {msg}</p>}
          {err && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }} data-testid="otp-save-error">{err}</p>}
          <button className="btn btn-primary btn-block" onClick={save} disabled={busy} style={{ marginTop: 16 }} data-testid="otp-save-btn">
            {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {busy ? "Saving…" : "Save OTP settings"}
          </button>
        </div>

        <div className="glass card-pad" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, margin: "0 0 8px", display: "flex", gap: 8, alignItems: "center" }}><ShieldCheck size={16} /> Prefer environment variables?</h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            You can instead set keys on the server (more secure, survives redeploys) — they take priority automatically:
          </p>
          <pre style={{ background: "#0A0A14", border: "1px solid var(--panel-brd)", borderRadius: 10, padding: 12, fontSize: 12.5, overflowX: "auto", marginTop: 10 }}>
MSG91_AUTHKEY=your_auth_key
MSG91_OTP_TEMPLATE_ID=your_otp_template_id
MSG91_SMS_SENDER=NEKSAT        # optional</pre>
          <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
            India note: OTP SMS is delivered through a DLT-registered gateway (MSG91 here) — not directly from Jio/Vi/Airtel. Register your sender ID &amp; OTP template once on the gateway.
          </p>
        </div>
      </div>
    </div>
  );
}
