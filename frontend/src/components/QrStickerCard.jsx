import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { QrCode, Download, FileText, Loader2, Printer } from "lucide-react";

// Shows the owner their own branded Nek Sathi QR sticker (same design as the
// printed one) with PNG / PDF download. Auth-protected images are fetched as
// blobs (an <img src> can't send the bearer token), then shown via object URL.
export default function QrStickerCard({ kind, id }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false); // sticker not printed yet (409)
  const [busy, setBusy] = useState("");
  const objUrl = useRef(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    setPending(false);
    api
      .get(`/me/${kind}s/${id}/sticker.png`, { responseType: "blob" })
      .then((r) => {
        if (!alive) return;
        if (objUrl.current) URL.revokeObjectURL(objUrl.current);
        const u = URL.createObjectURL(r.data);
        objUrl.current = u;
        setImgUrl(u);
      })
      .catch((e) => {
        if (!alive) return;
        // 409 = QR not printed yet: show a friendly "being prepared" state, not an error.
        if (e?.response?.status === 409) setPending(true);
        else setErr("Couldn't load your QR. Pull to refresh or try again.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; if (objUrl.current) { URL.revokeObjectURL(objUrl.current); objUrl.current = null; } };
  }, [kind, id]);

  const download = async (ext) => {
    setBusy(ext);
    try {
      const r = await api.get(`/me/${kind}s/${id}/sticker.${ext}`, { responseType: "blob" });
      const u = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = u;
      a.download = `neksathi-qr.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 2000);
    } catch (_) {
      alert("Download failed. Please try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="glass card-pad" style={{ padding: 20, marginTop: 16 }} data-testid="qr-sticker-card">
      <h3 style={{ fontSize: 17, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <QrCode size={18} /> Your QR code
      </h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Show, save or print this QR. Anyone who scans it can alert you — your number stays private.
      </p>

      {loading ? (
        <div className="center" style={{ padding: 30 }}><Loader2 className="spin" size={26} /></div>
      ) : pending ? (
        <div className="center" style={{ padding: "22px 16px", textAlign: "center" }} data-testid="qr-sticker-pending">
          <div className="brand-badge" style={{ width: 46, height: 46, borderRadius: 12, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Printer size={22} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Your QR is being prepared</p>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            It will appear here once we've printed your sticker. We'll notify you — track progress above.
          </p>
        </div>
      ) : err ? (
        <p className="muted" style={{ fontSize: 13 }} data-testid="qr-sticker-error">{err}</p>
      ) : (
        <>
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <img
              src={imgUrl}
              alt="Your Nek Sathi QR sticker"
              data-testid="qr-sticker-img"
              style={{ width: "100%", maxWidth: 280, borderRadius: 12, boxShadow: "0 6px 24px rgba(0,0,0,.25)" }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button className="btn btn-primary" disabled={busy === "png"} onClick={() => download("png")} data-testid="qr-download-png">
              {busy === "png" ? <Loader2 className="spin" size={16} /> : <Download size={16} />} PNG
            </button>
            <button className="btn btn-ghost" disabled={busy === "pdf"} onClick={() => download("pdf")} data-testid="qr-download-pdf">
              {busy === "pdf" ? <Loader2 className="spin" size={16} /> : <FileText size={16} />} PDF
            </button>
          </div>
        </>
      )}
    </div>
  );
}
