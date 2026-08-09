import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import api from "@/lib/api";
import { ArrowLeft, Copy, Check, ShieldAlert, ExternalLink, UserPlus, Trash2, Phone, Download, Navigation, Users } from "lucide-react";

export default function VehicleDetail() {
  const { id } = useParams();
  const [v, setV] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cForm, setCForm] = useState({ name: "", phone: "", relation: "" });
  const [cErr, setCErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  const scanUrl = v ? `${window.location.origin}/scan/${v.qr_id}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rv, rc] = await Promise.all([
        api.get(`/vehicles/${id}`),
        api.get(`/vehicles/${id}/contacts`),
      ]);
      setV(rv.data);
      setContacts(rc.data);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const copy = () => {
    navigator.clipboard.writeText(scanUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const toggleLost = async () => {
    const r = await api.post(`/vehicles/${id}/lost_mode`, { enabled: !v.lost_mode });
    setV(r.data);
  };

  const addContact = async (e) => {
    e.preventDefault();
    setCErr("");
    try {
      await api.post(`/vehicles/${id}/contacts`, { ...cForm });
      setCForm({ name: "", phone: "", relation: "" });
      const rc = await api.get(`/vehicles/${id}/contacts`);
      setContacts(rc.data);
    } catch (e) {
      setCErr(e?.response?.data?.detail || "Could not add contact");
    }
  };

  const delContact = async (cid) => {
    await api.delete(`/vehicles/${id}/contacts/${cid}`);
    setContacts(contacts.filter((c) => c.id !== cid));
  };

  const downloadQR = () => {
    const canvas = document.querySelector("#vehicle-qr canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `neksaathi-${v.number_plate}.png`;
    a.click();
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!v) return <div className="page container-nk"><p>Vehicle not found.</p></div>;

  return (
    <div className="page" data-testid="vehicle-detail-page">
      <div className="container-nk">
        <Link to="/dashboard" className="nav-link" style={{ display: "inline-flex", marginBottom: 18 }}><ArrowLeft size={16} /> Back to garage</Link>
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          {/* QR panel */}
          <div className="glass card-pad" style={{ padding: 28 }}>
            <h1 style={{ fontSize: 30 }}>{v.number_plate}</h1>
            <p className="muted" style={{ textTransform: "capitalize", marginBottom: 20 }}>{v.vehicle_type}{v.make_model ? ` · ${v.make_model}` : ""}{v.color ? ` · ${v.color}` : ""}</p>
            <div className="center">
              <div id="vehicle-qr" className="qr-box" data-testid="vehicle-qr">
                <QRCodeCanvas value={scanUrl} size={200} level="H" fgColor="#07070d" includeMargin />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={copy} data-testid="copy-scan-link">
                {copied ? <><Check size={15} color="#22d3ee" /> Copied</> : <><Copy size={15} /> Copy link</>}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={downloadQR} data-testid="download-qr"><Download size={15} /> PNG</button>
            </div>
            <a href={scanUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-block" style={{ marginTop: 10 }} data-testid="open-public-page"><ExternalLink size={16} /> Preview public page</a>

            <button className={`btn btn-block ${v.lost_mode ? "btn-danger" : "btn-ghost"}`} style={{ marginTop: 10 }} onClick={toggleLost} data-testid="toggle-lost-mode">
              <ShieldAlert size={16} /> {v.lost_mode ? "Lost mode ON — turn off" : "Enable lost mode"}
            </button>
          </div>

          {/* Contacts panel */}
          <div className="glass card-pad" style={{ padding: 28 }}>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>Family <span className="neon">contacts</span></h2>
            <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>Up to 4 trusted people who get alerted when your QR is scanned.</p>

            {contacts.length === 0 && <p className="muted" data-testid="no-contacts" style={{ marginBottom: 16 }}>No contacts added yet.</p>}
            <div style={{ marginBottom: 18 }}>
              {contacts.map((c) => (
                <div key={c.id} className="alert-row" data-testid={`contact-${c.name}`} style={{ padding: "12px 0" }}>
                  <div className="alert-ico" style={{ background: "rgba(124,58,237,.16)" }}><Phone size={18} color="#22d3ee" /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{c.phone}{c.relation ? ` · ${c.relation}` : ""}</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => delContact(c.id)} data-testid={`del-contact-${c.name}`}><Trash2 size={14} color="#ff3b5c" /></button>
                </div>
              ))}
            </div>

            {contacts.length < 4 && (
              <form onSubmit={addContact}>
                <div className="grid grid-2">
                  <div className="field"><label>Name</label><input className="input" value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} required data-testid="contact-name" /></div>
                  <div className="field"><label>Phone</label><input className="input" value={cForm.phone} onChange={(e) => setCForm({ ...cForm, phone: e.target.value })} required data-testid="contact-phone" /></div>
                </div>
                <div className="field"><label>Relation (optional)</label><input className="input" value={cForm.relation} onChange={(e) => setCForm({ ...cForm, relation: e.target.value })} placeholder="Spouse, parent…" data-testid="contact-relation" /></div>
                {cErr && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 10 }} data-testid="contact-error">{cErr}</p>}
                <button className="btn btn-primary btn-block" data-testid="add-contact-btn"><UserPlus size={16} /> Add contact</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
