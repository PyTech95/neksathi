import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import api from "@/lib/api";
import { ACCENTS } from "@/pages/Cards";
import { ArrowLeft, Copy, Check, ExternalLink, Download } from "lucide-react";

export default function CardDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const scanUrl = c ? `${window.location.origin}/c/${c.qr_id}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try { setC((await api.get(`/cards/${id}`)).data); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const copy = () => { navigator.clipboard.writeText(scanUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const downloadQR = () => { const cv = document.querySelector("#card-qr canvas"); if (!cv) return; const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = `neksaathi-card-${c.display_name}.png`; a.click(); };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!c) return <div className="page container-nk"><p>Card not found.</p></div>;

  return (
    <div className="page" data-testid="card-detail-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <Link to="/cards" className="nav-link" style={{ display: "inline-flex", marginBottom: 18 }}><ArrowLeft size={16} /> Back to cards</Link>
        <div className="glass card-pad" style={{ padding: 28 }}>
          <div style={{ height: 10, borderRadius: 8, background: ACCENTS[c.accent] || ACCENTS.neon, marginBottom: 18 }} />
          <h1 style={{ fontSize: 28 }}>{c.display_name}</h1>
          <p className="muted" style={{ marginBottom: 18 }}>{[c.title, c.company].filter(Boolean).join(" · ")}</p>
          <div className="center">
            <div id="card-qr" className="qr-box" data-testid="card-qr">
              <QRCodeCanvas value={scanUrl} size={200} level="H" fgColor="#07070d" includeMargin />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={copy} data-testid="copy-card-link">{copied ? <><Check size={15} color="#22d3ee" /> Copied</> : <><Copy size={15} /> Copy link</>}</button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={downloadQR} data-testid="download-card-qr"><Download size={15} /> PNG</button>
          </div>
          <a href={scanUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-block" style={{ marginTop: 10 }} data-testid="open-card-public"><ExternalLink size={16} /> Preview public card</a>
        </div>
      </div>
    </div>
  );
}
