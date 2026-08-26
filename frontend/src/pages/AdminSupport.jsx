import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Inbox, ArrowLeft, Filter, Send, Loader2, User } from "lucide-react";

const STATUS_COLOR = { open: "#f5a524", in_progress: "#22d3ee", resolved: "#34d399", closed: "#8891a7" };
const PRIORITY_COLOR = { low: "#8891a7", normal: "#22d3ee", high: "#ff3b5c" };
const STATUSES = ["open", "in_progress", "resolved", "closed"];

export default function AdminSupport() {
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (sf = statusFilter) => {
    const q = sf ? `?status_filter=${sf}` : "";
    setTickets((await api.get(`/admin/support/tickets${q}`)).data.results);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const open = (t) => { setActive(t); setReply(""); setNewStatus(t.status); };

  const sendReply = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const payload = { reply: reply.trim() };
      if (newStatus && newStatus !== active.status) payload.status = newStatus;
      const r = await api.patch(`/admin/support/tickets/${active.id}`, payload);
      setActive(r.data); setReply(""); load();
    } finally { setBusy(false); }
  };

  const changeStatusOnly = async (t, status) => {
    await api.patch(`/admin/support/tickets/${t.id}`, { reply: `Status changed to ${status.replace("_", " ")}.`, status });
    load(); if (active?.id === t.id) open({ ...t, status });
  };

  return (
    <div className="page" data-testid="admin-support-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 32 }}><Inbox size={26} style={{ verticalAlign: "-4px" }} /> Support <span className="neon">inbox</span></h1><p className="muted">Reply to user tickets and manage their status.</p></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Filter size={16} className="muted" />
            <select className="input" style={{ maxWidth: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="support-status-filter">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: active ? "1fr 1.2fr" : "1fr", gap: 16, alignItems: "start" }}>
          <div className="grid" style={{ gap: 10 }}>
            {tickets.length === 0 && <p className="muted">No tickets for this filter.</p>}
            {tickets.map((t) => (
              <button key={t.id} className="glass glass-hover card-pad" onClick={() => open(t)} data-testid={`admin-ticket-${t.id}`}
                style={{ padding: 16, textAlign: "left", cursor: "pointer", border: active?.id === t.id ? "1px solid rgba(34,211,238,.5)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <b>{t.subject}</b>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span className="chip" style={{ padding: "2px 8px", fontSize: 11, color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
                    <span className="chip" style={{ padding: "2px 8px", fontSize: 11, color: STATUS_COLOR[t.status] }}>{t.status.replace("_", " ")}</span>
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 13, marginTop: 6 }}><User size={11} style={{ verticalAlign: "-1px" }} /> {t.user_name} · {t.user_email}</p>
                <p className="muted" style={{ fontSize: 13, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.body}</p>
                <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>{new Date(t.created_at).toLocaleString()} · {(t.replies || []).length} repl{(t.replies || []).length === 1 ? "y" : "ies"}</p>
              </button>
            ))}
          </div>

          {active && (
            <div className="glass card-pad" style={{ padding: 22, position: "sticky", top: 20 }} data-testid="ticket-detail">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 20 }}>{active.subject}</h2>
                <span className="chip" style={{ padding: "2px 10px", color: STATUS_COLOR[active.status] }} data-testid="detail-status">{active.status.replace("_", " ")}</span>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{active.user_name} · {active.user_email}</p>
              <p style={{ fontSize: 14, marginTop: 12, whiteSpace: "pre-wrap" }}>{active.body}</p>

              <div style={{ marginTop: 16, borderTop: "1px solid rgba(124,58,237,.14)", paddingTop: 12, maxHeight: 260, overflowY: "auto" }}>
                {(active.replies || []).map((r) => (
                  <div key={r.id} style={{ marginBottom: 12 }}>
                    <div className="chip" style={{ padding: "2px 8px", fontSize: 11, color: r.by === "admin" ? "#22d3ee" : "#f5a524" }}>{r.by === "admin" ? (r.by_name || "Team") : "User"}</div>
                    <p className="muted" style={{ fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap" }}>{r.body}</p>
                    <p className="muted" style={{ fontSize: 11 }}>{new Date(r.created_at).toLocaleString()}</p>
                  </div>
                ))}
                {(active.replies || []).length === 0 && <p className="muted" style={{ fontSize: 13 }}>No replies yet.</p>}
              </div>

              <form onSubmit={sendReply} style={{ marginTop: 14 }}>
                <div className="field"><label>Reply to user</label><textarea className="input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} required data-testid="admin-reply-body" placeholder="Type your reply…" /></div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select className="input" style={{ maxWidth: 180 }} value={newStatus} onChange={(e) => setNewStatus(e.target.value)} data-testid="admin-reply-status">
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                  <button className="btn btn-primary" disabled={busy} data-testid="send-reply-btn">{busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Send</button>
                </div>
              </form>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {active.status !== "resolved" && <button className="btn btn-ghost btn-sm" onClick={() => changeStatusOnly(active, "resolved")} data-testid="quick-resolve">Mark resolved</button>}
                {active.status !== "closed" && <button className="btn btn-ghost btn-sm" onClick={() => changeStatusOnly(active, "closed")} data-testid="quick-close">Close</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
