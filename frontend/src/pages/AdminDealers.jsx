import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Store, Plus, ArrowLeft, X } from "lucide-react";

const rupee = (paise) => `₹${((paise || 0) / 100).toLocaleString()}`;

export default function AdminDealers() {
  const [dealers, setDealers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", contact_name: "", phone: "", city: "", state: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([api.get("/admin/vendors"), api.get("/admin/vendors/summary")]);
    setDealers(d.data.items); setSummary(s.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post("/admin/vendors", form); setShow(false); setForm({ name: "", contact_name: "", phone: "", city: "", state: "" }); load(); }
    finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page" data-testid="admin-dealers-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 32 }}><Store size={26} style={{ verticalAlign: "-4px" }} /> Dealers <span className="neon">(vendors)</span></h1><p className="muted">Distributors who resell QR stickers.</p></div>
          <button className="btn btn-primary" onClick={() => setShow(true)} data-testid="add-dealer-btn"><Plus size={18} /> Add dealer</button>
        </div>

        {summary && (
          <div className="grid grid-4" style={{ marginBottom: 20 }}>
            <div className="glass card-pad" data-testid="summary-dealers"><div className="stat-num">{summary.vendors ?? dealers.length}</div><div className="muted" style={{ fontSize: 13 }}>Dealers</div></div>
            <div className="glass card-pad"><div className="stat-num">{summary.total_qty ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>QR distributed</div></div>
            <div className="glass card-pad"><div className="stat-num" style={{ fontSize: 26 }}>{rupee(summary.total_billed_paise)}</div><div className="muted" style={{ fontSize: 13 }}>Billed</div></div>
            <div className="glass card-pad"><div className="stat-num" style={{ fontSize: 26, color: "#f5a524" }}>{rupee(summary.outstanding_paise)}</div><div className="muted" style={{ fontSize: 13 }}>Outstanding</div></div>
          </div>
        )}

        <div className="glass card-pad" style={{ padding: 22 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Dealer</th><th style={th}>Contact</th><th style={th}>City</th><th style={th}>QR qty</th><th style={th}>Billed</th><th style={th}>Outstanding</th></tr></thead>
              <tbody>
                {dealers.length === 0 && <tr><td style={td} colSpan={6} className="muted">No dealers yet.</td></tr>}
                {dealers.map((v) => (
                  <tr key={v.id} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }} data-testid={`dealer-${v.name}`}>
                    <td style={td}><b>{v.name}</b></td><td style={td} className="muted">{v.contact_name || v.phone || "—"}</td>
                    <td style={td} className="muted">{v.city || "—"}</td><td style={td}>{v.total_qty || 0}</td>
                    <td style={td}>{rupee(v.total_billed_paise)}</td><td style={td} style={{ color: v.outstanding_paise ? "#f5a524" : undefined }}>{rupee(v.outstanding_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {show && (
        <div style={overlay} onClick={() => setShow(false)} data-testid="add-dealer-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 460, padding: 26 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><h2 style={{ fontSize: 22 }}>Add dealer</h2><button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setShow(false)}><X size={16} /></button></div>
            <form onSubmit={create}>
              <div className="field"><label>Dealer name</label><input className="input" value={form.name} onChange={set("name")} required data-testid="dealer-name" /></div>
              <div className="grid grid-2">
                <div className="field"><label>Contact person</label><input className="input" value={form.contact_name} onChange={set("contact_name")} data-testid="dealer-contact" /></div>
                <div className="field"><label>Phone</label><input className="input" value={form.phone} onChange={set("phone")} data-testid="dealer-phone" /></div>
              </div>
              <div className="grid grid-2">
                <div className="field"><label>City</label><input className="input" value={form.city} onChange={set("city")} data-testid="dealer-city" /></div>
                <div className="field"><label>State</label><input className="input" value={form.state} onChange={set("state")} data-testid="dealer-state" /></div>
              </div>
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-dealer"><Plus size={16} /> {busy ? "Adding…" : "Add dealer"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "12px 10px" };
const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
