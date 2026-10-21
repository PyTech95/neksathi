import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { ACCENTS } from "@/pages/Cards";
import { ArrowLeft, Phone, Mail, Globe, MapPin } from "lucide-react";

export default function CardDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setC((await api.get(`/cards/${id}`)).data); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!c) return <div className="page container-nk"><p>Card not found.</p></div>;

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
