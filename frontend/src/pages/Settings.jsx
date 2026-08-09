import { useState, useRef } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { UserCog, Save, Loader2, CheckCircle2, MessageSquare, Mail, Bell, ShieldAlert, Gauge, Megaphone, KeyRound, Camera, Trash2 } from "lucide-react";

const DEFAULT_PREFS = { whatsapp: true, email: true, push: true, incident_alerts: true, speed_alerts: true, marketing: false };

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
        background: on ? "linear-gradient(100deg,#7c3aed,#22d3ee)" : "rgba(255,255,255,.14)", position: "relative", transition: "background .2s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
    </button>
  );
}

export default function Settings() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatar, setAvatar] = useState(user?.avatar_base64 || "");
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(user?.notify_prefs || {}) });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

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

  return (
    <div className="page" data-testid="settings-page">
      <div className="container-nk" style={{ maxWidth: 640 }}>
        <span className="chip"><UserCog size={13} /> Account</span>
        <h1 style={{ fontSize: 34, marginTop: 12, marginBottom: 20 }}>Profile & <span className="neon">preferences</span></h1>

        <form onSubmit={save} className="glass card-pad" style={{ padding: 26, marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>Your details</h2>
          <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18 }}>
            <div data-testid="avatar-preview" style={{ width: 84, height: 84, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#22d3ee)", display: "grid", placeItems: "center", overflow: "hidden", fontFamily: "Chakra Petch", fontSize: 34, fontWeight: 700, flexShrink: 0, border: "2px solid rgba(255,255,255,.15)" }}>
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
            <div className="field"><label>Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required data-testid="settings-phone" placeholder="+91 …" /></div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}><label>Email</label><input className="input" value={user?.email || ""} disabled data-testid="settings-email" /></div>

          <h2 style={{ fontSize: 20, margin: "22px 0 10px" }}>Notification preferences</h2>
          <div className="grid" style={{ gap: 8 }}>
            {PREF_ROWS.map((row) => (
              <div key={row.key} className="glass" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }} data-testid={`pref-row-${row.key}`}>
                <span style={{ color: "#22d3ee" }}>{row.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{row.title}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{row.desc}</div>
                </div>
                <Toggle on={!!prefs[row.key]} onClick={() => togglePref(row.key)} testid={`pref-toggle-${row.key}`} />
              </div>
            ))}
          </div>

          {notice && <p style={{ color: "#22d3ee", fontWeight: 600, marginTop: 14 }} data-testid="settings-notice"><CheckCircle2 size={15} style={{ verticalAlign: "-2px" }} /> {notice}</p>}
          {err && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 14 }} data-testid="settings-error">{err}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 16 }} data-testid="save-settings">{busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />} {busy ? "Saving…" : "Save changes"}</button>
        </form>

        <form onSubmit={changePassword} className="glass card-pad" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}><KeyRound size={18} style={{ verticalAlign: "-3px" }} /> Change password</h2>
          <div className="grid grid-2">
            <div className="field"><label>Current password</label><input className="input" type="password" value={pwd.old_password} onChange={(e) => setPwd({ ...pwd, old_password: e.target.value })} required data-testid="settings-old-password" /></div>
            <div className="field"><label>New password</label><input className="input" type="password" value={pwd.new_password} onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })} required minLength={6} data-testid="settings-new-password" placeholder="min 6 chars" /></div>
          </div>
          {pwdMsg && <p style={{ color: "#22d3ee", fontWeight: 600, marginBottom: 10 }} data-testid="password-notice">{pwdMsg}</p>}
          {pwdErr && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="password-error">{pwdErr}</p>}
          <button className="btn btn-ghost btn-block" disabled={pwdBusy} data-testid="change-password-btn">{pwdBusy ? "Updating…" : "Update password"}</button>
        </form>
      </div>
    </div>
  );
}
