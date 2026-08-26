import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Mail, ArrowLeft, Filter, Phone, ExternalLink } from "lucide-react";

const STATUS = ["new", "in_progress", "replied", "closed"];
const STATUS_COLOR = { new: "#f5a524", in_progress: "#22d3ee", replied: "#34d399", closed: "#8891a7" };

export default function AdminContacts() {
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => setItems((await api.get("/admin/contacts")).data.results), []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    await api.patch(`/admin/contacts/${id}`, { status });
    load();
  };

  const shown = statusFilter ? items.filter((c) => (c.status || "new") === statusFilter) : items;

  return (
    <div className="page" data-testid="admin-contacts-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 32 }}><Mail size={26} style={{ verticalAlign: "-4px" }} /> Contact <span className="neon">enquiries</span></h1><p className="muted">Messages from the public contact form.</p></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Filter size={16} className="muted" />
            <select className="input" style={{ maxWidth: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="contacts-status-filter">
              <option value="">All statuses</option>
              {STATUS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
        </div>

        <div className="grid" style={{ gap: 12 }}>
          {shown.length === 0 && <p className="muted" data-testid="contacts-empty">No enquiries for this filter.</p>}
          {shown.map((c) => {
            const st = c.status || "new";
            return (
              <div key={c.id} className="glass card-pad" data-testid={`enquiry-${c.id}`} style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: 18 }}>{c.subject}</h3>
                  <span className="chip" style={{ padding: "2px 10px", color: STATUS_COLOR[st] }} data-testid={`enquiry-status-${c.id}`}>{st.replace("_", " ")}</span>
                </div>
                <p className="muted" style={{ fontSize: 14, marginTop: 8, whiteSpace: "pre-wrap" }}>{c.message}</p>
                <div className="muted" style={{ fontSize: 13, marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <span><b style={{ color: "#d9c9ff" }}>{c.name}</b></span>
                  <a href={`mailto:${c.email}`} className="nav-link" style={{ display: "inline-flex", gap: 4 }}><ExternalLink size={12} /> {c.email}</a>
                  {c.phone && <a href={`tel:${c.phone}`} className="nav-link" style={{ display: "inline-flex", gap: 4 }}><Phone size={12} /> {c.phone}</a>}
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {STATUS.filter((s) => s !== st).map((s) => (
                    <button key={s} className="btn btn-ghost btn-sm" onClick={() => setStatus(c.id, s)} data-testid={`set-${s}-${c.id}`}>Mark {s.replace("_", " ")}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
