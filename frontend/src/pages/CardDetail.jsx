import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import api, { PUBLIC_WEB } from "@/lib/api";
import { QRCodeCanvas } from "qrcode.react";
import { ACCENTS } from "@/pages/Cards";
import { ArrowLeft, Phone, Mail, Globe, MapPin, Download, Copy, Check, ExternalLink, QrCode } from "lucide-react";

export default function CardDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setC((await api.get(`/cards/${id}`)).data); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!c) return <div className="page container-nk"><p>Card not found.</p></div>;

  // Public page a scanner lands on — shows the card's details + "save contact".
  const publicUrl = `${PUBLIC_WEB}/c/${c.qr_id}`;

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    try {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `neksathi-card-${(c.display_name || "card").replace(/\s+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (_) { /* ignore */ }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch (_) { /* clipboard blocked — the link is shown below to copy manually */ }
  };

  return (
    <div className="page" data-testid="card-detail-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <Link to="/cards" className="nav-link" style={{ display: "inline-flex", marginBottom: 18 }}><ArrowLeft size={16} /> Back to cards</Link>
        <div className="glass card-pad" style={{ padding: 28 }}>
          <div style={{ height: 10, borderRadius: 8, background: ACCENTS[c.accent] || ACCENTS.neon, marginBottom: 18 }} />
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
            {c.photo_base64 && <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}><img src={c.photo_base64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>}
            <div>
              <h1 style={{ fontSize: 26 }}>{c.display_name}</h1>
              <p className="muted">{[c.title, c.company].filter(Boolean).join(" · ")}</p>
            </div>
          </div>

          {c.bio && <p style={{ fontSize: 14, marginBottom: 14 }}>{c.bio}</p>}

          <div className="glass" style={{ padding: 14, borderRadius: 14, fontSize: 14 }} data-testid="card-details">
            {c.phone && <ContactRow icon={<Phone size={15} />} value={c.phone} href={`tel:${c.phone}`} />}
            {c.email && <ContactRow icon={<Mail size={15} />} value={c.email} href={`mailto:${c.email}`} />}
            {c.website && <ContactRow icon={<Globe size={15} />} value={c.website} href={c.website.startsWith("http") ? c.website : `https://${c.website}`} />}
            {c.address && <ContactRow icon={<MapPin size={15} />} value={c.address} />}
            {!c.phone && !c.email && !c.website && !c.address && <p className="muted" style={{ margin: 0 }}>No contact details added yet. Use Edit on the cards page.</p>}
          </div>

          {/* QR code + share — scan opens the public card, download/save the QR */}
          <div className="glass" style={{ padding: 18, borderRadius: 14, marginTop: 16, textAlign: "center" }} data-testid="card-qr">
            <h3 style={{ fontSize: 15, margin: "0 0 4px", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}><QrCode size={16} /> Your card QR</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: "0 0 14px" }}>Anyone who scans this sees your card and can save your contact.</p>
            <div ref={qrRef} style={{ display: "inline-block", background: "#fff", padding: 14, borderRadius: 14 }}>
              <QRCodeCanvas value={publicUrl} size={190} level="M" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
              <button className="btn btn-primary" onClick={downloadQr} data-testid="card-qr-download"><Download size={16} /> Download</button>
              <button className="btn btn-ghost" onClick={copyLink} data-testid="card-qr-copy">{copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy link</>}</button>
            </div>
            <a href={publicUrl} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 5, marginTop: 12, wordBreak: "break-all", justifyContent: "center" }} data-testid="card-qr-open"><ExternalLink size={13} /> {publicUrl}</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon, value, href }) {
  const inner = <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><span style={{ color: "var(--accent)" }}>{icon}</span>{value}</span>;
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      {href ? <a href={href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{inner}</a> : inner}
    </div>
  );
}
