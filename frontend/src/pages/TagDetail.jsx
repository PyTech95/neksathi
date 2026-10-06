import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import api from "@/lib/api";
import { TAG_META } from "@/pages/Tags";
import { ArrowLeft, Copy, Check, ShieldAlert, ExternalLink, Download, Pencil, Save, Camera, Trash2, X } from "lucide-react";

const TAG_TYPES = Object.keys(TAG_META);
const TAG_PERSON = ["kid", "person", "patient", "staff"];

export default function TagDetail() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const scanUrl = t ? `${window.location.origin}/t/${t.qr_id}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try { setT((await api.get(`/tags/${id}`)).data); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const openEdit = () => {
    setForm({
      name: t.name || "", tag_type: t.tag_type || "bag", description: t.description || "",
      blood_group: t.blood_group || "", medical_notes: t.medical_notes || "", reward_text: t.reward_text || "",
      guardian_name: t.guardian_name || "", guardian_phone: t.guardian_phone || "", photo_base64: t.photo_base64 || "",
    });
    setEditing(true);
  };
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pickPhoto = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 320, canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setForm((f) => ({ ...f, photo_base64: canvas.toDataURL("image/jpeg", 0.82) }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { const r = await api.put(`/tags/${id}`, form); setT(r.data); setEditing(false); }
    finally { setSaving(false); }
  };

  const copy = () => { navigator.clipboard.writeText(scanUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const toggleLost = async () => { const r = await api.post(`/tags/${id}/lost_mode`, { enabled: !t.lost_mode }); setT(r.data); };
  const downloadQR = () => {
    const c = document.querySelector("#tag-qr canvas"); if (!c) return;
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `neksaathi-tag-${t.name}.png`; a.click();
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!t) return <div className="page container-nk"><p>Tag not found.</p></div>;
  const m = TAG_META[t.tag_type] || TAG_META.other;
  const editIsPerson = form && TAG_PERSON.includes(form.tag_type);

  return (
    <div className="page" data-testid="tag-detail-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <Link to="/tags" className="nav-link" style={{ display: "inline-flex", marginBottom: 18 }}><ArrowLeft size={16} /> Back to tags</Link>
        <div className="glass card-pad" style={{ padding: 28 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
            <div className="brand-badge" style={{ width: 46, height: 46, borderRadius: 12, overflow: "hidden" }}>{t.photo_base64 ? <img src={t.photo_base64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : m.icon}</div>
            <div style={{ flex: 1 }}><h1 style={{ fontSize: 26 }}>{t.name}</h1><p className="muted" style={{ fontSize: 14 }}>{m.label}{t.description ? ` · ${t.description}` : ""}</p></div>
            <button className="btn btn-ghost btn-sm" onClick={openEdit} data-testid="edit-tag-btn"><Pencil size={14} /> Edit</button>
          </div>
          {(t.blood_group || t.guardian_name) && (
            <div className="glass" style={{ padding: 12, marginBottom: 14, fontSize: 13 }} data-testid="tag-ice-summary">
              {t.blood_group && <span className="chip" style={{ marginRight: 8 }}>Blood: {t.blood_group}</span>}
              {t.guardian_name && <span className="chip">Guardian: {t.guardian_name}</span>}
            </div>
          )}
          <div className="center">
            <div id="tag-qr" className="qr-box" data-testid="tag-qr">
              <QRCodeCanvas value={scanUrl} size={200} level="H" fgColor="#07070d" includeMargin />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={copy} data-testid="copy-tag-link">{copied ? <><Check size={15} color="#22d3ee" /> Copied</> : <><Copy size={15} /> Copy link</>}</button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={downloadQR} data-testid="download-tag-qr"><Download size={15} /> PNG</button>
          </div>
          <a href={scanUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-block" style={{ marginTop: 10 }} data-testid="open-tag-public"><ExternalLink size={16} /> Preview public page</a>
          <button className={`btn btn-block ${t.lost_mode ? "btn-danger" : "btn-ghost"}`} style={{ marginTop: 10 }} onClick={toggleLost} data-testid="toggle-tag-lost">
            <ShieldAlert size={16} /> {t.lost_mode ? "Lost mode ON — turn off" : "Enable lost mode"}
          </button>
        </div>
      </div>

      {editing && form && (
        <div style={overlay} onClick={() => setEditing(false)} data-testid="tag-edit-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 500, padding: 26, maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><h2 style={{ fontSize: 22 }}>Edit tag</h2><button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setEditing(false)}><X size={16} /></button></div>
            <form onSubmit={save}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
                <div style={{ width: 72, height: 72, borderRadius: 14, background: "linear-gradient(135deg,#7c3aed,#22d3ee)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }} data-testid="tag-photo-preview">
                  {form.photo_base64 ? <img src={form.photo_base64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : m.icon}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: "none" }} data-testid="tag-photo-input" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} data-testid="tag-photo-btn"><Camera size={14} /> {form.photo_base64 ? "Change photo" : "Add photo"}</button>
                  {form.photo_base64 && <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setForm({ ...form, photo_base64: "" })} data-testid="tag-photo-remove"><Trash2 size={13} color="#ff3b5c" /></button>}
                </div>
              </div>
              <div className="grid grid-2">
                <div className="field"><label>Name</label><input className="input" value={form.name} onChange={setF("name")} required data-testid="edit-tag-name" /></div>
                <div className="field"><label>Type</label><select className="input" value={form.tag_type} onChange={setF("tag_type")} data-testid="edit-tag-type">{TAG_TYPES.map((k) => <option key={k} value={k}>{TAG_META[k].label}</option>)}</select></div>
              </div>
              <div className="field"><label>Description</label><input className="input" value={form.description} onChange={setF("description")} data-testid="edit-tag-desc" /></div>
              {editIsPerson && (
                <>
                  <div className="grid grid-2">
                    <div className="field"><label>Blood group</label><input className="input" value={form.blood_group} onChange={setF("blood_group")} data-testid="edit-tag-blood" placeholder="O+" /></div>
                    <div className="field"><label>Allergies / medical</label><input className="input" value={form.medical_notes} onChange={setF("medical_notes")} data-testid="edit-tag-medical" /></div>
                  </div>
                  <div className="grid grid-2">
                    <div className="field"><label>Guardian name</label><input className="input" value={form.guardian_name} onChange={setF("guardian_name")} data-testid="edit-tag-guardian-name" /></div>
                    <div className="field"><label>Guardian phone</label><input className="input" value={form.guardian_phone} onChange={setF("guardian_phone")} data-testid="edit-tag-guardian-phone" placeholder="+91 …" /></div>
                  </div>
                </>
              )}
              <button className="btn btn-primary btn-block" disabled={saving} data-testid="save-tag-edit">{saving ? "Saving…" : <><Save size={15} /> Save changes</>}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };

