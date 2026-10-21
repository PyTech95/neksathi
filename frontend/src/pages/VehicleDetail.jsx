import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, Check, Copy, ShieldAlert, UserPlus, Trash2, Phone, Navigation, Users, Car, Truck, QrCode } from "lucide-react";

const PLAN_PILL = { active: "pill-ok", grace: "pill-warn", expired: "pill-danger", none: "pill-muted" };

export default function VehicleDetail() {
  const { id } = useParams();
  const [v, setV] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cForm, setCForm] = useState({ name: "", phone: "", relation: "" });
  const [cErr, setCErr] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rv, rc] = await Promise.all([api.get(`/vehicles/${id}`), api.get(`/vehicles/${id}/contacts`)]);
      setV(rv.data); setContacts(rc.data);
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const toggleLost = async () => { const r = await api.post(`/vehicles/${id}/lost_mode`, { enabled: !v.lost_mode }); setV(r.data); };
  const createInvite = async () => { setInviteBusy(true); try { const r = await api.post(`/vehicles/${id}/invites`); setInviteUrl(r.data.join_url); } finally { setInviteBusy(false); } };
  const copyInvite = () => { navigator.clipboard.writeText(inviteUrl); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 1600); };

  const addContact = async (e) => {
    e.preventDefault(); setCErr("");
    try {
      await api.post(`/vehicles/${id}/contacts`, { ...cForm });
      setCForm({ name: "", phone: "", relation: "" });
      setContacts((await api.get(`/vehicles/${id}/contacts`)).data);
    } catch (e) { setCErr(e?.response?.data?.detail || "Could not add contact"); }
  };
  const delContact = async (cid) => { await api.delete(`/vehicles/${id}/contacts/${cid}`); setContacts(contacts.filter((c) => c.id !== cid)); };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!v) return <div className="page container-nk"><p>Vehicle not found.</p></div>;

  const ps = v.plan_status || "none";

  return (
    <div className="page" data-testid="vehicle-detail-page">
      <div className="container-nk">
        <Link to="/dashboard" className="nav-link" style={{ display: "inline-flex", marginBottom: 18 }}><ArrowLeft size={16} /> Back to garage</Link>
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          {/* Details panel */}
          <div className="glass card-pad" style={{ padding: 28 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
              <div className="brand-badge" style={{ width: 54, height: 54, borderRadius: 14, overflow: "hidden" }}>
                {v.photo_base64 ? <img src={v.photo_base64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Car size={24} />}
              </div>
              <div>
                <h1 style={{ fontSize: 28 }}>{v.number_plate}</h1>
                <p className="muted" style={{ textTransform: "capitalize", fontSize: 14 }}>{v.vehicle_type}{v.make_model ? ` · ${v.make_model}` : ""}{v.color ? ` · ${v.color}` : ""}</p>
              </div>
            </div>

            {/* details rows */}
            <div className="glass" style={{ padding: 14, borderRadius: 14, marginBottom: 16, fontSize: 14 }} data-testid="vehicle-details">
              <Row label="Number plate" value={v.number_plate} />
              <Row label="Type" value={v.vehicle_type} cap />
              {v.make_model && <Row label="Make & model" value={v.make_model} />}
              {v.color && <Row label="Color" value={v.color} cap />}
              <Row label="Speed limit" value={`${v.speed_limit_kmh} km/h`} />
            </div>

            {/* plan / order status */}
            {v.qr_ordered ? (
              <div className="glass" style={{ padding: 16, borderRadius: 14, marginBottom: 14 }} data-testid="vehicle-plan">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>QR plan</div>
                    <span className={`pill ${PLAN_PILL[ps]}`}>
                      {ps === "active" ? `Active · ${v.plan_days_left} days left` : ps === "grace" ? "Expired (grace period)" : ps === "expired" ? "Expired" : "Order placed — activates on delivery"}
                    </span>
                  </div>
                  {v.plan_expires_at && <div style={{ textAlign: "right" }}><div className="muted" style={{ fontSize: 12 }}>Valid till</div><b>{new Date(v.plan_expires_at).toLocaleDateString()}</b></div>}
                </div>
                {v.qr_order_id && (
                  <Link to={`/orders/${v.qr_order_id}`} className="btn btn-primary btn-sm btn-block" style={{ marginTop: 12 }} data-testid="track-order">
                    <Truck size={15} /> Track order {(ps === "expired" || ps === "grace") ? "& recharge" : "& delivery"}
                  </Link>
                )}
              </div>
            ) : (
              <Link to={`/buy-qr/${v.id}`} className="btn btn-primary btn-block" style={{ marginBottom: 14 }} data-testid="order-qr"><QrCode size={16} /> Order QR / Plan</Link>
            )}

            <button className={`btn btn-block ${v.lost_mode ? "btn-danger" : "btn-ghost"}`} onClick={toggleLost} data-testid="toggle-lost-mode">
              <ShieldAlert size={16} /> {v.lost_mode ? "Lost mode ON — turn off" : "Enable lost mode"}
            </button>
            <Link to={`/track/${id}`} className="btn btn-ghost btn-block" style={{ marginTop: 10 }} data-testid="live-tracking-link"><Navigation size={16} /> Live tracking & speed</Link>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={createInvite} disabled={inviteBusy} data-testid="invite-family-btn"><Users size={16} /> {inviteBusy ? "Generating…" : "Invite family"}</button>
            {inviteUrl && (
              <div className="glass" style={{ marginTop: 10, padding: 12 }} data-testid="invite-url-box">
                <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Share this link — relatives who accept see this vehicle's alerts:</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" readOnly value={inviteUrl} data-testid="invite-url" style={{ fontSize: 12 }} />
                  <button className="btn btn-primary btn-sm" onClick={copyInvite} data-testid="copy-invite-btn">{inviteCopied ? <Check size={14} /> : <Copy size={14} />}</button>
                </div>
              </div>
            )}
          </div>

          {/* Contacts panel */}
          <div className="glass card-pad" style={{ padding: 28 }}>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>Family <span className="neon">contacts</span></h2>
            <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>Up to 4 trusted people who get alerted when your QR is scanned.</p>
            {contacts.length === 0 && <p className="muted" data-testid="no-contacts" style={{ marginBottom: 16 }}>No contacts added yet.</p>}
            <div style={{ marginBottom: 18 }}>
              {contacts.map((c) => (
                <div key={c.id} className="alert-row" data-testid={`contact-${c.name}`} style={{ padding: "12px 0" }}>
                  <div className="alert-ico" style={{ background: "rgba(179,18,47,.16)" }}><Phone size={18} color="#e92546" /></div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{c.name}</div><div className="muted" style={{ fontSize: 13 }}>{c.phone}{c.relation ? ` · ${c.relation}` : ""}</div></div>
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

function Row({ label, value, cap }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      <span className="muted">{label}</span>
      <b style={{ textTransform: cap ? "capitalize" : "none" }}>{value}</b>
    </div>
  );
}
