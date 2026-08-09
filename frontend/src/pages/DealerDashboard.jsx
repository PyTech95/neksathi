import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Store, QrCode, PackageCheck, PackageOpen, Ban } from "lucide-react";

const STATUS_LABEL = { sold: "Available", assigned: "Activated", blocked: "Blocked", unclaimed: "Available" };
const STATUS_COLOR = { sold: "#22d3ee", assigned: "#10b981", blocked: "#ff3b5c", unclaimed: "#22d3ee" };

function Stat({ icon, label, value, color }) {
  return <div className="glass card-pad" data-testid={`dealer-stat-${label}`}><div style={{ color }}>{icon}</div><div className="stat-num">{value ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>{label}</div></div>;
}

export default function DealerDashboard() {
  const [me, setMe] = useState(null);
  const [inv, setInv] = useState([]);
  const [statusF, setStatusF] = useState("");
  const [q, setQ] = useState("");

  const loadInv = useCallback(async (status = statusF, query = q) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (query) p.set("q", query);
    setInv((await api.get(`/dealer/inventory?${p.toString()}`)).data.items);
  }, [statusF, q]);

  useEffect(() => { api.get("/dealer/me").then((r) => setMe(r.data)); loadInv(); }, [loadInv]);

  return (
    <div className="page" data-testid="dealer-page">
      <div className="container-nk">
        <span className="chip"><Store size={13} /> Dealer portal</span>
        <h1 style={{ fontSize: 34, marginTop: 12 }}>{me?.vendor?.name || "Dealer"} <span className="neon">stock</span></h1>
        <p className="muted" style={{ marginBottom: 22 }}>{me?.vendor?.city ? `${me.vendor.city} · ` : ""}Your QR sticker inventory.</p>

        <div className="grid grid-4" style={{ marginBottom: 22 }}>
          <Stat icon={<QrCode size={22} />} label="Assigned" value={me?.stock?.assigned_total} color="#8b5cf6" />
          <Stat icon={<PackageOpen size={22} />} label="Available" value={me?.stock?.available} color="#22d3ee" />
          <Stat icon={<PackageCheck size={22} />} label="Activated" value={me?.stock?.activated} color="#10b981" />
          <Stat icon={<Ban size={22} />} label="Blocked" value={me?.stock?.blocked} color="#ff3b5c" />
        </div>

        <div className="glass card-pad" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20 }}>My QR codes</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="input" style={{ maxWidth: 160 }} value={statusF} onChange={(e) => { setStatusF(e.target.value); loadInv(e.target.value, q); }} data-testid="dealer-status-filter">
                <option value="">All</option><option value="sold">Available</option><option value="assigned">Activated</option><option value="blocked">Blocked</option>
              </select>
              <input className="input" style={{ maxWidth: 200 }} placeholder="Search serial" value={q} onChange={(e) => { setQ(e.target.value); loadInv(statusF, e.target.value); }} data-testid="dealer-search" />
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Serial</th><th style={th}>Status</th><th style={th}>Sold at</th></tr></thead>
              <tbody>
                {inv.length === 0 && <tr><td style={td} colSpan={3} className="muted">No QR codes assigned to you yet.</td></tr>}
                {inv.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }} data-testid={`dealer-inv-${d.serial_no}`}>
                    <td style={td}><b>{d.serial_no}</b></td>
                    <td style={td}><span style={{ color: STATUS_COLOR[d.status], fontWeight: 700 }}>{STATUS_LABEL[d.status] || d.status}</span></td>
                    <td style={td} className="muted">{d.sold_at ? new Date(d.sold_at).toLocaleDateString() : "—"}</td>
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
