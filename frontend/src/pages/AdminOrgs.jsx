import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Building2, Plus, ArrowLeft, X, KeyRound, School, HeartPulse, Briefcase, CheckCircle2, QrCode } from "lucide-react";

const ORG_ICON = { school: <School size={18} />, hospital: <HeartPulse size={18} />, office: <Briefcase size={18} />, other: <Building2 size={18} /> };
const emptyOrg = { name: "", org_type: "school", city: "", phone: "" };

export default function AdminOrgs() {
  const [orgs, setOrgs] = useState([]);
  const [showOrg, setShowOrg] = useState(false);
  const [orgForm, setOrgForm] = useState(emptyOrg);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [acct, setAcct] = useState(null); // org for which we're creating a login
  const [acctForm, setAcctForm] = useState({ email: "", password: "" });
  const [acctMsg, setAcctMsg] = useState("");

  const load = useCallback(async () => setOrgs((await api.get("/admin/orgs")).data.results), []);
  useEffect(() => { load(); }, [load]);

  const createOrg = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api.post("/admin/orgs", orgForm); setShowOrg(false); setOrgForm(emptyOrg); load(); }
    catch (e) { setErr(e?.response?.data?.detail || "Could not create"); } finally { setBusy(false); }
  };

  const createAccount = async (e) => {
    e.preventDefault(); setBusy(true); setAcctMsg("");
    try {
      await api.post(`/admin/orgs/${acct.id}/account`, acctForm);
      setAcctMsg(`Login created for ${acctForm.email}`);
      setAcctForm({ email: "", password: "" });
      load();
    } catch (e) { setAcctMsg(e?.response?.data?.detail || "Could not create login"); } finally { setBusy(false); }
  };

  return (
    <div className="page" data-testid="admin-orgs-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 32 }}><Building2 size={26} style={{ verticalAlign: "-4px" }} /> <span className="neon">Organizations</span></h1><p className="muted">Schools, hospitals & offices that hand out ID tags.</p></div>
          <button className="btn btn-primary" onClick={() => { setErr(""); setShowOrg(true); }} data-testid="add-org-btn"><Plus size={18} /> New organization</button>
        </div>

        <div className="grid grid-2">
          {orgs.length === 0 && <p className="muted">No organizations yet.</p>}
          {orgs.map((o) => (
            <div key={o.id} className="glass card-pad" data-testid={`org-card-${o.id}`} style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className="brand-badge" style={{ width: 40, height: 40, borderRadius: 12 }}>{ORG_ICON[o.org_type] || ORG_ICON.other}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 18 }}>{o.name}</h3>
                  <p className="muted" style={{ fontSize: 13 }}>{o.org_type}{o.city ? ` · ${o.city}` : ""}</p>
                </div>
                {o.has_login ? <span className="chip" style={{ color: "#10b981" }}><CheckCircle2 size={12} /> Has login</span> : <span className="chip" style={{ color: "#f5a524" }}>No login</span>}
              </div>
              <div className="grid grid-3" style={{ marginTop: 14, gap: 8, textAlign: "center" }}>
                <div><div className="stat-num" style={{ fontSize: 20 }}>{o.counts.issued}</div><div className="muted" style={{ fontSize: 11 }}>Issued</div></div>
                <div><div className="stat-num" style={{ fontSize: 20, color: "#10b981" }}>{o.counts.activated}</div><div className="muted" style={{ fontSize: 11 }}>Activated</div></div>
                <div><div className="stat-num" style={{ fontSize: 20, color: "#f5a524" }}>{o.counts.unclaimed}</div><div className="muted" style={{ fontSize: 11 }}>Pending</div></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setAcct(o); setAcctMsg(""); setAcctForm({ email: o.account_email || "", password: "" }); }} data-testid={`org-login-btn-${o.id}`}><KeyRound size={14} /> {o.has_login ? "Reset login" : "Create login"}</button>
                <Link to="/admin/qr" className="btn btn-ghost btn-sm" data-testid={`org-batch-btn-${o.id}`}><QrCode size={14} /> Generate tags</Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showOrg && (
        <div style={overlay} onClick={() => setShowOrg(false)} data-testid="org-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 460, padding: 26 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><h2 style={{ fontSize: 22 }}>New organization</h2><button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setShowOrg(false)}><X size={16} /></button></div>
            <form onSubmit={createOrg}>
              <div className="field"><label>Name</label><input className="input" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required data-testid="org-name-input" placeholder="Delhi Public School" /></div>
              <div className="grid grid-2">
                <div className="field"><label>Type</label>
                  <select className="input" value={orgForm.org_type} onChange={(e) => setOrgForm({ ...orgForm, org_type: e.target.value })} data-testid="org-type-input">
                    <option value="school">School</option><option value="hospital">Hospital</option><option value="office">Office</option><option value="other">Other</option>
                  </select>
                </div>
                <div className="field"><label>City</label><input className="input" value={orgForm.city} onChange={(e) => setOrgForm({ ...orgForm, city: e.target.value })} data-testid="org-city-input" /></div>
              </div>
              <div className="field"><label>Contact phone</label><input className="input" value={orgForm.phone} onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })} data-testid="org-phone-input" placeholder="+91 …" /></div>
              {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="org-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-org">{busy ? "Saving…" : "Create organization"}</button>
            </form>
          </div>
        </div>
      )}

      {acct && (
        <div style={overlay} onClick={() => setAcct(null)} data-testid="org-account-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 440, padding: 26 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><h2 style={{ fontSize: 22 }}>Login for {acct.name}</h2><button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setAcct(null)}><X size={16} /></button></div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>They sign in at the normal login with this email & password.</p>
            <form onSubmit={createAccount}>
              <div className="field"><label>Email</label><input className="input" type="email" value={acctForm.email} onChange={(e) => setAcctForm({ ...acctForm, email: e.target.value })} required data-testid="org-acct-email" /></div>
              <div className="field"><label>Password</label><input className="input" type="text" value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} required minLength={6} data-testid="org-acct-password" placeholder="min 6 chars" /></div>
              {acctMsg && <p style={{ color: acctMsg.startsWith("Login created") ? "#10b981" : "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="org-acct-msg">{acctMsg}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-org-account">{busy ? "Creating…" : "Create login"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
