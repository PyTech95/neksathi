import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { QrCode, X, RefreshCw, ExternalLink, ScanLine } from "lucide-react";

// Paths that belong to this app and can be opened directly via the router.
const APP_PREFIXES = ["/scan/", "/t/", "/c/", "/live/", "/claim/", "/track/", "/vehicle/", "/tag/", "/card/"];

export default function Scanner() {
  const nav = useNavigate();
  const scannerRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | scanning | error | done
  const [error, setError] = useState("");
  const [decoded, setDecoded] = useState(null);

  const stop = async () => {
    const s = scannerRef.current;
    if (s) { try { if (s.isScanning) await s.stop(); await s.clear(); } catch (_) {} scannerRef.current = null; }
  };

  const handleDecoded = async (text) => {
    await stop();
    setDecoded(text);
    setStatus("done");
    try {
      const u = new URL(text, window.location.origin);
      const path = u.pathname + u.search;
      const sameOrigin = u.origin === window.location.origin;
      const isAppPath = APP_PREFIXES.some((p) => path.startsWith(p));
      if (sameOrigin && isAppPath) { nav(path); return; }
      if (isAppPath) { nav(path); return; } // relative app path encoded
    } catch (_) { /* not a URL */ }
  };

  const start = async () => {
    setError(""); setDecoded(null); setStatus("starting");
    try {
      const scanner = new Html5Qrcode("qr-reader", { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => handleDecoded(text),
        () => {}
      );
      setStatus("scanning");
    } catch (e) {
      setError(typeof e === "string" ? e : (e?.message || "Could not access the camera. Grant camera permission and try again."));
      setStatus("error");
    }
  };

  useEffect(() => { start(); return () => { stop(); }; /* eslint-disable-next-line */ }, []);

  return (
    <div className="container" style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px" }} data-testid="scanner-page">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(34,211,238,.16)", border: "1px solid rgba(34,211,238,.4)", color: "#22d3ee" }}><ScanLine size={20} /></span>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Scan a Nek Sathi QR</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Point your camera at any Nek Sathi tag, card or vehicle sticker.</p>
        </div>
      </div>

      <div className="glass" style={{ borderRadius: 18, padding: 12, marginTop: 14 }}>
        <div id="qr-reader" data-testid="qr-reader" style={{ width: "100%", maxHeight: 360, borderRadius: 12, overflow: "hidden", minHeight: 260, background: "#05050b" }} />

        {status === "starting" && <p className="muted" data-testid="scanner-starting" style={{ textAlign: "center", marginTop: 12 }}>Starting camera…</p>}
        {status === "scanning" && <p className="muted" data-testid="scanner-scanning" style={{ textAlign: "center", marginTop: 12 }}>Scanning… hold steady over the QR code.</p>}

        {status === "error" && (
          <div data-testid="scanner-error" style={{ marginTop: 12, textAlign: "center" }}>
            <p style={{ color: "#ff7591", fontSize: 14 }}>{error}</p>
            <button className="btn btn-primary" data-testid="scanner-retry" onClick={start}><RefreshCw size={16} /> Try again</button>
          </div>
        )}

        {status === "done" && (
          <div data-testid="scanner-result" style={{ marginTop: 12, textAlign: "center" }}>
            <p style={{ fontSize: 13, wordBreak: "break-all" }} data-testid="scanner-decoded"><QrCode size={14} /> {decoded}</p>
            {(() => { try { const u = new URL(decoded, window.location.origin); return (<a className="btn btn-primary" data-testid="scanner-open" href={u.href} target={u.origin === window.location.origin ? "_self" : "_blank"} rel="noreferrer"><ExternalLink size={16} /> Open</a>); } catch (_) { return null; } })()}
            <button className="btn btn-ghost" data-testid="scanner-again" onClick={start} style={{ marginLeft: 8 }}><RefreshCw size={16} /> Scan another</button>
          </div>
        )}
      </div>

      <button className="btn btn-ghost btn-block" data-testid="scanner-close" onClick={() => nav(-1)} style={{ marginTop: 14 }}><X size={16} /> Close</button>
    </div>
  );
}
