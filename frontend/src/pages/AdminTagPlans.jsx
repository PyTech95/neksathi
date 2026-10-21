import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { TAG_META } from "@/pages/Tags";
import { Tags as TagsIcon, Plus, ArrowLeft, X, Pencil, Trash2, Star } from "lucide-react";

const rupee = (paise) => `₹${((paise || 0) / 100).toLocaleString("en-IN")}`;
const empty = { tag_type: "person", name: "", description: "", price_rupees: "", validity_days: 365, currency: "INR", features: "", active: true, popular: false };

export default function AdminTagPlans() {
  const [plans, setPlans] = useState([]);
  const [types, setTypes] = useState(Object.keys(TAG_META));
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await api.get("/admin/tag-plans");
    setPlans(r.data.items || []);
    if (r.data.tag_types?.length) setTypes(r.data.tag_types);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = (tag_type) => { setEditing(null); setForm({ ...empty, tag_type: tag_type || "person" }); setErr(""); setShow(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      tag_type: p.tag_type, name: p.name, description: p.description || "",
      price_rupees: String((p.price_cents || 0) / 100), currency: p.currency || "INR",
      validity_days: p.validity_days || 365, features: (p.features || []).join("\n"),
      active: p.active, popular: !!p.popular,
    });
    setErr(""); setShow(true);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const payload = {
      tag_type: form.tag_type, name: form.name.trim(), description: form.description.trim() || null,
      price_cents: Math.round(Number(form.price_rupees || 0) * 100), currency: form.currency,
      validity_days: Number(form.validity_days) || 365,
      features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
      active: form.active, popular: form.popular,
    };
    try {
      if (editing) await api.put(`/admin/tag-plans/${editing.id}`, payload);
      else await api.post("/admin/tag-plans", payload);
      setShow(false); load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not save tag plan"); }
    finally { setBusy(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? New customers won't be able to pick it.`)) return;
    await api.delete(`/admin/tag-plans/${p.id}`); load();
  };

  const byType = (tt) => plans.filter((p) => p.tag_type === tt);

  return (
    <div className="page" data-testid="admin-tag-plans-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 32 }}><TagsIcon size={26} style={{ verticalAlign: "-4px" }} /> Tag <span className="neon">plans</span></h1><p className="muted">Set a different price, validity & facilities for each tag type (Person, Pet, Bag, Phone…). Customers see the plans for their tag's type at checkout.</p></div>
          <button className="btn btn-primary" onClick={() => openCreate()} data-testid="add-tag-plan-btn"><Plus size={18} /> New tag plan</button>
        </div>

        {types.map((tt) => {
          const m = TAG_META[tt] || TAG_META.other;
          const list = byType(tt);
          return (
            <div key={tt} style={{ marginBottom: 26 }} data-testid={`tagplan-group-${tt}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div className="brand-badge" style={{ borderRadius: 10, width: 34, height: 34 }}>{m.icon}</div>
                <h2 style={{ fontSize: 19, margin: 0 }}>{m.label}</h2>
                <span className="muted" style={{ fontSize: 13 }}>· {list.length} plan{list.length === 1 ? "" : "s"}</span>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => openCreate(tt)} data-testid={`add-plan-${tt}`}><Plus size={13} /> Add</button>
              </div>
              {list.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, paddingLeft: 6 }}>No plan yet for {m.label.toLowerCase()} — customers can't order this tag type until you add one.</p>
              ) : (
                <div className="grid grid-3">
                  {list.map((p) => (
                    <div key={p.id} className="glass card-pad" data-testid={`tag-plan-card-${p.id}`} style={{ opacity: p.active ? 1 : 0.55, borderColor: p.popular ? "rgba(233,37,70,.5)" : undefined }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="chip">{m.label}</span>
                        {p.active ? <span style={{ color: "#e92546", fontSize: 12, fontWeight: 700 }}>Active</span> : <span style={{ color: "#f5a524", fontSize: 12, fontWeight: 700 }}>Hidden</span>}
                      </div>
                      {p.popular && <span className="chip" style={{ marginTop: 10, color: "#e92546" }}><Star size={12} /> Most popular</span>}
                      <h3 style={{ fontSize: 20, margin: "12px 0 4px" }}>{p.name}</h3>
                      <div className="stat-num neon" style={{ fontSize: 28 }}>{rupee(p.price_cents)}<span className="muted" style={{ fontSize: 14 }}> · {p.validity_days} days</span></div>
                      {p.description && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{p.description}</p>}
                      <ul className="muted" style={{ fontSize: 13, margin: "10px 0 14px", paddingLeft: 18 }}>
                        {(p.features || []).map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} data-testid={`edit-tag-plan-${p.id}`}><Pencil size={14} /> Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => remove(p)} data-testid={`delete-tag-plan-${p.id}`}><Trash2 size={14} color="#ff3b5c" /> Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {show && (
        <div style={overlay} onClick={() => setShow(false)} data-testid="tag-plan-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 520, padding: 26, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 22 }}>{editing ? "Edit tag plan" : "New tag plan"}</h2>
              <button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setShow(false)}><X size={16} /></button>
            </div>
            <form onSubmit={save}>
              <div className="grid grid-2">
                <div className="field"><label>Tag type</label>
                  <select className="input" value={form.tag_type} onChange={set("tag_type")} data-testid="tagplan-type">
                    {types.map((t) => <option key={t} value={t}>{(TAG_META[t] || TAG_META.other).label}</option>)}
                  </select>
                </div>
                <div className="field"><label>Display name</label><input className="input" value={form.name} onChange={set("name")} required data-testid="tagplan-name" placeholder="e.g. Pet Tag" /></div>
              </div>
              <div className="field"><label>Description (optional)</label><input className="input" value={form.description} onChange={set("description")} data-testid="tagplan-description" placeholder="Short tagline" /></div>
              <div className="grid grid-2">
                <div className="field"><label>Price (₹)</label><input className="input" type="number" min="0" step="1" value={form.price_rupees} onChange={set("price_rupees")} required data-testid="tagplan-price" placeholder="99" /></div>
                <div className="field"><label>Validity (days)</label><input className="input" type="number" min="1" max="3650" value={form.validity_days} onChange={set("validity_days")} required data-testid="tagplan-validity" placeholder="365" /><small className="muted" style={{ fontSize: 11 }}>e.g. 30 = 1 month, 365 = 1 year</small></div>
              </div>
              <div className="field"><label>Currency</label><input className="input" value={form.currency} onChange={set("currency")} data-testid="tagplan-currency" /></div>
              <div className="field"><label>Facilities / features (one per line)</label><textarea className="input" rows={4} value={form.features} onChange={set("features")} data-testid="tagplan-features" placeholder={"Masked emergency call\nLive location on scan\nReward note"} /></div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="tagplan-active" />
                <span className="muted" style={{ fontSize: 14 }}>Active (offered to customers)</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={form.popular} onChange={(e) => setForm({ ...form, popular: e.target.checked })} data-testid="tagplan-popular-toggle" />
                <span className="muted" style={{ fontSize: 14 }}>Mark as "Most popular" (highlighted at checkout)</span>
              </label>
              {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="tagplan-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-tag-plan">{busy ? "Saving…" : editing ? "Save changes" : "Create tag plan"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
