import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { API } from "@/lib/api";
import { QrCode, Plus, Download, Printer, Ban, CheckCircle2, ArrowLeft, Store, Loader2 } from "lucide-react";
import Pager from "@/components/Pager";

const STATUS_LABEL = { unclaimed: "Available", sold: "Sold (dealer)", assigned: "Activated", blocked: "Blocked" };
const STATUS_COLOR = { unclaimed: "#e92546", sold: "#f5a524", assigned: "#10b981", blocked: "#ff3b5c" };

// Sub-categories shown once a product type is chosen while generating.
const SUBTYPES = {
  vehicle: ["Car", "Two-wheeler / Bike", "Tractor", "Commercial / Truck", "Auto / Rickshaw", "Other"],
  tag: ["Pet", "Mobile / Gadget", "Child / Kid", "Elderly / Senior", "Luggage / Bag", "Keys", "Wallet / Documents", "Cycle", "Other"],
  card: ["Personal", "Business"],
};

export default function AdminQR() {
  const [batches, setBatches] = useState([]);
  const [inv, setInv] = useState([]);
  const [statusF, setStatusF] = useState("");
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [gen, setGen] = useState({ count: 100, batch_label: "", product_type: "", product_subtype: "", org_name: "", org_id: "" });
  const [orgs, setOrgs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [sold, setSold] = useState({ serial_from: "", serial_to: "", vendor_id: "" });
  const [soldMsg, setSoldMsg] = useState("");
  const [batchAssign, setBatchAssign] = useState({}); // batch_id -> vendor_id selection
  const [assignMsg, setAssignMsg] = useState("");

  const loadBatches = useCallback(async () => setBatches((await api.get("/admin/qr/batches")).data.batches), []);
  const loadInv = useCallback(async (status = "", query = "", sk = 0, lim = 50) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (query) p.set("q", query);
    p.set("skip", sk); p.set("limit", lim);
    const r = (await api.get(`/admin/qr/inventory?${p.toString()}`)).data;
    setInv(r.items); setTotal(r.total ?? r.items.length);
  }, []);

  const [searchParams] = useSearchParams();
  useEffect(() => {
    loadBatches(); loadInv("", "", 0, 50);
    api.get("/admin/orgs").then((r) => setOrgs(r.data.results)).catch(() => {});
    api.get("/admin/vendors").then((r) => setVendors(r.data.items || [])).catch(() => {});
  }, [loadBatches, loadInv]);

  // Preselect org + type when opened from the Organizations page ("Generate tags").
  useEffect(() => {
    const org = searchParams.get("org"); const type = searchParams.get("type");
    if (org || type) setGen((g) => ({ ...g, org_id: org || g.org_id, product_type: type || g.product_type }));
  }, [searchParams]);

  const generate = async (e) => {
    e.preventDefault(); setGenBusy(true); setGenResult(null);
    try {
      const r = await api.post("/admin/qr/generate-bulk", { count: Number(gen.count), batch_label: gen.batch_label || null, product_type: gen.product_type || null, product_subtype: gen.product_subtype || null, org_name: gen.org_name || null, org_id: gen.org_id || null });
      setGenResult(r.data); loadBatches(); loadInv(statusF, q, skip, limit);
    } finally { setGenBusy(false); }
  };

  const exportCSV = async (batchId, label) => {
    const res = await api.get(`/admin/qr/batch/${batchId}/export.csv`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `qr-${(label || batchId).replace(/\s/g, "_")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const printStickers = (batchId) => window.open(`${API}/admin/qr/batch/${batchId}/stickers.html?variant=neon&per_row=3`, "_blank");

  const block = async (serial, blocked) => { await api.post(`/admin/qr/${serial}/block`, { blocked }); loadInv(statusF, q, skip, limit); loadBatches(); };

  const assignDealer = async (e) => {
    e.preventDefault(); setSoldMsg("");
    if (!sold.vendor_id) { setSoldMsg("Choose a dealer first."); return; }
    if (!sold.serial_from || !sold.serial_to) { setSoldMsg("Enter the serial range."); return; }
    try {
      const r = await api.post("/admin/qr/assign-dealer", { vendor_id: sold.vendor_id, serial_from: sold.serial_from, serial_to: sold.serial_to });
      setSoldMsg(`✅ ${r.data.assigned} QR codes assigned to ${r.data.vendor_name}.`);
      loadInv(statusF, q, 0, limit); setSkip(0); loadBatches();
    } catch (err) { setSoldMsg(err?.response?.data?.detail || "Could not assign."); }
  };

  const assignBatch = async (batchId) => {
    const vid = batchAssign[batchId];
    if (!vid) return;
    setAssignMsg("");
    try {
      const r = await api.post("/admin/qr/assign-dealer", { vendor_id: vid, batch_id: batchId });
      setAssignMsg(`✅ ${r.data.assigned} available QR codes from this batch assigned to ${r.data.vendor_name}.`);
      setBatchAssign((m) => ({ ...m, [batchId]: "" }));
      loadBatches(); loadInv(statusF, q, skip, limit);
    } catch (err) { setAssignMsg(err?.response?.data?.detail || "Could not assign."); }
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
              <div className="field"><label>What is this QR for?</label>
                <select className="input" value={gen.product_type} onChange={(e) => setGen({ ...gen, product_type: e.target.value, product_subtype: "" })} data-testid="gen-product-type">
                  <option value="">Any (customer chooses)</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="tag">Tag (pet, mobile, kid, elderly…)</option>
                  <option value="card">Digital card</option>
                </select>
              </div>
              {gen.product_type && SUBTYPES[gen.product_type] && (
                <div className="field"><label>Category</label>
                  <select className="input" value={gen.product_subtype} onChange={(e) => setGen({ ...gen, product_subtype: e.target.value })} data-testid="gen-subtype">
                    <option value="">Any / not specified</option>
                    {SUBTYPES[gen.product_type].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="field"><label>For organization (optional)</label>
                <select className="input" value={gen.org_id} onChange={(e) => setGen({ ...gen, org_id: e.target.value })} data-testid="gen-org-select">
                  <option value="">— None —</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.org_type})</option>)}
                </select>
              </div>
              {!gen.org_id && <div className="field"><label>…or organization name (free text)</label><input className="input" value={gen.org_name} onChange={(e) => setGen({ ...gen, org_name: e.target.value })} data-testid="gen-org-name" placeholder="e.g. Delhi Public School" /></div>}
              <button className="btn btn-primary btn-block" disabled={genBusy} data-testid="gen-submit">{genBusy ? <><Loader2 size={16} className="spin" /> Generating…</> : <><Plus size={16} /> Generate</>}</button>
            </form>
            {genResult && <p style={{ color: "#e92546", marginTop: 12, fontSize: 14 }} data-testid="gen-result">✅ {genResult.count} QR codes: {genResult.first_serial} → {genResult.last_serial}</p>}
          </div>

          {/* Mark sold to dealer */}
          <div className="glass card-pad" style={{ padding: 22 }}>
            <h2 style={{ fontSize: 20, marginBottom: 12 }}><Store size={18} style={{ verticalAlign: "-3px" }} /> Assign to dealer</h2>
            <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>Pick a dealer and a serial range — or use the <b>Assign</b> button on a whole batch below.</p>
            <form onSubmit={assignDealer}>
              <div className="field"><label>Choose dealer</label>
                <select className="input" value={sold.vendor_id} onChange={(e) => setSold({ ...sold, vendor_id: e.target.value })} required data-testid="sold-vendor">
                  <option value="">— Select dealer —</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.city ? ` · ${v.city}` : ""}</option>)}
                </select>
              </div>
              <div className="grid grid-2">
                <div className="field"><label>Serial from</label><input className="input" value={sold.serial_from} onChange={(e) => setSold({ ...sold, serial_from: e.target.value })} required data-testid="sold-from" placeholder="NS-2610-000001" /></div>
                <div className="field"><label>Serial to</label><input className="input" value={sold.serial_to} onChange={(e) => setSold({ ...sold, serial_to: e.target.value })} required data-testid="sold-to" placeholder="NS-2610-000100" /></div>
              </div>
              <button className="btn btn-ghost btn-block" data-testid="sold-submit"><Store size={16} /> Assign to dealer</button>
            </form>
            {vendors.length === 0 && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>No dealers yet — create one in <Link to="/admin/dealers" className="neon">Dealers</Link>.</p>}
            {soldMsg && <p style={{ color: "#e92546", marginTop: 12, fontSize: 14 }} data-testid="sold-msg">{soldMsg}</p>}
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
                  <tr key={b.batch_id} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }} data-testid={`batch-${b.batch_id}`}>
                    <td style={td}>{b.batch_label}</td><td style={td}>{b.total}</td><td style={td}>{b.unclaimed}</td><td style={td}>{b.sold}</td><td style={td}>{b.assigned}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => exportCSV(b.batch_id, b.batch_label)} data-testid={`csv-${b.batch_id}`}><Download size={13} /> CSV</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => printStickers(b.batch_id)} data-testid={`print-${b.batch_id}`}><Printer size={13} /> Print</button>
                        <select className="input" style={{ maxWidth: 150, padding: "6px 8px", fontSize: 12 }} value={batchAssign[b.batch_id] || ""} onChange={(e) => setBatchAssign((m) => ({ ...m, [b.batch_id]: e.target.value }))} data-testid={`assign-sel-${b.batch_id}`}>
                          <option value="">Assign to dealer…</option>
                          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm" disabled={!batchAssign[b.batch_id]} onClick={() => assignBatch(b.batch_id)} data-testid={`assign-batch-${b.batch_id}`}><Store size={13} /> Assign</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {assignMsg && <p style={{ color: "#e92546", marginTop: 12, fontSize: 14 }} data-testid="assign-msg">{assignMsg}</p>}
        </div>

        {/* Inventory */}
        <div className="glass card-pad" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 20 }}>Inventory</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="input" style={{ maxWidth: 160 }} value={statusF} onChange={(e) => { setStatusF(e.target.value); setSkip(0); loadInv(e.target.value, q, 0, limit); }} data-testid="inv-status-filter">
                <option value="">All statuses</option><option value="unclaimed">Available</option><option value="sold">Sold</option><option value="assigned">Activated</option><option value="blocked">Blocked</option>
              </select>
              <input className="input" style={{ maxWidth: 200 }} placeholder="Search serial" value={q} onChange={(e) => { setQ(e.target.value); setSkip(0); loadInv(statusF, e.target.value, 0, limit); }} data-testid="inv-search" />
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Serial</th><th style={th}>Status</th><th style={th}>Product</th><th style={th}>Dealer</th><th style={th}>Action</th></tr></thead>
              <tbody>
                {inv.length === 0 && <tr><td style={td} colSpan={5} className="muted">No QR codes for this filter.</td></tr>}
                {inv.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }} data-testid={`inv-${d.serial_no}`}>
                    <td style={td}><b>{d.serial_no}</b></td>
                    <td style={td}><span style={{ color: STATUS_COLOR[d.status], fontWeight: 700 }}>{STATUS_LABEL[d.status] || d.status}</span></td>
                    <td style={td} className="muted">{d.product_type || "—"}</td>
                    <td style={td} className="muted">{d.sold_to_vendor || "—"}</td>
                    <td style={td}>
                      {d.status === "blocked"
                        ? <button className="btn btn-ghost btn-sm" onClick={() => block(d.serial_no, false)} data-testid={`unblock-${d.serial_no}`}><CheckCircle2 size={13} color="#e92546" /> Unblock</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => block(d.serial_no, true)} data-testid={`block-${d.serial_no}`}><Ban size={13} color="#ff3b5c" /> Block</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager skip={skip} limit={limit} total={total}
            onSkip={(ns) => { setSkip(ns); loadInv(statusF, q, ns, limit); }}
            onLimit={(nl) => { setLimit(nl); setSkip(0); loadInv(statusF, q, 0, nl); }} />
        </div>
      </div>
    </div>
  );
}
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "12px 10px" };
