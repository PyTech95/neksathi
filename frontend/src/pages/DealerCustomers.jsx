import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Pager from "@/components/Pager";
import { Users, ArrowLeft, LogOut, QrCode, PackageOpen, PackageCheck, Ban, Store } from "lucide-react";

const PLAN_PILL = { active: "pill-ok", grace: "pill-warn", expired: "pill-danger", none: "pill-muted" };
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "12px 10px" };

export default function DealerCustomers() {
  const { logout } = useAuth();
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(50);
  const [deactivated, setDeactivated] = useState(false);

  const isDeact = (e) => e?.response?.status === 403 && /deactiv/i.test(e?.response?.data?.detail || "");

  const load = useCallback(async (sk, lim) => {
    const p = new URLSearchParams(); p.set("skip", sk); p.set("limit", lim);
    try {
      const r = (await api.get(`/dealer/assignments?${p.toString()}`)).data;
      setRows(r.customers); setTotal(r.customers_total ?? r.customers.length);
    } catch (e) { if (isDeact(e)) setDeactivated(true); }
  }, []);

  useEffect(() => { api.get("/dealer/me").then((r) => setMe(r.data)).catch((e) => { if (isDeact(e)) setDeactivated(true); }); load(0, 50); }, [load]);

  if (deactivated) return (
    <div className="page" data-testid="dealer-deactivated"><div className="container-nk" style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="chip"><Store size={13} /> Dealer portal</span>
        <button className="btn btn-ghost btn-sm" data-testid="dealer-logout" onClick={() => { logout(); nav("/"); }}><LogOut size={15} /> Logout</button>
      </div>
      <div className="glass card-pad" style={{ padding: 34, marginTop: 24, textAlign: "center", border: "1px solid rgba(255,59,92,.5)" }}>
        <Ban size={52} color="#ff3b5c" />
        <h2 style={{ fontSize: 24, marginTop: 14 }}>Your account has been deactivated</h2>
        <p className="muted" style={{ marginTop: 8 }}>You can log in, but you can't scan or assign QR codes right now. Please contact the admin to reactivate your account.</p>
      </div>
    </div></div>
  );

  const fmt = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

  return (
    <div className="page" data-testid="dealer-customers-page">
      <div className="container-nk">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Link to="/dealer" className="nav-link" style={{ display: "inline-flex" }}><ArrowLeft size={16} /> Dealer portal</Link>
          <button className="btn btn-ghost btn-sm" data-testid="dealer-logout" onClick={() => { logout(); nav("/"); }}><LogOut size={15} /> Logout</button>
        </div>
        <h1 style={{ fontSize: 30, marginTop: 12 }}><Users size={24} style={{ verticalAlign: "-4px" }} /> My <span className="neon">customers</span></h1>
        <p className="muted" style={{ marginBottom: 18 }}>Every QR you activated for a customer — plan, validity &amp; date.</p>

        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          <div className="glass card-pad"><div style={{ color: "#ff4d67" }}><QrCode size={20} /></div><div className="stat-num">{me?.stock?.assigned_total ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>Assigned to me</div></div>
          <div className="glass card-pad"><div style={{ color: "#e92546" }}><PackageOpen size={20} /></div><div className="stat-num">{me?.stock?.available ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>Available (unsold)</div></div>
          <div className="glass card-pad"><div style={{ color: "#10b981" }}><PackageCheck size={20} /></div><div className="stat-num">{me?.stock?.activated ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>Given to customers</div></div>
          <div className="glass card-pad"><div className="stat-num">{total}</div><div className="muted" style={{ fontSize: 13 }}>Customers</div></div>
        </div>

        <div className="glass card-pad" style={{ padding: 20 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={th}>Vehicle</th><th style={th}>Customer</th><th style={th}>QR serial</th><th style={th}>Plan</th><th style={th}>Validity</th><th style={th}>Date</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td style={td} colSpan={6} className="muted">No customers yet. Use “Scan &amp; assign QR” to onboard one.</td></tr>}
                {rows.map((c) => (
                  <tr key={c.vehicle_id} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }} data-testid={`cust-${c.vehicle_id}`}>
                    <td style={td}><b>{c.number_plate}</b><div className="muted" style={{ fontSize: 11, textTransform: "capitalize" }}>{c.vehicle_type}{c.make_model ? ` · ${c.make_model}` : ""}{c.color ? ` · ${c.color}` : ""}</div></td>
                    <td style={td} className="muted">{c.customer_name || "—"}<br /><span style={{ fontSize: 12 }}>{c.mobile}</span></td>
                    <td style={td} className="muted">{c.serial_no || "—"}</td>
                    <td style={td} className="muted">{c.plan_name || "—"}</td>
                    <td style={td}><span className={`pill ${PLAN_PILL[c.plan_status] || "pill-muted"}`}>{c.plan_status === "active" ? `${c.days_left}d left` : c.plan_status}</span></td>
                    <td style={td} className="muted">{fmt(c.assigned_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager skip={skip} limit={limit} total={total}
            onSkip={(ns) => { setSkip(ns); load(ns, limit); }}
            onLimit={(nl) => { setLimit(nl); setSkip(0); load(0, nl); }} />
        </div>
      </div>
    </div>
  );
}
