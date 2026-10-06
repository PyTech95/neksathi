import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { API } from "@/lib/api";
import { ACCENTS } from "@/pages/Cards";
import { Phone, Mail, Globe, MapPin, Download, Twitter, Linkedin, Instagram, Github, MessageCircle, Send, CheckCircle2 } from "lucide-react";

const SOCIAL_ICON = { twitter: <Twitter size={18} />, linkedin: <Linkedin size={18} />, instagram: <Instagram size={18} />, github: <Github size={18} />, whatsapp: <MessageCircle size={18} /> };
const socialUrl = (k, v) => {
  if (/^https?:\/\//i.test(v)) return v;
  const u = v.replace(/^@/, "");
  return { twitter: `https://twitter.com/${u}`, linkedin: `https://linkedin.com/in/${u}`, instagram: `https://instagram.com/${u}`, github: `https://github.com/${u}`, whatsapp: `https://wa.me/${u.replace(/[^0-9]/g, "")}` }[k] || v;
};

export default function PublicCard() {
  const { qrId } = useParams();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [msg, setMsg] = useState({ from_name: "", from_phone: "", from_email: "", body: "" });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/public/card/${qrId}`).then((r) => setC(r.data)).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [qrId]);

  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post(`/public/card/${qrId}/message`, { ...msg }); setSent(true); }
    catch (e) { alert(e?.response?.data?.detail || "Could not send"); } finally { setBusy(false); }
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (notFound) return <div className="page container-nk center"><div className="glass card-pad" style={{ maxWidth: 460, margin: "40px auto", padding: 40 }} data-testid="card-not-found"><h1 style={{ fontSize: 28 }}>Card not found</h1></div></div>;

  const accent = ACCENTS[c.accent] || ACCENTS.neon;
  const vcfUrl = `${API}/public/card/${qrId}/vcf?dl=1`;
  const socials = Object.entries(c.socials || {}).filter(([, v]) => v);

  return (
    <div className="page" data-testid="public-card-page">
      <div className="container-nk" style={{ maxWidth: 480 }}>
        <div className="glass card-pad" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ height: 90, background: accent }} />
          <div className="card-pad" style={{ padding: 26, marginTop: -46 }}>
            <div style={{ width: 92, height: 92, borderRadius: 24, background: accent, display: "grid", placeItems: "center", fontFamily: "Chakra Petch", fontSize: 38, fontWeight: 700, border: "3px solid #0d0d1a", overflow: "hidden" }}>
              {c.photo_base64 ? <img src={c.photo_base64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (c.display_name?.[0] || "?")}
            </div>
            <h1 style={{ fontSize: 28, marginTop: 14 }} data-testid="card-public-name">{c.display_name}</h1>
            <p className="muted" style={{ fontSize: 15 }}>{[c.title, c.company].filter(Boolean).join(" · ")}</p>
            {c.bio && <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.55 }}>{c.bio}</p>}

            <a href={vcfUrl} className="btn btn-primary btn-block" style={{ marginTop: 18 }} data-testid="save-contact-btn"><Download size={17} /> Save contact (vCard)</a>

            <div className="grid grid-2" style={{ marginTop: 14, gap: 10 }}>
              {c.phone && <a href={`tel:${c.phone}`} className="btn btn-ghost btn-sm" style={{ justifyContent: "center" }} data-testid="card-call"><Phone size={15} /> Call</a>}
              {c.email && <a href={`mailto:${c.email}`} className="btn btn-ghost btn-sm" style={{ justifyContent: "center" }} data-testid="card-mail"><Mail size={15} /> Email</a>}
              {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ justifyContent: "center" }} data-testid="card-web"><Globe size={15} /> Website</a>}
              {c.address && <span className="btn btn-ghost btn-sm" style={{ justifyContent: "center" }}><MapPin size={15} /> {c.address.slice(0, 18)}</span>}
            </div>

            {socials.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                {socials.map(([k, v]) => (
                  <a key={k} href={socialUrl(k, v)} target="_blank" rel="noreferrer" className="chip" style={{ padding: "9px 12px" }} data-testid={`card-social-link-${k}`}>{SOCIAL_ICON[k] || null} {k}</a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Contact form */}
        <div className="glass card-pad" style={{ padding: 24, marginTop: 18 }}>
          {sent ? (
            <div className="center" data-testid="card-message-sent" style={{ padding: 10 }}>
              <CheckCircle2 size={44} color="#22d3ee" />
              <h3 style={{ fontSize: 20, marginTop: 10 }}>Message sent!</h3>
              <p className="muted">{c.display_name} will get back to you.</p>
            </div>
          ) : (
            <form onSubmit={send}>
              <h3 style={{ fontSize: 19, marginBottom: 12 }}>Leave a message</h3>
              <div className="field"><label>Your name</label><input className="input" value={msg.from_name} onChange={(e) => setMsg({ ...msg, from_name: e.target.value })} required data-testid="msg-name" /></div>
              <div className="grid grid-2">
                <div className="field"><label>Phone (optional)</label><input className="input" value={msg.from_phone} onChange={(e) => setMsg({ ...msg, from_phone: e.target.value })} data-testid="msg-phone" /></div>
                <div className="field"><label>Email (optional)</label><input className="input" value={msg.from_email} onChange={(e) => setMsg({ ...msg, from_email: e.target.value })} data-testid="msg-email" /></div>
              </div>
              <div className="field"><label>Message</label><textarea className="input" rows={3} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} required data-testid="msg-body" /></div>
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="send-message-btn"><Send size={16} /> {busy ? "Sending…" : "Send message"}</button>
            </form>
          )}
        </div>
        <p className="center muted" style={{ marginTop: 22, fontSize: 12 }}>Powered by Nek Sathi · Share Tap</p>
      </div>
    </div>
  );
}
