import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Tag, Plus, Trash2, ChevronRight, X, Baby, PawPrint, Briefcase, Luggage, KeyRound, Smartphone, Laptop, DoorOpen, User, Package, HeartPulse, IdCard } from "lucide-react";

export const TAG_META = {
  person: { icon: <User size={18} />, label: "Person" },
  kid: { icon: <Baby size={18} />, label: "School kid" },
  patient: { icon: <HeartPulse size={18} />, label: "Patient / Elderly" },
  staff: { icon: <IdCard size={18} />, label: "Office / Staff" },
  pet: { icon: <PawPrint size={18} />, label: "Pet" },
  bag: { icon: <Briefcase size={18} />, label: "Bag" },
  luggage: { icon: <Luggage size={18} />, label: "Luggage" },
  keys: { icon: <KeyRound size={18} />, label: "Keys" },
  phone: { icon: <Smartphone size={18} />, label: "Phone" },
  laptop: { icon: <Laptop size={18} />, label: "Laptop" },
  door: { icon: <DoorOpen size={18} />, label: "Door" },
  other: { icon: <Package size={18} />, label: "Other" },
};
const TYPES = Object.keys(TAG_META);

export default function Tags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", tag_type: "bag", description: "", blood_group: "", medical_notes: "", reward_text: "", guardian_name: "", guardian_phone: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setTags((await api.get("/tags")).data); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api.post("/tags", { ...form });
      setShow(false);
      setForm({ name: "", tag_type: "bag", description: "", blood_group: "", medical_notes: "", reward_text: "", guardian_name: "", guardian_phone: "" });
      load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not add tag"); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this tag?")) return;
    await api.delete(`/tags/${id}`); load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isPerson = ["kid", "person", "patient"].includes(form.tag_type);

  return (
    <div className="page" data-testid="tags-page">
      <div className="container-nk">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
          <div>
            <span className="chip">Smart tags</span>
            <h1 style={{ fontSize: 34, marginTop: 12 }}>Your <span className="neon">QR tags</span></h1>
            <p className="muted">School kids, patients & elderly, staff, pets, bags, keys & devices — safe & recoverable with one scan.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShow(true)} data-testid="add-tag-btn"><Plus size={18} /> Add tag</button>
        </div>

        {loading ? <div className="spinner" /> : tags.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-tags">
            <Tag size={44} color="#7c3aed" />
            <h3 style={{ fontSize: 22, margin: "14px 0 6px" }}>No tags yet</h3>
            <p className="muted" style={{ marginBottom: 20 }}>Create a QR tag for anything precious.</p>
            <button className="btn btn-primary" onClick={() => setShow(true)}><Plus size={18} /> Add tag</button>
          </div>
        ) : (
          <div className="grid grid-3">
            {tags.map((t) => {
              const m = TAG_META[t.tag_type] || TAG_META.other;
              return (
                <div key={t.id} className="glass glass-hover card-pad" data-testid={`tag-card-${t.name}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="brand-badge" style={{ borderRadius: 12 }}>{m.icon}</div>
                    {t.lost_mode && <span className="chip" style={{ background: "rgba(255,59,92,.16)", borderColor: "rgba(255,59,92,.4)", color: "#ffb3c0" }}>Lost</span>}
                  </div>
                  <h3 style={{ fontSize: 22, margin: "14px 0 4px" }}>{t.name}</h3>
                  <p className="muted" style={{ fontSize: 14 }}>{m.label}{t.description ? ` · ${t.description}` : ""}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                    <Link to={`/tag/${t.id}`} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} data-testid={`open-tag-${t.name}`}>QR & manage <ChevronRight size={15} /></Link>
                    <button className="btn btn-ghost btn-sm" style={{ padding: "8px 12px" }} onClick={() => remove(t.id)} data-testid={`delete-tag-${t.name}`}><Trash2 size={15} color="#ff3b5c" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {show && (
        <div style={overlay} onClick={() => setShow(false)} data-testid="add-tag-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 480, padding: 28, maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 24 }}>Add tag</h2>
              <button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setShow(false)} data-testid="close-tag-modal"><X size={16} /></button>
            </div>
            <form onSubmit={add}>
              <div className="field"><label>Name</label><input className="input" value={form.name} onChange={set("name")} required data-testid="tag-name" placeholder="e.g. Aarav's school bag" /></div>
              <div className="field"><label>Type</label>
                <select className="input" value={form.tag_type} onChange={set("tag_type")} data-testid="tag-type">
                  {TYPES.map((t) => <option key={t} value={t}>{TAG_META[t].label}</option>)}
                </select>
              </div>
              <div className="field"><label>Description (optional)</label><input className="input" value={form.description} onChange={set("description")} data-testid="tag-desc" /></div>
              {isPerson && (
                <>
                  <div className="grid grid-2">
                    <div className="field"><label>Blood group</label><input className="input" value={form.blood_group} onChange={set("blood_group")} placeholder="O+" data-testid="tag-blood" /></div>
                    <div className="field"><label>Allergies / medical notes</label><input className="input" value={form.medical_notes} onChange={set("medical_notes")} placeholder="e.g. Asthma, penicillin allergy" data-testid="tag-medical" /></div>
                  </div>
                  <div className="glass" style={{ padding: 14, marginBottom: 14, borderColor: "rgba(34,211,238,.3)" }}>
                    <p className="muted" style={{ fontSize: 12, marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>Emergency guardian (ICE)</p>
                    <div className="grid grid-2" style={{ marginBottom: 0 }}>
                      <div className="field" style={{ marginBottom: 0 }}><label>Guardian name</label><input className="input" value={form.guardian_name} onChange={set("guardian_name")} placeholder="Parent / next of kin" data-testid="tag-guardian-name" /></div>
                      <div className="field" style={{ marginBottom: 0 }}><label>Guardian phone</label><input className="input" value={form.guardian_phone} onChange={set("guardian_phone")} placeholder="+91 …" data-testid="tag-guardian-phone" /></div>
                    </div>
                    <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Scanners can reach the guardian through a private masked call — the number stays hidden.</p>
                  </div>
                </>
              )}
              <div className="field"><label>Reward text (optional)</label><input className="input" value={form.reward_text} onChange={set("reward_text")} placeholder="Reward for safe return" data-testid="tag-reward" /></div>
              {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="add-tag-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-tag"><Plus size={17} /> {busy ? "Adding…" : "Add tag"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
