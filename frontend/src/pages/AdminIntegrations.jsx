import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, HardDrive, Save, Loader2, CheckCircle2, Copy, AlertTriangle } from "lucide-react";

export default function AdminIntegrations() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ client_id: "", client_secret: "", redirect_uri: "", frontend_url: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");

  const load = async () => {
    const r = await api.get("/admin/integrations/google-drive");
    setCfg(r.data);
    setForm({ client_id: r.data.client_id || "", client_secret: "", redirect_uri: r.data.redirect_uri || r.data.default_redirect_uri || "", frontend_url: r.data.frontend_url || "" });
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const r = await api.put("/admin/integrations/google-drive", form);
      setMsg(r.data.configured ? "Saved — Google Drive is now configured. Users can connect from Settings." : "Saved.");
      await load();
    } catch (e) { setMsg(e?.response?.data?.detail || "Could not save."); }
    finally { setBusy(false); }
  };

  const copy = (val, key) => { navigator.clipboard.writeText(val); setCopied(key); setTimeout(() => setCopied(""), 1500); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (!cfg) return <div className="page" style={{ padding: 40 }}><div className="spinner" data-testid="integrations-loading" /></div>;

  const prodRedirect = "https://neksathi.in/api/google-drive/oauth/callback";

  return (
    <div className="page" data-testid="admin-integrations-page" style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 80px" }}>
      <Link to="/admin" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} data-testid="integrations-back"><ArrowLeft size={15} /> Admin</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <HardDrive size={24} className="neon" />
        <h1 style={{ margin: 0, fontSize: 24 }}>Google Drive Integration</h1>
        {cfg.configured
          ? <span style={{ marginLeft: 8, color: "#34d399", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }} data-testid="gdrive-configured-badge"><CheckCircle2 size={16} /> Configured</span>
          : <span style={{ marginLeft: 8, color: "#f5a524", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }} data-testid="gdrive-notconfigured-badge"><AlertTriangle size={16} /> Not configured</span>}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Paste your Google Cloud OAuth Web-client credentials. Each user then connects their own Drive from Settings.</p>

      <div className="glass card-pad" style={{ padding: 18, borderRadius: 14, marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>1. Register these redirect URIs in Google Cloud</h3>
        {[{ label: "Preview", val: cfg.default_redirect_uri, key: "prev" }, { label: "Production", val: prodRedirect, key: "prod" }].map((r) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="muted" style={{ fontSize: 12, width: 78 }}>{r.label}</span>
            <code style={{ flex: 1, fontSize: 12, background: "rgba(255,255,255,.05)", padding: "6px 8px", borderRadius: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.val}</code>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(r.val, r.key)} data-testid={`copy-${r.key}`}>{copied === r.key ? <CheckCircle2 size={14} /> : <Copy size={14} />}</button>
          </div>
        ))}
        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>Also enable the <b>Google Drive API</b> and add scope <code>drive.file</code> on the consent screen.</p>
      </div>

      <form onSubmit={save} className="glass card-pad" style={{ padding: 22, borderRadius: 14 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>2. Enter your OAuth credentials</h3>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Client ID</label>
          <input className="input" value={form.client_id} onChange={set("client_id")} placeholder="...apps.googleusercontent.com" data-testid="gdrive-client-id" />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Client Secret {cfg.has_secret && <span className="muted" style={{ fontSize: 11 }}>(saved — leave blank to keep)</span>}</label>
          <input className="input" type="password" value={form.client_secret} onChange={set("client_secret")} placeholder={cfg.has_secret ? "••••••••" : "GOCSPX-…"} data-testid="gdrive-client-secret" />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Redirect URI (active)</label>
          <input className="input" value={form.redirect_uri} onChange={set("redirect_uri")} data-testid="gdrive-redirect-uri" />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Frontend URL (where users return after connecting)</label>
          <input className="input" value={form.frontend_url} onChange={set("frontend_url")} placeholder="https://…" data-testid="gdrive-frontend-url" />
        </div>
        {msg && <p style={{ color: "#22d3ee", fontSize: 13, marginBottom: 10 }} data-testid="gdrive-save-msg">{msg}</p>}
        <button className="btn btn-primary btn-block" disabled={busy} type="submit" data-testid="gdrive-save-btn">{busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save credentials</button>
      </form>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
