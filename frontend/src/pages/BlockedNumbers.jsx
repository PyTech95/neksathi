import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Ban, Plus, Trash2, Loader2, ShieldX } from "lucide-react";

// Owner-managed blocklist. A blocked number's scan alerts are silently dropped
// (they aren't told they're blocked). Calls are anonymous WebRTC, so blocking
// applies to the alert/report flow where the scanner gives a phone.
export default function BlockedNumbers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    try { setList((await api.get("/me/blocked-numbers")).data); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api.post("/me/blocked-numbers", { phone: phone.trim(), label: label.trim() || undefined });
      setPhone(""); setLabel("");
      await load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not block this number."); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    await api.delete(`/me/blocked-numbers/${id}`);
    setList((l) => l.filter((b) => b.id !== id));
  };

  return (
    <div className="page" data-testid="blocked-numbers-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <span className="chip"><Ban size={13} /> Privacy</span>
        <h1 style={{ fontSize: 30, marginTop: 12, marginBottom: 4 }}>Blocked <span className="neon">numbers</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>Alerts from a blocked number are silently ignored — they won't know they're blocked.</p>

        <form onSubmit={add} className="glass card-pad" style={{ padding: 20, marginBottom: 18 }}>
          <div className="field"><label>Phone number</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="9876543210" data-testid="block-phone" />
          </div>
          <div className="field" style={{ marginBottom: 12 }}><label>Note (optional)</label>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. repeated false reports" data-testid="block-label" />
          </div>
          {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="block-error">{err}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} data-testid="block-submit">
            {busy ? <Loader2 size={16} className="spin" /> : <Ban size={16} />} {busy ? "Blocking…" : "Block number"}
          </button>
        </form>

        {loading ? (
          <div className="spinner" />
        ) : list.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 40 }} data-testid="blocked-empty">
            <ShieldX size={38} color="var(--muted)" />
            <p className="muted" style={{ marginTop: 12 }}>No blocked numbers. Numbers you block will appear here.</p>
          </div>
        ) : (
          <div className="glass" style={{ overflow: "hidden" }}>
            {list.map((b) => (
              <div key={b.id} data-testid={`blocked-row-${b.id}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderBottom: "1px solid var(--panel-brd)" }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(255,59,92,.14)", color: "#ff3b5c", border: "1px solid rgba(255,59,92,.35)" }}><Ban size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{b.phone}</div>
                  {b.label && <div className="muted" style={{ fontSize: 12.5 }}>{b.label}</div>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(b.id)} data-testid={`unblock-${b.id}`} style={{ flexShrink: 0 }}>
                  <Trash2 size={14} color="#ff3b5c" /> Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
