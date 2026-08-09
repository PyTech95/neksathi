import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api, { API } from "@/lib/api";
import { QrCode, Plus, Download, Printer, Ban, CheckCircle2, ArrowLeft, Store, Loader2 } from "lucide-react";

const STATUS_LABEL = { unclaimed: "Available", sold: "Sold (dealer)", assigned: "Activated", blocked: "Blocked" };
const STATUS_COLOR = { unclaimed: "#22d3ee", sold: "#f5a524", assigned: "#10b981", blocked: "#ff3b5c" };

export default function AdminQR() {
  const [batches, setBatches] = useState([]);
  const [inv, setInv] = useState([]);
  const [statusF, setStatusF] = useState("");
  const [q, setQ] = useState("");
  const [gen, setGen] = useState({ count: 100, batch_label: "", product_type: "", org_name: "", org_id: "" });
  const [orgs, setOrgs] = useState([]);
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [sold, setSold] = useState({ serial_from: "", serial_to: "", vendor_name: "" });
  const [soldMsg, setSoldMsg] = useState("");

  const loadBatches = useCallback(async () => setBatches((await api.get("/admin/qr/batches")).data.batches), []);
  const loadInv = useCallback(async (status = statusF, query = q) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (query) p.set("q", query);
    p.set("limit", 100);
    setInv((await api.get(`/admin/qr/inventory?${p.toString()}`)).data.items);
  }, [statusF, q]);

  useEffect(() => { loadBatches(); loadInv(); api.get("/admin/orgs").then((r) => setOrgs(r.data.results)).catch(() => {}); }, [loadBatches, loadInv]);

  const generate = async (e) => {
    e.preventDefault(); setGenBusy(true); setGenResult(null);
    try {
      const r = await api.post("/admin/qr/generate-bulk", { count: Number(gen.count), batch_label: gen.batch_label || null, product_type: gen.product_type || null, org_name: gen.org_name || null, org_id: gen.org_id || null });
      setGenResult(r.data); loadBatches(); loadInv();
    } finally { setGenBusy(false); }
  };

  const exportCSV = async (batchId, label) => {
    const res = await api.get(`/admin/qr/batch/${batchId}/export.csv`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `qr-${(label || batchId).replace(/\s/g, "_")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const printStickers = (batchId) => window.open(`${API}/admin/qr/batch/${batchId}/stickers.html?variant=neon&per_row=3`, "_blank");

  const block = async (serial, blocked) => { await api.post(`/admin/qr/${serial}/block`, { blocked }); loadInv(); loadBatches(); };

  const markSold = async (e) => {
    e.preventDefault(); setSoldMsg("");
    const r = await api.post("/admin/qr/mark-sold", sold);
    setSoldMsg(`${r.data.updated} QR codes assigned to ${sold.vendor_name}.`);
    loadInv(); loadBatches();
  };

  return (
    <div className="page" data-testid="admin-qr-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <h1 style={{ fontSize: 32, marginBottom: 4 }}><QrCode size={26} style={{ verticalAlign: "-4px" }} /> Car QR <span className="neon">management</span></h1>
        <p className="muted" style={{ marginBottom: 22 }}>Generate, distribute, print & track QR stickers.</p>

        <div className="grid grid-2" style={{ alignItems: "start", marginBottom: 18 }}>
          {/* Generate */}
          <div className="glass card-pad" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>Generate QR batch</h2>
            <form onSubmit={generate}>
              <div className="field"><label>How many (max 10,000)</label><input className="input" type="number" min={1} max={10000} value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} data-testid="gen-count" /></div>
              <div className="field"><label>Batch label (optional)</label><input className="input" value={gen.batch_label} onChange={(e) => setGen({ ...gen, batch_label: e.target.value })} data-testid="gen-label" placeholder="Diwali-2026" /></div>
              <div className="field"><label>Product type</label>
                <select className="input" value={gen.product_type} onChange={(e) => setGen({ ...gen, product_type: e.target.value })} data-testid="gen-product-type">
                  <option value="">Any (customer chooses)</option>
                  <option value="vehicle">Vehicle QR</option>
                  <option value="tag">ID Tag (school / hospital / office)</option>
                  <option value="card">Digital card</option>
                </select>
              </div>
              {gen.product_type === "tag" && (
                <>
                  <div className="field"><label>Assign to organization (optional)</label>
                    <select className="input" value={gen.org_id} onChange={(e) => setGen({ ...gen, org_id: e.target.value })} data-testid="gen-org-select">
                      <option value="">— None (free-text below) —</option>
                      {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.org_type})</option>)}
                    </select>
                  </div>
                  {!gen.org_id && <div className="field"><label>Organization name (free text)</label><input className="input" value={gen.org_name} onChange={(e) => setGen({ ...gen, org_name: e.target.value })} data-testid="gen-org-name" placeholder="e.g. Delhi Public School" /></div>}
                </>
              )}
              <button className="btn btn-primary btn-block" disabled={genBusy} data-testid="gen-submit">{genBusy ? <><Loader2 size={16} className="spin" /> Generating…</> : <><Plus size={16} /> Generate</>}</button>
            </form>
            {genResult && <p style={{ color: "#22d3ee", marginTop: 12, fontSize: 14 }} data-testid="gen-result">✅ {genResult.count} QR codes: {genResult.first_serial} → {genResult.last_serial}</p>}
          </div>

          {/* Mark sold to dealer */}
          <div className="glass card-pad" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12 }}><Store size={18} style={{ verticalAlign: "-3px" }} /> Sell / assign to dealer</h2>
            <form onSubmit={markSold}>
              <div className="grid grid-2">
                <div className="field"><label>Serial from</label><input className="input" value={sold.serial_from} onChange={(e) => setSold({ ...sold, serial_from: e.target.value })} required data-testid="sold-from" placeholder="NS-2608-000001" /></div>
                <div className="field"><label>Serial to</label><input className="input" value={sold.serial_to} onChange={(e) => setSold({ ...sold, serial_to: e.target.value })} required data-testid="sold-to" placeholder="NS-2608-000100" /></div>
              </div>
              <div className="field"><label>Dealer name</label><input className="input" value={sold.vendor_name} onChange={(e) => setSold({ ...sold, vendor_name: e.target.value })} required data-testid="sold-vendor" placeholder="Dealer A" /></div>
              <button className="btn btn-ghost btn-block" data-testid="sold-submit"><Store size={16} /> Mark sold</button>
            </form>
            {soldMsg && <p style={{ color: "#22d3ee", marginTop: 12, fontSize: 14 }} data-testid="sold-msg">{soldMsg}</p>}
          </div>
        </div>

        {/* Batches */}
        <div className="glass card-pad" style={{ padding: 22, marginBottom: 18 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Batches</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Batch</th><th style={th}>Total</th><th style={th}>Available</th><th style={th}>Sold</th><th style={th}>Activated</th><th style={th}>Actions</th></tr></thead>
              <tbody>
                {batches.length === 0 && <tr><td style={td} colSpan={6} className="muted">No batches yet — generate one above.</td></tr>}
                {batches.map((b) => (
                  <tr key={b.batch_id} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }} data-testid={`batch-${b.batch_id}`}>
                    <td style={td}>{b.batch_label}</td><td style={td}>{b.total}</td><td style={td}>{b.unclaimed}</td><td style={td}>{b.sold}</td><td style={td}>{b.assigned}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => exportCSV(b.batch_id, b.batch_label)} data-testid={`csv-${b.batch_id}`}><Download size={13} /> CSV</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => printStickers(b.batch_id)} data-testid={`print-${b.batch_id}`}><Printer size={13} /> Print</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory */}
        <div className="glass card-pad" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20 }}>Inventory</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="input" style={{ maxWidth: 160 }} value={statusF} onChange={(e) => { setStatusF(e.target.value); loadInv(e.target.value, q); }} data-testid="inv-status-filter">
                <option value="">All statuses</option><option value="unclaimed">Available</option><option value="sold">Sold</option><option value="assigned">Activated</option><option value="blocked">Blocked</option>
              </select>
              <input className="input" style={{ maxWidth: 200 }} placeholder="Search serial" value={q} onChange={(e) => { setQ(e.target.value); loadInv(statusF, e.target.value); }} data-testid="inv-search" />
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Serial</th><th style={th}>Status</th><th style={th}>Product</th><th style={th}>Dealer</th><th style={th}>Action</th></tr></thead>
              <tbody>
                {inv.length === 0 && <tr><td style={td} colSpan={5} className="muted">No QR codes for this filter.</td></tr>}
                {inv.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid rgba(124,58,237,.12)" }} data-testid={`inv-${d.serial_no}`}>
                    <td style={td}><b>{d.serial_no}</b></td>
                    <td style={td}><span style={{ color: STATUS_COLOR[d.status], fontWeight: 700 }}>{STATUS_LABEL[d.status] || d.status}</span></td>
                    <td style={td} className="muted">{d.product_type || "—"}</td>
                    <td style={td} className="muted">{d.sold_to_vendor || "—"}</td>
                    <td style={td}>
                      {d.status === "blocked"
                        ? <button className="btn btn-ghost btn-sm" onClick={() => block(d.serial_no, false)} data-testid={`unblock-${d.serial_no}`}><CheckCircle2 size={13} color="#22d3ee" /> Unblock</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => block(d.serial_no, true)} data-testid={`block-${d.serial_no}`}><Ban size={13} color="#ff3b5c" /> Block</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "12px 10px" };
