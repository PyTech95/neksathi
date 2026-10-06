import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { LifeBuoy, Plus, X, Send, Loader2, MessageSquare } from "lucide-react";

const STATUS_COLOR = { open: "#f5a524", in_progress: "#22d3ee", resolved: "#34d399", closed: "#8891a7" };
const PRIORITY_COLOR = { low: "#8891a7", normal: "#22d3ee", high: "#ff3b5c" };

export default function Support() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ subject: "", body: "", priority: "normal" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setTickets((await api.get("/support/tickets/me")).data); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api.post("/support/tickets", { subject: form.subject.trim(), body: form.body.trim(), priority: form.priority });
      setShow(false); setForm({ subject: "", body: "", priority: "normal" }); load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not submit ticket"); }
    finally { setBusy(false); }
  };

  return (
    <div className="page" data-testid="support-page">
      <div className="container-nk" style={{ maxWidth: 820 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 32 }}><LifeBuoy size={26} style={{ verticalAlign: "-4px" }} /> Help & <span className="neon">support</span></h1><p className="muted">Raise a ticket and our team will get back to you here.</p></div>
          <button className="btn btn-primary" onClick={() => { setErr(""); setShow(true); }} data-testid="new-ticket-btn"><Plus size={18} /> New ticket</button>
        </div>

        {loading ? <div className="spinner" /> : tickets.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 44 }} data-testid="support-empty">
            <MessageSquare size={44} color="#8891a7" />
            <h3 style={{ fontSize: 20, marginTop: 12 }}>No tickets yet</h3>
            <p className="muted">Something not working? Open a ticket and we'll help you out.</p>
          </div>
        ) : (
          <div className="grid" style={{ gap: 12 }}>
            {tickets.map((t) => (
              <div key={t.id} className="glass card-pad" data-testid={`ticket-${t.id}`} style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: 18 }}>{t.subject}</h3>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span className="chip" style={{ padding: "2px 10px", color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
                    <span className="chip" style={{ padding: "2px 10px", color: STATUS_COLOR[t.status] }} data-testid={`ticket-status-${t.id}`}>{t.status.replace("_", " ")}</span>
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 14, marginTop: 8, whiteSpace: "pre-wrap" }}>{t.body}</p>
                {(t.replies || []).length > 0 && (
                  <div style={{ marginTop: 14, borderTop: "1px solid rgba(124,58,237,.14)", paddingTop: 12 }}>
                    {t.replies.map((r) => (
                      <div key={r.id} style={{ marginBottom: 10 }}>
                        <div className="chip" style={{ padding: "2px 8px", fontSize: 11 }}>{r.by === "admin" ? `Nek Sathi team` : "You"}</div>
                        <p className="muted" style={{ fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap" }}>{r.body}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{new Date(t.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {show && (
        <div style={overlay} onClick={() => setShow(false)} data-testid="ticket-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 480, padding: 26 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 22 }}>New support ticket</h2>
              <button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setShow(false)}><X size={16} /></button>
            </div>
            <form onSubmit={submit}>
              <div className="field"><label>Subject</label><input className="input" value={form.subject} onChange={set("subject")} required maxLength={120} data-testid="ticket-subject" placeholder="Brief summary" /></div>
              <div className="field"><label>Describe the issue</label><textarea className="input" rows={4} value={form.body} onChange={set("body")} required minLength={5} maxLength={2000} data-testid="ticket-body" placeholder="What went wrong?" /></div>
              <div className="field"><label>Priority</label>
                <select className="input" value={form.priority} onChange={set("priority")} data-testid="ticket-priority">
                  <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
                </select>
              </div>
              {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="ticket-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-ticket">{busy ? <Loader2 size={16} className="spin" /> : <Send size={15} />} {busy ? "Sending…" : "Submit ticket"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
