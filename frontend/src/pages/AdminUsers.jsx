import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import Pager from "@/components/Pager";
import { Users, ArrowLeft, Search, Ban, CheckCircle2, Loader2 } from "lucide-react";

const FILTERS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "admin", label: "Admins" },
];

const th = { padding: "10px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", whiteSpace: "nowrap" };
const td = { padding: "12px", whiteSpace: "nowrap" };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (query, st, sk, lim) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (st) p.set("status", st);
    p.set("skip", sk); p.set("limit", lim);
    try {
      const r = (await api.get(`/admin/users?${p.toString()}`)).data;
      const rows = Array.isArray(r.results) ? r.results : [];
      setUsers(rows); setTotal(r.total ?? rows.length);
    } catch {
      setUsers([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(q, status, skip, limit); /* eslint-disable-next-line */ }, []);

  const onSearch = (v) => { setQ(v); setSkip(0); load(v, status, 0, limit); };
  const onFilter = (st) => { setStatus(st); setSkip(0); load(q, st, 0, limit); };
  const toggleSuspend = async (u) => {
    await api.post(`/admin/users/${u.id}/suspend`, { suspended: !u.suspended });
    load(q, status, skip, limit);
  };

  return (
    <div className="page" data-testid="admin-users-page">
      <div className="container-nk" style={{ maxWidth: 1180, paddingTop: 20, paddingBottom: 60 }}>
        <Link to="/admin" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} data-testid="admin-users-back"><ArrowLeft size={15} /> Back to Console</Link>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 30, margin: 0, display: "inline-flex", alignItems: "center", gap: 10 }}><Users size={26} className="neon" /> All <span className="neon">users</span></h1>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13.5 }}>{total} total</p>
          </div>
        </div>

        <div className="glass" style={{ borderRadius: 18, overflow: "hidden" }}>
          {/* toolbar */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--panel-brd)", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "center", gap: 9, background: "rgba(233,37,70,.06)", border: "1px solid var(--panel-brd)", borderRadius: 11, padding: "8px 12px" }}>
              <Search size={16} className="muted" />
              <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search name, email or phone…" data-testid="admin-users-search"
                style={{ border: "none", background: "none", outline: "none", color: "var(--text)", fontSize: 14, width: "100%" }} />
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => onFilter(f.key)} data-testid={`admin-users-filter-${f.label.toLowerCase()}`}
                  className="pill" style={{ cursor: "pointer", border: `1px solid ${status === f.key ? "var(--accent)" : "var(--panel-brd)"}`,
                    background: status === f.key ? "rgba(233,37,70,.14)" : "transparent", color: status === f.key ? "var(--accent)" : "var(--muted)" }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: "rgba(233,37,70,.04)" }}>
                  <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Phone</th><th style={th}>Plan</th><th style={th}>Valid till</th><th style={th}>Created</th><th style={th}>Vehicles</th><th style={th}>Status</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {loading && users.length === 0 ? (
                  <tr><td style={{ ...td, textAlign: "center", padding: 30 }} colSpan={9}><Loader2 size={20} className="spin" /></td></tr>
                ) : users.length === 0 ? (
                  <tr><td style={{ ...td, textAlign: "center", padding: 30 }} colSpan={9}><span className="muted">No users match this filter.</span></td></tr>
                ) : users.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.email || u.id}`} style={{ borderTop: "1px solid var(--panel-brd)" }}>
                    <td style={{ ...td, fontWeight: 700 }}>{u.name}{u.is_admin && <span className="pill pill-danger" style={{ marginLeft: 8, padding: "1px 7px", fontSize: 10 }}>admin</span>}</td>
                    <td style={td} className="muted">{u.email || "—"}</td>
                    <td style={td} className="muted">{u.phone || "—"}</td>
                    <td style={td}>{u.plan_name ? <span className="pill pill-info" style={{ padding: "2px 9px" }}>{u.plan_name}</span> : <span className="muted">—</span>}</td>
                    <td style={td} className="muted">{u.plan_expires_at ? new Date(u.plan_expires_at).toLocaleDateString() : "—"}</td>
                    <td style={td} className="muted">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                    <td style={td}>{u.vehicles}</td>
                    <td style={td}>{u.suspended ? <span style={{ color: "var(--danger)", fontWeight: 700 }}>Suspended</span> : <span style={{ color: "var(--ok)", fontWeight: 700 }}>Active</span>}</td>
                    <td style={td}>
                      {!u.is_admin && (
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleSuspend(u)} data-testid={`suspend-${u.email || u.id}`}>
                          {u.suspended ? <><CheckCircle2 size={14} /> Reactivate</> : <><Ban size={14} color="#ff3b5c" /> Suspend</>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--panel-brd)" }}>
            <Pager skip={skip} limit={limit} total={total}
              onSkip={(ns) => { setSkip(ns); load(q, status, ns, limit); }}
              onLimit={(nl) => { setLimit(nl); setSkip(0); load(q, status, 0, nl); }} />
          </div>
        </div>
      </div>
    </div>
  );
}
