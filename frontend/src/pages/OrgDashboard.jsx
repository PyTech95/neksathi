import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { TAG_META } from "@/pages/Tags";
import { Building2, QrCode, CheckCircle2, Clock, BellRing, MapPin, School, HeartPulse, Briefcase, ExternalLink, LogOut, PackageOpen, UserPlus, X, Loader2, Ban } from "lucide-react";

const ORG_ICON = { school: <School size={22} />, hospital: <HeartPulse size={22} />, office: <Briefcase size={22} />, other: <Building2 size={22} /> };

// Tag types an org can register, and the extra detail fields for each.
const ORG_TYPE_OPTS = [["kid", "School kid"], ["patient", "Patient / Elderly"], ["staff", "Office / Staff"], ["pet", "Pet"], ["phone", "Phone"], ["laptop", "Laptop"], ["bag", "Bag"], ["luggage", "Luggage"], ["other", "Other"]];
const EXTRA_FIELDS = {
  kid: [["roll_no", "Roll number"], ["class_name", "Class"], ["section", "Section"]],
  patient: [["ward", "Ward / Room"], ["condition", "Condition"]],
  staff: [["employee_id", "Employee ID"], ["department", "Department"]],
  pet: [["breed", "Breed"], ["pet_color", "Colour"]],
  phone: [["brand", "Brand"], ["model", "Model"], ["imei", "IMEI / Serial"]],
  laptop: [["brand", "Brand"], ["model", "Model"], ["serial", "Serial no"]],
  bag: [["label", "Label"]],
  luggage: [["label", "Label"]],
  other: [["label", "Label"]],
};
const DEFAULT_TYPE = { school: "kid", hospital: "patient", office: "staff", other: "other" };

function Stat({ icon, label, value, color, testid }) {
  return (
    <div className="glass card-pad" data-testid={testid} style={{ padding: 20 }}>
      <div style={{ color, marginBottom: 8 }}>{icon}</div>
      <div className="stat-num" style={{ fontSize: 30 }}>{value}</div>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}

const emptyReg = { serial_no: "", tag_type: "kid", name: "", guardian_name: "", guardian_phone: "", blood_group: "", extras: {} };

export default function OrgDashboard() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [tags, setTags] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [inv, setInv] = useState([]);
  const [tab, setTab] = useState("tags");
  const [deactivated, setDeactivated] = useState(false);
  const [reg, setReg] = useState(null);       // register modal state (null = closed)
  const [regMsg, setRegMsg] = useState("");
  const [regBusy, setRegBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, t, a, iv] = await Promise.all([
        api.get("/org/me"), api.get("/org/tags"), api.get("/org/alerts"), api.get("/org/inventory"),
      ]);
      setMe(m.data); setTags(t.data.results); setAlerts(a.data.results); setInv(iv.data.results || []);
    } catch (e) {
      if (e?.response?.status === 403 && /deactiv/i.test(e?.response?.data?.detail || "")) setDeactivated(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openRegister = (serial) => {
    const def = DEFAULT_TYPE[me?.org?.org_type] || "other";
    setReg({ ...emptyReg, serial_no: serial, tag_type: def, extras: {} });
    setRegMsg("");
  };
  const submitRegister = async (e) => {
    e.preventDefault(); setRegBusy(true); setRegMsg("");
    const metadata = {};
    (EXTRA_FIELDS[reg.tag_type] || []).forEach(([k]) => { if ((reg.extras[k] || "").trim()) metadata[k] = reg.extras[k].trim(); });
    try {
      await api.post("/org/tags/register", {
        serial_no: reg.serial_no, tag_type: reg.tag_type, name: reg.name.trim(),
        guardian_name: reg.guardian_name || undefined, guardian_phone: reg.guardian_phone || undefined,
        blood_group: reg.blood_group || undefined, metadata,
      });
      setReg(null); await load(); setTab("tags");
    } catch (err) { setRegMsg(err?.response?.data?.detail || "Could not register."); }
    finally { setRegBusy(false); }
  };

  if (deactivated) return (
    <div className="page" data-testid="org-deactivated"><div className="container-nk" style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" data-testid="org-logout" onClick={() => { logout(); nav("/"); }}><LogOut size={15} /> Logout</button>
      </div>
      <div className="glass card-pad" style={{ padding: 34, marginTop: 20, textAlign: "center", border: "1px solid rgba(255,59,92,.5)" }}>
        <Ban size={52} color="#ff3b5c" />
        <h2 style={{ fontSize: 24, marginTop: 14 }}>Your account has been deactivated</h2>
        <p className="muted" style={{ marginTop: 8 }}>You can log in, but you can't register or manage tags right now. Please contact the admin to reactivate your account.</p>
      </div>
    </div></div>
  );
  if (!me) return <div className="page"><div className="container-nk"><div className="spinner" /></div></div>;
  const { org, counts } = me;
  const isPerson = ["kid", "patient", "staff"].includes(reg?.tag_type);

  return (
    <div className="page" data-testid="org-dashboard">
      <div className="container-nk">
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 22 }}>
          <div className="brand-badge" style={{ width: 52, height: 52, borderRadius: 14 }}>{ORG_ICON[org.org_type] || ORG_ICON.other}</div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 30 }} data-testid="org-name">{org.name}</h1>
            <p className="muted" style={{ fontSize: 14 }}>{org.org_type?.[0]?.toUpperCase() + org.org_type?.slice(1)}{org.city ? ` · ${org.city}` : ""} · Organization portal</p>
          </div>
          <button className="btn btn-ghost btn-sm" data-testid="org-logout" onClick={() => { logout(); nav("/"); }}><LogOut size={15} /> Logout</button>
        </div>

        <div className="grid grid-3" style={{ marginBottom: 24 }}>
          <Stat testid="org-stat-issued" icon={<QrCode size={22} />} label="Tags issued" value={counts.issued} color="#e92546" />
          <Stat testid="org-stat-activated" icon={<CheckCircle2 size={22} />} label="Used" value={counts.activated} color="#10b981" />
          <Stat testid="org-stat-unclaimed" icon={<Clock size={22} />} label="Yet to hand out" value={counts.unclaimed} color="#f5a524" />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button className={`btn btn-sm ${tab === "tags" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("tags")} data-testid="org-tab-tags">Issued tags</button>
          <button className={`btn btn-sm ${tab === "inventory" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("inventory")} data-testid="org-tab-inventory"><PackageOpen size={14} /> To hand out ({inv.length})</button>
          <button className={`btn btn-sm ${tab === "alerts" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("alerts")} data-testid="org-tab-alerts"><BellRing size={14} /> Scan alerts</button>
        </div>

        {tab === "tags" && (
          <div className="glass card-pad" style={{ padding: 0, overflow: "hidden" }} data-testid="org-tags-table">
            {tags.length === 0 ? <p className="muted" style={{ padding: 22 }}>No tags registered yet. Register one from “To hand out”, or let people scan & register their handed-out tags.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ textAlign: "left", color: "#8891a7", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  <th style={th}>Name</th><th style={th}>Type</th><th style={th}>Guardian</th><th style={th}>Blood</th><th style={th}>Status</th>
                </tr></thead>
                <tbody>
                  {tags.map((t) => (
                    <tr key={t.id} data-testid={`org-tag-${t.id}`} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }}>
                      <td style={td}><b>{t.name}</b></td>
                      <td style={td}>{(TAG_META[t.tag_type] || {}).label || t.tag_type}</td>
                      <td style={td} className="muted">{t.guardian_name || "—"}</td>
                      <td style={td} className="muted">{t.blood_group || "—"}</td>
                      <td style={td}>{t.lost_mode ? <span style={{ color: "#ff3b5c" }}>LOST</span> : <span style={{ color: "#10b981" }}>Active</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "inventory" && (
          <div className="glass card-pad" style={{ padding: 0, overflow: "hidden" }} data-testid="org-inventory-table">
            {inv.length === 0 ? <p className="muted" style={{ padding: 22 }}>No QR codes waiting to be handed out. Ask the admin to generate a tag batch for this organization.</p> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ textAlign: "left", color: "#8891a7", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  <th style={th}>Serial</th><th style={th}>Status</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {inv.map((d) => (
                    <tr key={d.serial_no} data-testid={`org-inv-${d.serial_no}`} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }}>
                      <td style={td}><b>{d.serial_no}</b></td>
                      <td style={td} className="muted">{d.status === "sold" ? "Ready" : "Available"}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button className="btn btn-primary btn-sm" onClick={() => openRegister(d.serial_no)} data-testid={`org-register-${d.serial_no}`}><UserPlus size={14} /> Register</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "alerts" && (
          <div className="grid" style={{ gap: 10 }} data-testid="org-alerts-list">
            {alerts.length === 0 ? <p className="muted">No scan alerts yet.</p> : alerts.map((a) => (
              <div key={a.id} className="glass card-pad" style={{ padding: 16 }} data-testid={`org-alert-${a.id}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ color: (a.type || "").includes("kid_help") || (a.type || "").includes("sos") ? "#ff3b5c" : "#e92546" }}>{(a.type || "").replace("tag_", "").replace("_", " ").toUpperCase()}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.note && <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{a.note}</p>}
                {a.lat != null && a.lng != null && <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="nav-link" style={{ display: "inline-flex", gap: 4, marginTop: 6, fontSize: 13 }}><MapPin size={13} /> Live location <ExternalLink size={11} /></a>}
              </div>
            ))}
          </div>
        )}
      </div>

      {reg && (
        <div style={overlay} onClick={() => setReg(null)} data-testid="org-register-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 480, padding: 26, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ fontSize: 20 }}>Register tag</h2>
              <button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setReg(null)}><X size={16} /></button>
            </div>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Serial <b style={{ color: "#fff" }}>{reg.serial_no}</b>. Fill the details and submit — this QR becomes this person's/thing's tag.</p>
            <form onSubmit={submitRegister}>
              <div className="field"><label>Register as</label>
                <select className="input" value={reg.tag_type} onChange={(e) => setReg({ ...reg, tag_type: e.target.value, extras: {} })} data-testid="reg-type">
                  {ORG_TYPE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="field"><label>Name {isPerson ? "" : "/ Label"}</label><input className="input" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} required data-testid="reg-name" placeholder={isPerson ? "e.g. Aarav Sharma" : "e.g. Lab laptop 12"} /></div>
              {(EXTRA_FIELDS[reg.tag_type] || []).map(([k, lbl]) => (
                <div className="field" key={k}><label>{lbl}</label><input className="input" value={reg.extras[k] || ""} onChange={(e) => setReg({ ...reg, extras: { ...reg.extras, [k]: e.target.value } })} data-testid={`reg-x-${k}`} /></div>
              ))}
              <div className="grid grid-2">
                <div className="field"><label>Guardian / owner</label><input className="input" value={reg.guardian_name} onChange={(e) => setReg({ ...reg, guardian_name: e.target.value })} data-testid="reg-guardian" placeholder="optional" /></div>
                <div className="field"><label>Guardian phone</label><input className="input" value={reg.guardian_phone} onChange={(e) => setReg({ ...reg, guardian_phone: e.target.value })} data-testid="reg-guardian-phone" placeholder="optional" /></div>
              </div>
              {isPerson && <div className="field"><label>Blood group</label><input className="input" value={reg.blood_group} onChange={(e) => setReg({ ...reg, blood_group: e.target.value })} data-testid="reg-blood" placeholder="e.g. O+" /></div>}
              {regMsg && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="reg-msg">{regMsg}</p>}
              <button className="btn btn-primary btn-block" disabled={regBusy || !reg.name.trim()} data-testid="reg-submit">{regBusy ? <Loader2 size={16} className="spin" /> : <><CheckCircle2 size={16} /> Register this tag</>}</button>
            </form>
          </div>
        </div>
      )}
      <style>{`.spin{animation:spin 1s linear infinite;display:inline-block}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
const th = { padding: "12px 14px" };
const td = { padding: "12px 14px", fontSize: 14 };
const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
