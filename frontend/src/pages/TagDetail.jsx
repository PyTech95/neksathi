import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import api from "@/lib/api";
import { TAG_META } from "@/pages/Tags";
import { ArrowLeft, Copy, Check, ShieldAlert, ExternalLink, Download } from "lucide-react";

export default function TagDetail() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const scanUrl = t ? `${window.location.origin}/t/${t.qr_id}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try { setT((await api.get(`/tags/${id}`)).data); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const copy = () => { navigator.clipboard.writeText(scanUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const toggleLost = async () => { const r = await api.post(`/tags/${id}/lost_mode`, { enabled: !t.lost_mode }); setT(r.data); };
  const downloadQR = () => {
    const c = document.querySelector("#tag-qr canvas"); if (!c) return;
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `neksaathi-tag-${t.name}.png`; a.click();
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (!t) return <div className="page container-nk"><p>Tag not found.</p></div>;
  const m = TAG_META[t.tag_type] || TAG_META.other;

  return (
    <div className="page" data-testid="tag-detail-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <Link to="/tags" className="nav-link" style={{ display: "inline-flex", marginBottom: 18 }}><ArrowLeft size={16} /> Back to tags</Link>
        <div className="glass card-pad" style={{ padding: 28 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
            <div className="brand-badge" style={{ width: 46, height: 46, borderRadius: 12 }}>{m.icon}</div>
            <div><h1 style={{ fontSize: 26 }}>{t.name}</h1><p className="muted" style={{ fontSize: 14 }}>{m.label}{t.description ? ` · ${t.description}` : ""}</p></div>
          </div>
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
    </div>
  );
}
