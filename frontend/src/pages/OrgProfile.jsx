import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Building2, LogOut, Camera, Trash2, Tag, Phone, MapPin, Mail, Loader2 } from "lucide-react";

function Row({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid rgba(179,18,47,.12)" }}>
      <span style={{ color: "#e92546" }}>{icon}</span>
      <div><div className="muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontSize: 15, fontWeight: 600 }}>{value || "—"}</div></div>
    </div>
  );
}

export default function OrgProfile() {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const [org, setOrg] = useState(null);
  const [avatar, setAvatar] = useState(user?.avatar_base64 || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { api.get("/org/me").then((r) => setOrg(r.data.org)).catch(() => {}); }, []);

  const saveAvatar = async (data) => {
    setSaving(true); setMsg("");
    try { const r = await api.put("/auth/me", { avatar_base64: data || "" }); setUser(r.data); setMsg(data ? "✓ Photo saved" : "✓ Photo removed"); }
    catch (_) { setMsg("Could not save photo"); } finally { setSaving(false); }
  };
  const pickAvatar = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const size = 320, canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        const data = canvas.toDataURL("image/jpeg", 0.82);
        setAvatar(data); saveAvatar(data);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  const removeAvatar = () => { setAvatar(""); saveAvatar(""); };
  const doLogout = () => { logout(); nav("/"); };
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : "";

  return (
    <div className="page" data-testid="org-profile-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="chip"><Building2 size={13} /> Organization portal</span>
          <button className="btn btn-ghost btn-sm" data-testid="org-logout" onClick={doLogout}><LogOut size={15} /> Logout</button>
        </div>
        <h1 style={{ fontSize: 30, marginTop: 14 }}>My <span className="neon">profile</span></h1>

        <div className="glass card-pad" style={{ padding: 24, marginTop: 14, textAlign: "center" }}>
          <div style={{ width: 110, height: 110, borderRadius: "50%", margin: "0 auto", background: "linear-gradient(135deg,#b3122f,#e92546)", display: "grid", placeItems: "center", overflow: "hidden", fontSize: 44, fontWeight: 700, color: "#fff", border: "2px solid rgba(255,255,255,.15)" }}>
            {avatar ? <img src={avatar} alt="dp" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (org?.name?.[0] || user?.name?.[0] || "?")}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickAvatar} style={{ display: "none" }} data-testid="dp-input" />
          <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={saving} data-testid="dp-upload"><Camera size={15} /> {avatar ? "Change photo" : "Add photo"}</button>
            {avatar && <button className="btn btn-ghost btn-sm" onClick={removeAvatar} disabled={saving} data-testid="dp-remove"><Trash2 size={14} color="#ff3b5c" /> Remove</button>}
          </div>
          {saving ? <p className="muted" style={{ fontSize: 12, marginTop: 8 }}><Loader2 size={13} className="spin" /> Saving…</p>
            : msg && <p style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith("✓") ? "#2fcf7a" : "#ff7591" }} data-testid="dp-msg">{msg}</p>}
        </div>

        <div className="glass card-pad" style={{ padding: "6px 22px 18px", marginTop: 14 }} data-testid="org-details">
          <h2 style={{ fontSize: 16, margin: "16px 0 2px" }}>Your details</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Set by the admin.</p>
          <Row icon={<Building2 size={17} />} label="Organization" value={org?.name} />
          <Row icon={<Tag size={17} />} label="Type" value={cap(org?.org_type)} />
          <Row icon={<Phone size={17} />} label="Phone" value={org?.phone} />
          <Row icon={<Mail size={17} />} label="Email" value={org?.account_email || user?.email} />
          <Row icon={<MapPin size={17} />} label="City" value={org?.city} />
        </div>

        <button className="btn btn-danger btn-block" style={{ marginTop: 16 }} onClick={doLogout} data-testid="org-profile-logout"><LogOut size={16} /> Logout</button>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite;display:inline-block}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
