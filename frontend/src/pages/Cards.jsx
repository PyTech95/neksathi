import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { IdCard, Plus, Trash2, ChevronRight, X } from "lucide-react";

export const ACCENTS = {
  neon: "linear-gradient(135deg,#7c3aed,#22d3ee)",
  sunset: "linear-gradient(135deg,#f97316,#ec4899)",
  ocean: "linear-gradient(135deg,#0ea5e9,#22d3ee)",
  forest: "linear-gradient(135deg,#059669,#84cc16)",
};
const SOCIAL_KEYS = ["twitter", "linkedin", "instagram", "github", "whatsapp"];

export default function Cards() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ display_name: "", title: "", company: "", bio: "", phone: "", email: "", website: "", address: "", accent: "neon", socials: {} });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => { setLoading(true); try { setCards((await api.get("/cards")).data); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const socials = Object.fromEntries(Object.entries(form.socials).filter(([, v]) => v));
      await api.post("/cards", { ...form, socials });
      setShow(false);
      setForm({ display_name: "", title: "", company: "", bio: "", phone: "", email: "", website: "", address: "", accent: "neon", socials: {} });
      load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not create card"); } finally { setBusy(false); }
  };
  const remove = async (id) => { if (!window.confirm("Delete this card?")) return; await api.delete(`/cards/${id}`); load(); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setSocial = (k) => (e) => setForm({ ...form, socials: { ...form.socials, [k]: e.target.value } });

  return (
    <div className="page" data-testid="cards-page">
      <div className="container-nk">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
          <div>
            <span className="chip">Share Tap</span>
            <h1 style={{ fontSize: 34, marginTop: 12 }}>Digital <span className="neon">business cards</span></h1>
            <p className="muted">One scan shares your details & saves a contact — no app needed.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShow(true)} data-testid="add-card-btn"><Plus size={18} /> New card</button>
        </div>

        {loading ? <div className="spinner" /> : cards.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-cards">
            <IdCard size={44} color="#7c3aed" />
            <h3 style={{ fontSize: 22, margin: "14px 0 6px" }}>No cards yet</h3>
            <p className="muted" style={{ marginBottom: 20 }}>Create your first Share Tap card.</p>
            <button className="btn btn-primary" onClick={() => setShow(true)}><Plus size={18} /> New card</button>
          </div>
        ) : (
          <div className="grid grid-3">
            {cards.map((c) => (
              <div key={c.id} className="glass glass-hover card-pad" data-testid={`card-item-${c.display_name}`}>
                <div style={{ height: 8, borderRadius: 8, background: ACCENTS[c.accent] || ACCENTS.neon, marginBottom: 16 }} />
                <h3 style={{ fontSize: 22 }}>{c.display_name}</h3>
                <p className="muted" style={{ fontSize: 14 }}>{[c.title, c.company].filter(Boolean).join(" · ") || "—"}</p>
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <Link to={`/card/${c.id}`} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} data-testid={`open-card-${c.display_name}`}>QR & share <ChevronRight size={15} /></Link>
                  <button className="btn btn-ghost btn-sm" style={{ padding: "8px 12px" }} onClick={() => remove(c.id)} data-testid={`delete-card-${c.display_name}`}><Trash2 size={15} color="#ff3b5c" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {show && (
        <div style={overlay} onClick={() => setShow(false)} data-testid="add-card-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 520, padding: 28, maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 24 }}>New card</h2>
              <button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setShow(false)} data-testid="close-card-modal"><X size={16} /></button>
            </div>
            <form onSubmit={add}>
              <div className="field"><label>Display name</label><input className="input" value={form.display_name} onChange={set("display_name")} required data-testid="card-name" placeholder="Aarav Sharma" /></div>
              <div className="grid grid-2">
                <div className="field"><label>Title</label><input className="input" value={form.title} onChange={set("title")} data-testid="card-title" placeholder="Founder" /></div>
                <div className="field"><label>Company</label><input className="input" value={form.company} onChange={set("company")} data-testid="card-company" placeholder="Nek Labs" /></div>
              </div>
              <div className="field"><label>Bio</label><textarea className="input" rows={2} value={form.bio} onChange={set("bio")} data-testid="card-bio" /></div>
              <div className="grid grid-2">
                <div className="field"><label>Phone</label><input className="input" value={form.phone} onChange={set("phone")} data-testid="card-phone" /></div>
                <div className="field"><label>Email</label><input className="input" value={form.email} onChange={set("email")} data-testid="card-email" /></div>
              </div>
              <div className="grid grid-2">
                <div className="field"><label>Website</label><input className="input" value={form.website} onChange={set("website")} data-testid="card-website" placeholder="https://…" /></div>
                <div className="field"><label>Accent</label>
                  <select className="input" value={form.accent} onChange={set("accent")} data-testid="card-accent">
                    {Object.keys(ACCENTS).map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label>Address</label><input className="input" value={form.address} onChange={set("address")} data-testid="card-address" /></div>
              <label style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Socials (usernames or URLs)</label>
              <div className="grid grid-2" style={{ marginTop: 8 }}>
                {SOCIAL_KEYS.map((k) => (
                  <div className="field" key={k}><label style={{ textTransform: "capitalize" }}>{k}</label><input className="input" value={form.socials[k] || ""} onChange={setSocial(k)} data-testid={`card-social-${k}`} /></div>
                ))}
              </div>
              {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="add-card-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-card"><Plus size={17} /> {busy ? "Creating…" : "Create card"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
