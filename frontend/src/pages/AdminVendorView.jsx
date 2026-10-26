import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import Pager from "@/components/Pager";
import { ArrowLeft, Store, QrCode, PackageOpen, PackageCheck, Ban, Users, Clock, CheckCircle2 } from "lucide-react";

const PILL = { active: "pill-ok", grace: "pill-warn", expired: "pill-danger", none: "pill-muted" };

function Stat({ icon, label, value, color }) {
  return <div className="glass card-pad" data-testid={`vstat-${label}`}><div style={{ color }}>{icon}</div><div className="stat-num">{value ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>{label}</div></div>;
}

export default function AdminVendorView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(50);
  const [batches, setBatches] = useState([]);
  const [asg, setAsg] = useState({ batch_id: "", serial_from: "", serial_to: "" });
  const [asgMsg, setAsgMsg] = useState("");
  const [stock, setStock] = useState({ items: [], total: 0 });
  const [sSkip, setSSkip] = useState(0);
  const [sLimit, setSLimit] = useState(50);

  const load = useCallback(async (sk = 0, lim = 50) => {
    try {
      const p = new URLSearchParams(); p.set("skip", sk); p.set("limit", lim);
      setData((await api.get(`/admin/vendors/${id}/dashboard?${p.toString()}`)).data);
    } catch (e) { setErr(e?.response?.data?.detail || "Vendor not found"); }
  }, [id]);
  const loadStock = useCallback(async (sk = 0, lim = 50) => {
    try {
      const p = new URLSearchParams(); p.set("skip", sk); p.set("limit", lim);
      setStock((await api.get(`/admin/vendors/${id}/qr-stock?${p.toString()}`)).data);
    } catch (_) {}
  }, [id]);
  useEffect(() => { load(0, 50); loadStock(0, 50); api.get("/admin/qr/batches").then((r) => setBatches(r.data.batches)).catch(() => {}); }, [load, loadStock]);

  const asgText = (d) => {
    const others = (d.already || []).filter((a) => a.name !== d.vendor_name);
    if (d.assigned > 0) {
      let m = `✅ ${d.assigned} QR assigned to ${d.vendor_name}.`;
      if (others.length) m += ` (${others.map((a) => `${a.count} already with ${a.name}`).join(", ")}.)`;
      return m;
    }
    if (others.length) return `Nothing new to assign — already with ${others.map((a) => `${a.name} (${a.count})`).join(", ")}.`;
    return `These are already assigned to ${d.vendor_name}.`;
  };

  const assign = async (e) => {
    e.preventDefault(); setAsgMsg("");
    if (!asg.batch_id && !(asg.serial_from && asg.serial_to)) { setAsgMsg("Pick a batch or a serial range."); return; }
    try {
      const body = asg.batch_id ? { vendor_id: id, batch_id: asg.batch_id } : { vendor_id: id, serial_from: asg.serial_from, serial_to: asg.serial_to };
      const r = await api.post("/admin/qr/assign-dealer", body);
      setAsgMsg(asgText(r.data));
      setAsg({ batch_id: "", serial_from: "", serial_to: "" });
      load(skip, limit); loadStock(sSkip, sLimit);
    } catch (err2) { setAsgMsg(err2?.response?.data?.detail || "Could not assign."); }
  };
  const STOCK_ST = { sold: ["Available", "#f5a524"], assigned: ["Activated", "#2fcf7a"], blocked: ["Blocked", "#ff3b5c"], unclaimed: ["Available", "#e92546"] };
  const fmt = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

  if (err) return <div className="page"><div className="container-nk"><p className="muted">{err}</p><Link to="/admin/dealers" className="btn btn-ghost" style={{ marginTop: 12 }}><ArrowLeft size={16} /> Dealers</Link></div></div>;
  if (!data) return <div className="page"><div className="spinner" /></div>;

  const c = data.counts;
  return (
    <div className="page" data-testid="admin-vendor-view">
      <div className="container-nk">
        <Link to="/admin/dealers" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Dealers</Link>
        <h1 style={{ fontSize: 30, marginBottom: 4 }}><Store size={24} style={{ verticalAlign: "-3px" }} /> {data.vendor.name}</h1>
        <p className="muted" style={{ marginBottom: 20 }}>{data.vendor.city ? `${data.vendor.city} · ` : ""}{data.vendor.phone || ""}</p>

        <div className="grid grid-4" style={{ marginBottom: 14 }}>
          <Stat icon={<QrCode size={20} />} label="QR given" value={c.assigned_total} color="#ff4d67" />
          <Stat icon={<PackageOpen size={20} />} label="Remaining" value={c.available} color="#e92546" />
          <Stat icon={<PackageCheck size={20} />} label="Activated" value={c.activated} color="#2fcf7a" />
          <Stat icon={<Ban size={20} />} label="Blocked" value={c.blocked} color="#ff3b5c" />
        </div>
        <div className="grid grid-4" style={{ marginBottom: 26 }}>
          <Stat icon={<Users size={20} />} label="Customers" value={c.customers} color="#e92546" />
          <Stat icon={<CheckCircle2 size={20} />} label="Active plans" value={c.active} color="#2fcf7a" />
          <Stat icon={<Clock size={20} />} label="Expired" value={c.expired} color="#f5a524" />
          <Stat icon={<Clock size={20} />} label="Pending OTP" value={c.pending} color="#ff8fa3" />
        </div>

        {/* Assign QR to this dealer */}
        <div className="glass card-pad" style={{ padding: 20, marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}><QrCode size={18} style={{ verticalAlign: "-3px" }} /> Assign QR codes to this dealer</h2>
          <form onSubmit={assign} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ margin: 0, minWidth: 220 }}><label>Whole batch</label>
              <select className="input" value={asg.batch_id} onChange={(e) => setAsg({ ...asg, batch_id: e.target.value, serial_from: "", serial_to: "" })} data-testid="vassign-batch">
                <option value="">— Select batch —</option>
                {batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.batch_label} ({b.unclaimed} available)</option>)}
              </select>
            </div>
            <span className="muted" style={{ fontSize: 12, paddingBottom: 10 }}>or serial range</span>
            <div className="field" style={{ margin: 0 }}><label>From</label><input className="input" style={{ maxWidth: 170 }} value={asg.serial_from} onChange={(e) => setAsg({ ...asg, serial_from: e.target.value, batch_id: "" })} placeholder="NS-2610-000001" data-testid="vassign-from" /></div>
            <div className="field" style={{ margin: 0 }}><label>To</label><input className="input" style={{ maxWidth: 170 }} value={asg.serial_to} onChange={(e) => setAsg({ ...asg, serial_to: e.target.value, batch_id: "" })} placeholder="NS-2610-000100" data-testid="vassign-to" /></div>
            <button className="btn btn-primary" data-testid="vassign-submit"><Store size={15} /> Assign</button>
          </form>
          {asgMsg && <p style={{ color: asgMsg.startsWith("✅") ? "#2fcf7a" : "#e92546", marginTop: 10, fontSize: 14 }} data-testid="vassign-msg">{asgMsg}</p>}
        </div>

        {/* All QR serials this dealer holds */}
        <div className="glass card-pad" style={{ padding: 20, marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}><QrCode size={18} style={{ verticalAlign: "-3px" }} /> QR stock ({stock.total})</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Serial</th><th style={th}>Status</th><th style={th}>Type</th><th style={th}>Given on</th></tr></thead>
              <tbody>
                {stock.items.length === 0 && <tr><td style={td} colSpan={4} className="muted">No QR assigned to this dealer yet.</td></tr>}
                {stock.items.map((s) => {
                  const [lbl, col] = STOCK_ST[s.status] || [s.status, "var(--muted)"];
                  return (
                    <tr key={s.serial_no} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }} data-testid={`vstock-${s.serial_no}`}>
                      <td style={td}><b>{s.serial_no}</b></td>
                      <td style={td}><span style={{ color: col, fontWeight: 700 }}>{lbl}</span></td>
                      <td style={td} className="muted">{s.product_type || "—"}</td>
                      <td style={td} className="muted">{fmt(s.sold_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager skip={sSkip} limit={sLimit} total={stock.total}
            onSkip={(ns) => { setSSkip(ns); loadStock(ns, sLimit); }}
            onLimit={(nl) => { setSLimit(nl); setSSkip(0); loadStock(0, nl); }} />
        </div>

        <div className="glass card-pad" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>Customers ({data.customers_total})</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Vehicle</th><th style={th}>Customer</th><th style={th}>QR serial</th><th style={th}>Plan</th><th style={th}>Status</th><th style={th}>Valid till</th><th style={th}>Date</th></tr></thead>
              <tbody>
                {data.customers.length === 0 && <tr><td style={td} colSpan={7} className="muted">No customers assigned yet.</td></tr>}
                {data.customers.map((cu) => (
                  <tr key={cu.vehicle_id} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }} data-testid={`vcust-${cu.number_plate}`}>
                    <td style={td}><b>{cu.number_plate}</b><div className="muted" style={{ fontSize: 11, textTransform: "capitalize" }}>{cu.vehicle_type}{cu.make_model ? ` · ${cu.make_model}` : ""}{cu.color ? ` · ${cu.color}` : ""}</div></td>
                    <td style={td} className="muted">{cu.customer_name || "—"}<br /><span style={{ fontSize: 12 }}>{cu.mobile}</span></td>
                    <td style={td} className="muted">{cu.serial_no || "—"}</td>
                    <td style={td} className="muted">{cu.plan_name || "—"}</td>
                    <td style={td}><span className={`pill ${PILL[cu.plan_status] || "pill-muted"}`}>{cu.plan_status === "active" ? `Active · ${cu.days_left}d` : cu.plan_status}</span></td>
                    <td style={td} className="muted">{cu.expires_at ? new Date(cu.expires_at).toLocaleDateString() : "—"}</td>
                    <td style={td} className="muted">{fmt(cu.assigned_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager skip={skip} limit={limit} total={data.customers_total}
            onSkip={(ns) => { setSkip(ns); load(ns, limit); }}
            onLimit={(nl) => { setLimit(nl); setSkip(0); load(0, nl); }} />
        </div>
      </div>
    </div>
  );
}
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "12px 10px" };
