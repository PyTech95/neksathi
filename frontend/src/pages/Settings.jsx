import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api, { API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { RINGTONES, makeRingtone } from "@/lib/rtc";
import BottomSheet from "@/components/BottomSheet";
import Modal from "@/components/Modal";
import { openCallSetup, isNativeApp } from "@/lib/callsetup";
import { UserCog, Save, Loader2, CheckCircle2, MessageSquare, Mail, Bell, ShieldAlert, Gauge, Megaphone, KeyRound, Camera, Trash2, HardDrive, Link2, Unlink, Phone, Play, Square, Upload, ChevronDown, Check, LogOut, Receipt, ChevronRight, Gift } from "lucide-react";

const DEFAULT_PREFS = { whatsapp: true, email: true, push: true, incident_alerts: true, speed_alerts: true, marketing: false, ringtone: "classic" };

const PREF_ROWS = [
  { key: "whatsapp", icon: <MessageSquare size={18} />, title: "WhatsApp alerts", desc: "Incident & account updates on WhatsApp." },
  { key: "push", icon: <Bell size={18} />, title: "Push notifications", desc: "Instant alerts inside the app." },
  { key: "email", icon: <Mail size={18} />, title: "Email updates", desc: "Receipts, summaries and important notices." },
  { key: "incident_alerts", icon: <ShieldAlert size={18} />, title: "Incident alerts", desc: "Wrong-parking, accident and theft reports." },
  { key: "speed_alerts", icon: <Gauge size={18} />, title: "Overspeed alerts", desc: "Alert me when a vehicle crosses its speed limit." },
  { key: "marketing", icon: <Megaphone size={18} />, title: "Offers & tips", desc: "Occasional product news and offers." },
];

function Toggle({ on, onClick, testid }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={on}
      style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", flexShrink: 0,
        background: on ? "linear-gradient(100deg,#b3122f,#e92546)" : "rgba(255,255,255,.14)", position: "relative", transition: "background .2s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
    </button>
  );
}

function GoogleDriveCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => { try { setStatus((await api.get("/google-drive/status")).data); } catch (_) {} };
  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search).get("drive");
    if (p === "connected") setMsg("Google Drive connected — evidence will back up automatically.");
    else if (p === "denied") setMsg("Connection cancelled.");
    else if (p === "norefresh") setMsg("Google didn't return a refresh token. Please remove Nek Sathi's access in your Google account and reconnect.");
    else if (p === "error") setMsg("Something went wrong connecting Drive. Please try again.");
    if (p) window.history.replaceState({}, "", "/settings");
  }, []);

  const connect = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.get("/google-drive/connect-ticket");
      window.location.assign(`${API}/google-drive/connect?ticket=${encodeURIComponent(r.data.ticket)}`);
    } catch (e) { setMsg(e?.response?.data?.detail || "Could not start Google connection."); setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Drive? Future evidence won't be backed up.")) return;
    setBusy(true);
    try { await api.delete("/google-drive/disconnect"); await load(); setMsg("Google Drive disconnected."); }
    finally { setBusy(false); }
  };

  if (!status) return null;
  const connected = status.connected;

  return (
    <div className="glass card-pad" style={{ padding: 26, marginBottom: 18 }} data-testid="gdrive-card">
      <h2 style={{ fontSize: 20, marginBottom: 6 }}><HardDrive size={18} style={{ verticalAlign: "-3px" }} /> Google Drive backup</h2>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>Connect your own Google Drive so SOS photos and audio evidence are safely backed up to a private "Nek Sathi" folder.</p>

      {!status.configured ? (
        <div className="glass" style={{ padding: "12px 14px", borderRadius: 10, fontSize: 13 }} data-testid="gdrive-unconfigured">Google Drive isn't set up on this server yet.</div>
      ) : connected ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#34d399", fontWeight: 700 }} data-testid="gdrive-connected"><CheckCircle2 size={18} /> Connected</span>
          <button className="btn btn-ghost btn-sm" onClick={disconnect} disabled={busy} data-testid="gdrive-disconnect-btn"><Unlink size={15} /> Disconnect</button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={connect} disabled={busy} data-testid="gdrive-connect-btn">{busy ? <Loader2 size={16} className="spin" /> : <><Link2 size={16} /> Connect Google Drive</>}</button>
      )}
      {status.status === "reauth_required" && <p style={{ color: "#f5a524", fontSize: 13, marginTop: 10 }} data-testid="gdrive-reauth">Access expired — please reconnect.</p>}
      {msg && <p style={{ color: "#e92546", fontSize: 13, marginTop: 10 }} data-testid="gdrive-msg">{msg}</p>}
    </div>
  );
}

// One ringtone row inside the picker — round preview button + name + tick.
function ToneRow({ name, active, playing, onPreview, onSelect, testid }) {
  return (
    <div data-testid={testid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 14,
      background: active ? "rgba(233,37,70,.16)" : "rgba(255,255,255,.04)",
      border: active ? "1px solid rgba(233,37,70,.6)" : "1px solid rgba(255,255,255,.08)" }}>
      <button type="button" onClick={onPreview} aria-label="Preview"
        style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, border: "none", cursor: "pointer",
          background: playing ? "linear-gradient(135deg,#b3122f,#e92546)" : "rgba(233,37,70,.18)",
          color: playing ? "#fff" : "#ff5a74", display: "grid", placeItems: "center" }}>
        {playing ? <Square size={15} /> : <Play size={15} />}
      </button>
      <button type="button" onClick={onSelect}
        style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </button>
      {active && <Check size={18} style={{ color: "#ff5a74", flexShrink: 0 }} />}
    </div>
  );
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatar, setAvatar] = useState(user?.avatar_base64 || "");
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(user?.notify_prefs || {}) });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  // ---- Mobile number verification (OTP) ----
  const [pvOpen, setPvOpen] = useState(false);
  const [pvStep, setPvStep] = useState(1);      // 1 = request, 2 = enter code
  const [pvCode, setPvCode] = useState("");
  const [pvDev, setPvDev] = useState(null);     // demo-mode code shown on screen
  const [pvChannel, setPvChannel] = useState(null);
  const [pvBusy, setPvBusy] = useState(false);
  const [pvErr, setPvErr] = useState("");
  const phoneIsVerified = !!user?.phone_verified && phone.trim() === (user?.phone || "").trim();

  // ---- Email verification (OTP) ----
  const [evOpen, setEvOpen] = useState(false);
  const [evCode, setEvCode] = useState("");
  const [evDev, setEvDev] = useState(null);       // demo-mode code shown on screen
  const [evSent, setEvSent] = useState(false);
  const [evBusy, setEvBusy] = useState(false);
  const [evErr, setEvErr] = useState("");
  const emailIsVerified = !!user?.email_verified && email.trim().toLowerCase() === (user?.email || "").toLowerCase();

  // ---- Incoming-call ringtone picker (bottom sheet + custom upload) ----
  const toneFileRef = useRef(null);
  const previewRef = useRef(null);
  const [tonePicker, setTonePicker] = useState(false);
  const [customTone, setCustomTone] = useState(() => { try { return localStorage.getItem("nk_custom_ringtone"); } catch (_) { return null; } });
  const [customToneName, setCustomToneName] = useState(() => { try { return localStorage.getItem("nk_custom_ringtone_name") || "My ringtone"; } catch (_) { return "My ringtone"; } });
  const [toneErr, setToneErr] = useState("");
  const [playingId, setPlayingId] = useState(null);

  const stopPreview = () => { try { previewRef.current?.stop?.(); } catch (_) {} previewRef.current = null; setPlayingId(null); };
  const playPreview = (id) => {
    stopPreview();
    const r = makeRingtone(id);
    r.start();
    previewRef.current = r;
    setPlayingId(id);
    setTimeout(() => { if (previewRef.current === r) stopPreview(); }, id === "custom" ? 6000 : 2200);
  };
  const selectTone = (id) => {
    setPrefs((p) => ({ ...p, ringtone: id }));
    try { localStorage.setItem("nk_ringtone", id); } catch (_) {}
    stopPreview();
    setTonePicker(false);
  };
  const pickCustomTone = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setToneErr("");
    if (!file.type.startsWith("audio/")) { setToneErr("Please choose an audio file (mp3, m4a, wav…)."); return; }
    if (file.size > 4 * 1024 * 1024) { setToneErr("File too large — keep it under ~4 MB (about a 30-second tone)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const a = new Audio();
      a.onloadedmetadata = () => {
        const dur = a.duration;
        // Allow a little slack (true 30s files often report 30.x), and don't
        // reject when the browser can't read the duration (Infinity/NaN — common
        // with some MP3s) — just accept it.
        if (isFinite(dur) && dur > 35) { setToneErr("Ringtone must be 30 seconds or shorter."); return; }
        try {
          localStorage.setItem("nk_custom_ringtone", dataUrl);
          localStorage.setItem("nk_custom_ringtone_name", file.name);
        } catch (_) { setToneErr("Couldn't save — storage is full. Try a smaller file."); return; }
        setCustomTone(dataUrl);
        setCustomToneName(file.name);
        setPrefs((p) => ({ ...p, ringtone: "custom" }));
        try { localStorage.setItem("nk_ringtone", "custom"); } catch (_) {}
      };
      a.onerror = () => setToneErr("Couldn't read that audio file. Try another.");
      a.src = dataUrl;
    };
    reader.onerror = () => setToneErr("Couldn't read that file.");
    reader.readAsDataURL(file);
  };
  useEffect(() => () => stopPreview(), []);

  const [pwd, setPwd] = useState({ old_password: "", new_password: "" });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");

  const togglePref = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  const pickAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setAvatar(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setNotice(""); setErr("");
    try {
      const r = await api.put("/auth/me", { name: name.trim(), phone: phone.trim(), notify_prefs: prefs, avatar_base64: avatar || "" });
      setUser(r.data);
      setNotice("Profile updated.");
    } catch (e) { setErr(e?.response?.data?.detail || "Could not save your changes."); }
    finally { setBusy(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault(); setPwdBusy(true); setPwdMsg(""); setPwdErr("");
    try {
      await api.post("/auth/change-password", pwd);
      setPwd({ old_password: "", new_password: "" });
      setPwdMsg("Password changed.");
    } catch (e) { setPwdErr(e?.response?.data?.detail || "Could not change password."); }
    finally { setPwdBusy(false); }
  };

  // Open the verify sheet and immediately request an OTP to the typed number.
  const startPhoneVerify = async () => {
    if (!phone.trim()) { setErr("Enter your mobile number first."); return; }
    setPvErr(""); setPvCode(""); setPvDev(null); setPvChannel(null);
    setPvStep(1); setPvOpen(true); setPvBusy(true);
    try {
      const r = await api.post("/auth/phone/verify/request", { phone: phone.trim() });
      setPvDev(r.data.dev_code); setPvChannel(r.data.channel); setPvStep(2);
    } catch (e) {
      setPvErr(e?.response?.data?.detail || "Could not send code"); setPvStep(1);
    } finally { setPvBusy(false); }
  };

  const confirmPhoneVerify = async () => {
    setPvErr(""); setPvBusy(true);
    try {
      const r = await api.post("/auth/phone/verify/confirm", { phone: phone.trim(), code: pvCode.trim() });
      setUser(r.data);                 // badge flips to Verified
      setPvOpen(false); setPvCode("");
      setNotice("Mobile number verified.");
    } catch (e) {
      setPvErr(e?.response?.data?.detail || "Invalid or expired code");
    } finally { setPvBusy(false); }
  };

  // Open the email-verify popup and send an OTP to the typed email.
  const startEmailVerify = async () => {
    const em = email.trim();
    if (!em || !em.includes("@")) { setErr("Enter a valid email first."); return; }
    setEvErr(""); setEvCode(""); setEvDev(null); setEvSent(false);
    setEvOpen(true); setEvBusy(true);
    try {
      const r = await api.post("/auth/email/verify/request", { email: em });
      setEvDev(r.data.dev_code); setEvSent(!!r.data.email_sent);
    } catch (e) {
      setEvErr(e?.response?.data?.detail || "Could not send code");
    } finally { setEvBusy(false); }
  };

  const confirmEmailVerify = async () => {
    setEvErr(""); setEvBusy(true);
    try {
      const r = await api.post("/auth/email/verify/confirm", { email: email.trim(), code: evCode.trim() });
      setUser(r.data);                 // email updated + badge -> Verified
      setEvOpen(false); setEvCode("");
      setNotice("Email verified.");
    } catch (e) {
      setEvErr(e?.response?.data?.detail || "Invalid or expired code");
    } finally { setEvBusy(false); }
  };

  return (
    <div className="page" data-testid="settings-page">
      <div className="container-nk" style={{ maxWidth: 640 }}>
        <span className="chip"><UserCog size={13} /> Account</span>
        <h1 style={{ fontSize: 34, marginTop: 12, marginBottom: 20 }}>Profile & <span className="neon">preferences</span></h1>

        <button type="button" className="glass glass-hover" onClick={() => navigate("/transactions")} data-testid="go-transactions"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", color: "inherit", border: "1px solid var(--panel-brd)", padding: "14px 16px", borderRadius: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", border: "1px solid rgba(233,37,70,.4)", color: "#ff5a74" }}><Receipt size={18} /></span>
          <span style={{ flex: 1 }}><b>Transaction history</b><div className="muted" style={{ fontSize: 13 }}>Your payments & downloadable bills</div></span>
          <ChevronRight size={18} className="muted" />
        </button>

        <button type="button" className="glass glass-hover" onClick={() => navigate("/referral")} data-testid="go-referral"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", color: "inherit", border: "1px solid var(--panel-brd)", padding: "14px 16px", borderRadius: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", border: "1px solid rgba(233,37,70,.4)", color: "#ff5a74" }}><Gift size={18} /></span>
          <span style={{ flex: 1 }}><b>Refer &amp; earn</b><div className="muted" style={{ fontSize: 13 }}>Invite friends, earn tokens &amp; get discounts</div></span>
          <ChevronRight size={18} className="muted" />
        </button>

        <form onSubmit={save} className="glass card-pad" style={{ padding: 26, marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>Your details</h2>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18 }}>
            <div data-testid="avatar-preview" style={{ width: 84, height: 84, borderRadius: "50%", background: "linear-gradient(135deg,#b3122f,#e92546)", display: "grid", placeItems: "center", overflow: "hidden", fontFamily: "Chakra Petch", fontSize: 34, fontWeight: 700, flexShrink: 0, border: "2px solid rgba(255,255,255,.15)" }}>
              {avatar ? <img src={avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (name?.[0] || user?.name?.[0] || "?")}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} style={{ display: "none" }} data-testid="avatar-input" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} data-testid="upload-avatar-btn"><Camera size={15} /> {avatar ? "Change photo" : "Add photo"}</button>
              {avatar && <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setAvatar("")} data-testid="remove-avatar-btn"><Trash2 size={14} color="#ff3b5c" /> Remove</button>}
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Shown on your account and used on your Share-Tap cards.</p>
            </div>
          </div>
          <div className="grid grid-2">
            <div className="field"><label>Full name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} data-testid="settings-name" /></div>
            <div className="field">
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span>Phone</span>
                {phoneIsVerified ? (
                  <span data-testid="phone-verified-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#34d399" }}>
                    <CheckCircle2 size={14} /> Verified
                  </span>
                ) : (
                  <span data-testid="phone-unverified-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#f5a524" }}>
                    <ShieldAlert size={14} /> Not verified
                  </span>
                )}
              </label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required data-testid="settings-phone" placeholder="+91 …" />
              {!phoneIsVerified && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={startPhoneVerify} disabled={pvBusy} data-testid="phone-verify-btn" style={{ marginTop: 8 }}>
                  <ShieldAlert size={14} /> Verify this number
                </button>
              )}
            </div>
          </div>

          <Modal open={pvOpen} onClose={() => { setPvOpen(false); setPvErr(""); }} title="Verify your mobile number">
            <div style={{ display: "grid", gap: 12 }}>
              <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
                We’re sending a 6-digit code to <b style={{ color: "#fff" }}>{phone.trim()}</b>. Verifying it sets this as your account number so future mobile-OTP logins always find your data.
              </p>
              {pvDev ? (
                <div className="glass" style={{ padding: 12, borderColor: "rgba(233,37,70,.4)" }} data-testid="phone-verify-dev-code">
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>Preview mode (no live gateway) — your code:</p>
                  <p className="neon head" style={{ fontSize: 26, letterSpacing: 4, margin: "4px 0 0" }}>{pvDev}</p>
                </div>
              ) : pvStep === 2 ? (
                <div className="glass" style={{ padding: "10px 12px", fontSize: 13, borderColor: "rgba(52,211,153,.35)" }} data-testid="phone-verify-sent">
                  A 6-digit code was sent to your {pvChannel === "whatsapp" ? "WhatsApp" : "mobile"}.
                </div>
              ) : null}
              <div className="field" style={{ margin: 0 }}>
                <label>Enter 6-digit code</label>
                <input className="input" value={pvCode} onChange={(e) => setPvCode(e.target.value)} inputMode="numeric" placeholder="••••••" data-testid="phone-verify-code" />
              </div>
              {pvErr && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }} data-testid="phone-verify-error">{pvErr}</p>}
              <button type="button" className="btn btn-primary btn-block" onClick={confirmPhoneVerify} disabled={pvBusy || !pvCode.trim()} data-testid="phone-verify-confirm">
                {pvBusy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} {pvBusy ? "Verifying…" : "Verify number"}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={startPhoneVerify} disabled={pvBusy} data-testid="phone-verify-resend">Resend code</button>
            </div>
          </Modal>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>Email</span>
              {emailIsVerified ? (
                <span data-testid="email-verified-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#34d399" }}>
                  <CheckCircle2 size={14} /> Verified
                </span>
              ) : (
                <span data-testid="email-unverified-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#f5a524" }}>
                  <ShieldAlert size={14} /> Not verified
                </span>
              )}
            </label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="settings-email" placeholder="you@example.com" />
            {!emailIsVerified && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={startEmailVerify} disabled={evBusy} data-testid="email-verify-btn" style={{ marginTop: 8 }}>
                <ShieldAlert size={14} /> Verify this email
              </button>
            )}
          </div>

          <Modal open={evOpen} onClose={() => { setEvOpen(false); setEvErr(""); }} title="Verify your email">
            <div style={{ display: "grid", gap: 12 }}>
              <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
                We’re sending a 6-digit code to <b style={{ color: "#fff" }}>{email.trim()}</b>. Enter it to set and verify this email on your account.
              </p>
              {evDev ? (
                <div className="glass" style={{ padding: 12, borderColor: "rgba(233,37,70,.4)" }} data-testid="email-verify-dev-code">
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>Preview mode (email not set up yet) — your code:</p>
                  <p className="neon head" style={{ fontSize: 26, letterSpacing: 4, margin: "4px 0 0" }}>{evDev}</p>
                </div>
              ) : evSent ? (
                <div className="glass" style={{ padding: "10px 12px", fontSize: 13, borderColor: "rgba(52,211,153,.35)" }} data-testid="email-verify-sent">
                  A 6-digit code was emailed to you. Check inbox (and spam).
                </div>
              ) : null}
              <div className="field" style={{ margin: 0 }}>
                <label>Enter 6-digit code</label>
                <input className="input" value={evCode} onChange={(e) => setEvCode(e.target.value)} inputMode="numeric" placeholder="••••••" data-testid="email-verify-code" />
              </div>
              {evErr && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }} data-testid="email-verify-error">{evErr}</p>}
              <button type="button" className="btn btn-primary btn-block" onClick={confirmEmailVerify} disabled={evBusy || !evCode.trim()} data-testid="email-verify-confirm">
                {evBusy ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} {evBusy ? "Verifying…" : "Verify email"}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={startEmailVerify} disabled={evBusy} data-testid="email-verify-resend">Resend code</button>
            </div>
          </Modal>

          <h2 style={{ fontSize: 20, margin: "22px 0 10px" }}>Notification preferences</h2>
          <div className="grid" style={{ gap: 8 }}>
            {PREF_ROWS.map((row) => (
              <div key={row.key} className="glass" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }} data-testid={`pref-row-${row.key}`}>
                <span style={{ color: "#e92546" }}>{row.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{row.title}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{row.desc}</div>
                </div>
                <Toggle on={!!prefs[row.key]} onClick={() => togglePref(row.key)} testid={`pref-toggle-${row.key}`} />
              </div>
            ))}
          </div>

          <div className="glass" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", marginTop: 8 }} data-testid="ringtone-row">
            <span style={{ color: "#e92546", flexShrink: 0 }}><Phone size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Incoming call ringtone</div>
              <div className="muted" style={{ fontSize: 13 }}>Tone that plays when someone calls you from a scanned QR.</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" data-testid="ringtone-open" onClick={() => setTonePicker(true)}
              style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 150, overflow: "hidden" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {prefs.ringtone === "custom" ? customToneName : (RINGTONES.find((r) => r.id === (prefs.ringtone || "classic"))?.name || "Classic")}
              </span>
              <ChevronDown size={14} style={{ flexShrink: 0 }} />
            </button>
          </div>

          <BottomSheet open={tonePicker} onClose={() => { stopPreview(); setTonePicker(false); }} title="Incoming call ringtone">
            <div style={{ display: "grid", gap: 8 }}>
              {RINGTONES.map((r) => (
                <ToneRow key={r.id} testid={`tone-${r.id}`} name={r.name}
                  active={(prefs.ringtone || "classic") === r.id} playing={playingId === r.id}
                  onPreview={() => (playingId === r.id ? stopPreview() : playPreview(r.id))}
                  onSelect={() => selectTone(r.id)} />
              ))}
              {customTone && (
                <ToneRow testid="tone-custom" name={customToneName}
                  active={prefs.ringtone === "custom"} playing={playingId === "custom"}
                  onPreview={() => (playingId === "custom" ? stopPreview() : playPreview("custom"))}
                  onSelect={() => selectTone("custom")} />
              )}
              <button type="button" onClick={() => toneFileRef.current?.click()} data-testid="tone-upload"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, cursor: "pointer",
                  background: "rgba(255,255,255,.04)", border: "1px dashed rgba(233,37,70,.5)", color: "#fff", marginTop: 2 }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", color: "#ff5a74", flexShrink: 0 }}><Upload size={18} /></span>
                <span style={{ flex: 1, textAlign: "left" }}>
                  <span style={{ fontWeight: 600, display: "block" }}>Choose own ringtone</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>Upload from your device · max 30 seconds</span>
                </span>
              </button>
              <input ref={toneFileRef} type="file" accept="audio/*" onChange={pickCustomTone} style={{ display: "none" }} data-testid="tone-file" />
              {toneErr && <p style={{ color: "var(--danger)", fontSize: 13, margin: "4px 2px 0" }} data-testid="tone-error">{toneErr}</p>}
            </div>
          </BottomSheet>

          {isNativeApp() && (
            <div className="glass" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", marginTop: 8 }} data-testid="callsetup-row">
              <span style={{ color: "#e92546", flexShrink: 0 }}><Phone size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Lock-screen calls setup</div>
                <div className="muted" style={{ fontSize: 13 }}>Make calls ring full-screen even when locked (notifications · battery · autostart).</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" data-testid="open-callsetup" onClick={openCallSetup} style={{ flexShrink: 0 }}>Open</button>
            </div>
          )}

          {notice && <p style={{ color: "#e92546", fontWeight: 600, marginTop: 14 }} data-testid="settings-notice"><CheckCircle2 size={15} style={{ verticalAlign: "-2px" }} /> {notice}</p>}
          {err && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }} data-testid="settings-error">{err}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 16 }} data-testid="save-settings">{busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {busy ? "Saving…" : "Save changes"}</button>
        </form>

        <GoogleDriveCard />

        <form onSubmit={changePassword} className="glass card-pad" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}><KeyRound size={18} style={{ verticalAlign: "-3px" }} /> Change password</h2>
          <div className="grid grid-2">
            <div className="field"><label>Current password</label><input className="input" type="password" value={pwd.old_password} onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })} required data-testid="settings-old-password" /></div>
            <div className="field"><label>New password</label><input className="input" type="password" value={pwd.new_password} onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} required minLength={6} data-testid="settings-new-password" placeholder="min 6 chars" /></div>
          </div>
          {pwdMsg && <p style={{ color: "#e92546", fontWeight: 600, marginBottom: 10 }} data-testid="password-notice">{pwdMsg}</p>}
          {pwdErr && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="password-error">{pwdErr}</p>}
          <button className="btn btn-ghost btn-block" disabled={pwdBusy} data-testid="change-password-btn">{pwdBusy ? "Updating…" : "Update password"}</button>
        </form>

        <div className="glass card-pad" data-testid="account-card" style={{ padding: 26, borderColor: "rgba(255,59,92,.35)" }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}><LogOut size={18} style={{ verticalAlign: "-3px" }} /> Account</h2>
          <button className="btn btn-ghost btn-block" data-testid="settings-logout" onClick={() => { logout(); navigate("/login"); }} style={{ justifyContent: "center", color: "#ff7591" }}>
            <LogOut size={16} /> Logout
          </button>

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(255,59,92,.25)" }}>
            <h3 style={{ fontSize: 16, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}><Trash2 size={16} color="#ff3b5c" /> Delete account</h3>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.6 }}>
              You can request permanent deletion of your Nek Sathi account and the personal data linked to it
              (profile, vehicles, Smart QR, family safety info and preferences). Some data may be retained where
              required for legal, security or fraud-prevention reasons. Once processed, account access may no longer be available.
            </p>
            <button className="btn btn-danger btn-block" data-testid="settings-delete-account" onClick={() => navigate("/support")} style={{ justifyContent: "center" }}>
              <Trash2 size={15} /> Request account deletion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
