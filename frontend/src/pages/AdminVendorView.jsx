import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, Store, QrCode, PackageOpen, PackageCheck, Ban, Users, Clock, CheckCircle2 } from "lucide-react";

const PILL = { active: "pill-ok", grace: "pill-warn", expired: "pill-danger", none: "pill-muted" };

function Stat({ icon, label, value, color }) {
  return <div className="glass card-pad" data-testid={`vstat-${label}`}><div style={{ color }}>{icon}</div><div className="stat-num">{value ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>{label}</div></div>;
}

export default function AdminVendorView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setData((await api.get(`/admin/vendors/${id}/dashboard`)).data); }
    catch (e) { setErr(e?.response?.data?.detail || "Vendor not found"); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

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

        <div className="glass card-pad" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 20, marginBottom: 14 }}>Customers ({data.customers_total})</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Plate</th><th style={th}>Mobile</th><th style={th}>Plan</th><th style={th}>Status</th><th style={th}>Valid till</th><th style={th}>Assigned</th></tr></thead>
              <tbody>
                {data.customers.length === 0 && <tr><td style={td} colSpan={6} className="muted">No customers assigned yet.</td></tr>}
                {data.customers.map((cu) => (
                  <tr key={cu.vehicle_id} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }} data-testid={`vcust-${cu.number_plate}`}>
                    <td style={td}><b>{cu.number_plate}</b></td>
                    <td style={td} className="muted">{cu.mobile || "—"}</td>
                    <td style={td} className="muted">{cu.plan_name || "—"}</td>
                    <td style={td}><span className={`pill ${PILL[cu.plan_status] || "pill-muted"}`}>{cu.plan_status === "active" ? `Active · ${cu.days_left}d` : cu.plan_status}</span></td>
                    <td style={td} className="muted">{cu.expires_at ? new Date(cu.expires_at).toLocaleDateString() : "—"}</td>
                    <td style={td} className="muted">{cu.assigned_at ? new Date(cu.assigned_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "12px 10px" };
