import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { CreditCard, Plus, ArrowLeft, X, Pencil, Ban, CheckCircle2, Star } from "lucide-react";

const rupee = (paise) => `₹${((paise || 0) / 100).toLocaleString()}`;
const empty = { code: "", name: "", description: "", price_rupees: "", currency: "INR", interval: "month", vehicle_limit: 1, features: "", active: true, popular: false };

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => setPlans((await api.get("/admin/plans")).data), []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(empty); setErr(""); setShow(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      code: p.code, name: p.name, description: p.description || "",
      price_rupees: String((p.price_cents || 0) / 100), currency: p.currency || "INR",
      interval: p.interval || "month", vehicle_limit: p.vehicle_limit || 1,
      features: (p.features || []).join("\n"), active: p.active, popular: !!p.popular,
    });
    setErr(""); setShow(true);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const payload = {
      code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null,
      price_cents: Math.round(Number(form.price_rupees || 0) * 100), currency: form.currency,
      interval: form.interval, vehicle_limit: Number(form.vehicle_limit) || 1,
      features: form.features.split("\n").map((f) => f.trim()).filter(Boolean), active: form.active, popular: form.popular,
    };
    try {
      if (editing) await api.put(`/admin/plans/${editing.id}`, payload);
      else await api.post("/admin/plans", payload);
      setShow(false); load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not save plan"); }
    finally { setBusy(false); }
  };

  const archive = async (p) => {
    if (!window.confirm(`Archive "${p.name}"? Existing subscriptions stay valid, but it won't be offered to new users.`)) return;
    await api.delete(`/admin/plans/${p.id}`); load();
  };
  const reactivate = async (p) => { await api.put(`/admin/plans/${p.id}`, {
    code: p.code, name: p.name, description: p.description || null, price_cents: p.price_cents,
    currency: p.currency, interval: p.interval, vehicle_limit: p.vehicle_limit, features: p.features || [], active: true, popular: !!p.popular,
  }); load(); };

  return (
    <div className="page" data-testid="admin-plans-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 32 }}><CreditCard size={26} style={{ verticalAlign: "-4px" }} /> Subscription <span className="neon">plans</span></h1><p className="muted">Create & edit the plans shown on the Plans page — no code needed.</p></div>
          <button className="btn btn-primary" onClick={openCreate} data-testid="add-plan-btn"><Plus size={18} /> New plan</button>
        </div>

        <div className="grid grid-3">
          {plans.length === 0 && <p className="muted">No plans yet. Create your first one.</p>}
          {plans.map((p) => (
            <div key={p.id} className="glass card-pad" data-testid={`plan-card-${p.code}`} style={{ opacity: p.active ? 1 : 0.55, borderColor: p.popular ? "rgba(34,211,238,.5)" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="chip">{p.code}</span>
                {p.active ? <span style={{ color: "#22d3ee", fontSize: 12, fontWeight: 700 }}>Active</span> : <span style={{ color: "#f5a524", fontSize: 12, fontWeight: 700 }}>Archived</span>}
              </div>
              {p.popular && <span className="chip" style={{ marginTop: 10, color: "#22d3ee" }} data-testid={`plan-popular-${p.code}`}><Star size={12} /> Most popular</span>}
              <h3 style={{ fontSize: 20, margin: "12px 0 4px" }}>{p.name}</h3>
              <div className="stat-num neon" style={{ fontSize: 28 }}>{rupee(p.price_cents)}<span className="muted" style={{ fontSize: 14 }}> / {p.interval}</span></div>
              {p.description && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{p.description}</p>}
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Up to {p.vehicle_limit} vehicle{p.vehicle_limit > 1 ? "s" : ""}</p>
              <ul className="muted" style={{ fontSize: 13, margin: "10px 0 14px", paddingLeft: 18 }}>
                {(p.features || []).map((f, i) => <li key={i}>{f}</li>)}
              </ul>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} data-testid={`edit-plan-${p.code}`}><Pencil size={14} /> Edit</button>
                {p.active
                  ? <button className="btn btn-ghost btn-sm" onClick={() => archive(p)} data-testid={`archive-plan-${p.code}`}><Ban size={14} color="#ff3b5c" /> Archive</button>
                  : <button className="btn btn-ghost btn-sm" onClick={() => reactivate(p)} data-testid={`reactivate-plan-${p.code}`}><CheckCircle2 size={14} color="#22d3ee" /> Reactivate</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {show && (
        <div style={overlay} onClick={() => setShow(false)} data-testid="plan-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 520, padding: 26, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 22 }}>{editing ? "Edit plan" : "New plan"}</h2>
              <button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setShow(false)}><X size={16} /></button>
            </div>
            <form onSubmit={save}>
              <div className="grid grid-2">
                <div className="field"><label>Plan code</label><input className="input" value={form.code} onChange={set("code")} required minLength={2} maxLength={30} disabled={!!editing} data-testid="plan-code" placeholder="e.g. family_pro" /></div>
                <div className="field"><label>Display name</label><input className="input" value={form.name} onChange={set("name")} required data-testid="plan-name" placeholder="Family Pro" /></div>
              </div>
              <div className="field"><label>Description (optional)</label><input className="input" value={form.description} onChange={set("description")} data-testid="plan-description" placeholder="Short tagline" /></div>
              <div className="grid grid-2">
                <div className="field"><label>Price (₹)</label><input className="input" type="number" min="0" step="1" value={form.price_rupees} onChange={set("price_rupees")} required data-testid="plan-price" placeholder="499" /></div>
                <div className="field"><label>Billing interval</label>
                  <select className="input" value={form.interval} onChange={set("interval")} data-testid="plan-interval">
                    <option value="month">Monthly</option><option value="year">Yearly</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-2">
                <div className="field"><label>Vehicle limit</label><input className="input" type="number" min="1" max="999" value={form.vehicle_limit} onChange={set("vehicle_limit")} required data-testid="plan-vehicle-limit" /></div>
                <div className="field"><label>Currency</label><input className="input" value={form.currency} onChange={set("currency")} data-testid="plan-currency" /></div>
              </div>
              <div className="field"><label>Features (one per line)</label><textarea className="input" rows={4} value={form.features} onChange={set("features")} data-testid="plan-features" placeholder={"Live tracking\nFamily circle\nPriority support"} /></div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="plan-active" />
                <span className="muted" style={{ fontSize: 14 }}>Active (offered to users)</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={form.popular} onChange={(e) => setForm({ ...form, popular: e.target.checked })} data-testid="plan-popular-toggle" />
                <span className="muted" style={{ fontSize: 14 }}>Mark as "Most popular" (highlighted on the Plans page — only one plan can hold this)</span>
              </label>
              {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="plan-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-plan">{busy ? "Saving…" : editing ? "Save changes" : "Create plan"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
