import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { TAG_META } from "@/pages/Tags";
import { PackageSearch, Siren, Lock, AlertTriangle, MessageCircle, CheckCircle2, MapPin, HeartPulse, Phone, Loader2, ShieldPlus } from "lucide-react";

const ACTIONS = [
  { type: "found", label: "I Found This", icon: <PackageSearch size={28} />, bg: "linear-gradient(100deg,#059669,#10b981)" },
  { type: "emergency", label: "Emergency", icon: <Siren size={28} />, bg: "linear-gradient(100deg,#e11d48,#ff3b5c)" },
  { type: "theft", label: "Report Theft", icon: <Lock size={28} />, bg: "linear-gradient(100deg,#7c3aed,#8b5cf6)" },
  { type: "damage", label: "Report Damage", icon: <AlertTriangle size={28} />, bg: "linear-gradient(100deg,#f59e0b,#f5a524)" },
  { type: "contact", label: "Contact Owner", icon: <MessageCircle size={28} />, bg: "linear-gradient(100deg,#0891b2,#22d3ee)" },
];
const PERSON_TYPES = ["kid", "person", "patient", "staff"];

export default function PublicTag() {
  const { qrId } = useParams();
  const [tag, setTag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [coords, setCoords] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [call, setCall] = useState(null);
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    api.get(`/public/tag/${qrId}`).then((r) => setTag(r.data)).catch(() => setNotFound(true)).finally(() => setLoading(false));
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 6000 });
  }, [qrId]);

  const send = async (type) => {
    setBusy(true);
    try {
      await api.post(`/public/tag/${qrId}/alert`, { type, scanner_note: note || null, scanner_phone: phone || null, scanner_lat: coords?.lat ?? null, scanner_lng: coords?.lng ?? null });
      setSent(true);
    } catch (e) { alert(e?.response?.data?.detail || "Could not send"); } finally { setBusy(false); }
  };

  const callGuardian = async () => {
    setCalling(true);
    try { setCall((await api.post(`/public/tag/${qrId}/call`, { scanner_phone: phone || null })).data); }
    catch (e) { alert(e?.response?.data?.detail || "Call failed"); } finally { setCalling(false); }
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (notFound) return <div className="page container-nk center"><div className="glass card-pad" style={{ maxWidth: 460, margin: "40px auto", padding: 40 }} data-testid="tag-not-found"><h1 style={{ fontSize: 28 }}>Tag not found</h1><p className="muted">This QR is not registered.</p></div></div>;
  if (sent) return <div className="page container-nk center"><div className="glass card-pad" style={{ maxWidth: 460, margin: "40px auto", padding: 44 }} data-testid="tag-scan-success"><CheckCircle2 size={64} color="#22d3ee" /><h1 style={{ fontSize: 30, margin: "16px 0 8px" }}>Owner notified!</h1><p className="muted" style={{ fontSize: 16 }}>Thank you for helping {tag.owner_first_name}. 🙏</p></div></div>;

  const m = TAG_META[tag.tag_type] || TAG_META.other;
  const isPerson = PERSON_TYPES.includes(tag.tag_type);
  return (
    <div className="page" data-testid="public-tag-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <div className="glass card-pad" style={{ padding: 26, marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div className="brand-badge" style={{ width: 52, height: 52, borderRadius: 14 }}>{m.icon}</div>
            <div><div className="chip" data-testid="tag-scan-name">{tag.name}</div><p className="muted" style={{ marginTop: 6, fontSize: 14 }}>{m.label}{tag.description ? ` · ${tag.description}` : ""}</p></div>
          </div>
          {tag.lost_mode && <div className="chip" style={{ marginTop: 14, background: "rgba(255,59,92,.16)", borderColor: "rgba(255,59,92,.4)", color: "#ffb3c0" }}>⚠️ Marked as LOST{tag.reward_text ? ` · ${tag.reward_text}` : ""}</div>}

          {isPerson && (tag.blood_group || tag.medical_notes || tag.has_guardian) && (
            <div className="glass" style={{ marginTop: 14, padding: 16, borderColor: "rgba(255,59,92,.45)", background: "rgba(255,59,92,.06)" }} data-testid="ice-card">
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <ShieldPlus size={18} color="#ff3b5c" />
                <b style={{ fontSize: 15, color: "#ffb3c0" }}>In case of emergency (ICE)</b>
              </div>
              {tag.blood_group && <div style={{ fontSize: 14, marginBottom: 4 }}><HeartPulse size={14} style={{ verticalAlign: "-2px", color: "#ff3b5c" }} /> Blood group: <b>{tag.blood_group}</b></div>}
              {tag.medical_notes && <div className="muted" style={{ fontSize: 14, marginBottom: 4 }}>Medical: {tag.medical_notes}</div>}
              {tag.guardian_name && <div className="muted" style={{ fontSize: 14, marginBottom: 10 }}>Guardian: <b style={{ color: "#fff" }}>{tag.guardian_name}</b></div>}
              {tag.has_guardian && (
                call ? (
                  <div data-testid="tag-call-connecting" style={{ marginTop: 4 }}>
                    {call.status === "need_phone" ? (
                      <>
                        <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{call.note}</p>
                        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" data-testid="tag-call-phone" style={{ marginBottom: 8 }} />
                        <button className="btn btn-danger btn-block" disabled={calling || !phone} onClick={callGuardian} data-testid="tag-call-retry"><Phone size={16} /> Connect me</button>
                      </>
                    ) : (
                      <div className="center" style={{ padding: 6 }}>
                        <Phone size={30} color="#22d3ee" />
                        <p style={{ fontSize: 14, marginTop: 6 }}>{call.status === "calling" ? "Calling you now…" : "Connecting privately…"}</p>
                        <p className="muted" style={{ fontSize: 13 }}>{call.note}</p>
                        {call.portal_number && <a href={`tel:${(call.portal_number || "").replace(/\s/g, "")}`} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} data-testid="tag-dial-portal"><Phone size={14} /> Dial portal</a>}
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="btn btn-danger btn-block" disabled={calling} onClick={callGuardian} data-testid="call-guardian-btn">
                    {calling ? <Loader2 size={16} className="spin" /> : <Phone size={16} />} Call guardian (private)
                  </button>
                )
              )}
            </div>
          )}

          <p className="muted" style={{ marginTop: 16, fontSize: 15 }}>You're helping <b style={{ color: "#fff" }}>{tag.owner_first_name}</b>. Owner's number stays private.</p>
          <div style={{ marginTop: 10, fontSize: 13 }} className="muted"><MapPin size={13} style={{ verticalAlign: "-2px" }} /> {coords ? "Location ready" : "Location unavailable (optional)"}</div>
        </div>

        <div className="grid" style={{ gap: 12, marginBottom: 22 }}>
          {ACTIONS.map((a) => (
            <button key={a.type} className="big-action" style={{ background: a.bg, fontSize: 20 }} disabled={busy} onClick={() => send(a.type)} data-testid={`tag-alert-${a.type}`}>{a.icon} {a.label}</button>
          ))}
        </div>
        <div className="glass card-pad" style={{ padding: 22 }}>
          <div className="field"><label>Message / note (optional)</label><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="tag-note" /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Your callback number (optional)</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="tag-phone" /></div>
        </div>
        <p className="center muted" style={{ marginTop: 26, fontSize: 12 }}>Powered by Nek Sathi</p>
      </div>
    </div>
  );
}
