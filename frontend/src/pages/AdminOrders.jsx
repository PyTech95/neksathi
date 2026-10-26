import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { rupee } from "@/lib/pay";
import { ArrowLeft, Truck, CreditCard, Save, RefreshCw, Download, Printer, QrCode, Car, Tag as TagIcon, MapPin, FileText, Copy, Clock } from "lucide-react";

const FLOW = ["generating", "printed", "shipped", "out_for_delivery", "delivered"];
const LABEL = { pending_payment: "Payment pending", paid: "Paid", generating: "QR generating", printed: "Printed", shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered" };
const PILL = { pending_payment: "pill-warn", delivered: "pill-ok", paid: "pill-ok" };

function nextStatus(s) {
  const i = FLOW.indexOf(s);
  if (s === "paid") return "printed"; // generating is auto on paid
  if (i >= 0 && i < FLOW.length - 1) return FLOW[i + 1];
  return null;
}

export default function AdminOrders() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusF, setStatusF] = useState("");
  const [q, setQ] = useState("");
  const [skip, setSkip] = useState(0);
  const [rzp, setRzp] = useState(null);
  const [form, setForm] = useState({ key_id: "", key_secret: "", webhook_secret: "", enabled: true });
  const [rzpMsg, setRzpMsg] = useState("");
  const LIMIT = 50;

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (statusF) p.set("status", statusF);
    if (q) p.set("q", q);
    p.set("skip", skip); p.set("limit", LIMIT);
    const r = await api.get(`/admin/orders?${p.toString()}`);
    setItems(r.data.items); setTotal(r.data.total);
  }, [statusF, q, skip]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/admin/integrations/razorpay").then((r) => { setRzp(r.data); setForm((f) => ({ ...f, key_id: r.data.key_id || "", enabled: r.data.enabled })); }).catch(() => {});
  }, []);

  const advance = async (o, status) => {
    await api.post(`/admin/orders/${o.id}/advance`, { status });
    load();
  };

  // QR sticker — available from "printed" onward, re-downloadable any number
  // of times (never one-time). Fetched with the admin token as a blob.
  const stickerBlob = async (o) => {
    const r = await api.get(`/admin/orders/${o.id}/sticker.png`, { responseType: "blob" });
    return URL.createObjectURL(r.data);
  };
  const downloadSticker = async (o) => {
    try {
      const url = await stickerBlob(o);
      const a = document.createElement("a");
      a.href = url; a.download = `neksathi-${(o.number_plate || o.id)}-${o.sticker_code || ""}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { alert(e?.response?.data?.detail || "Could not download sticker"); }
  };
  const printSticker = async (o) => {
    try {
      const url = await stickerBlob(o);
      const w = window.open("", "_blank", "width=720,height=980");
      if (!w) { alert("Please allow pop-ups to print."); return; }
      w.document.write(`<!doctype html><html><head><title>Nek Sathi QR — ${o.number_plate || ""}</title>
<style>@page{margin:8mm}body{margin:0;display:grid;place-items:center;background:#fff}img{max-width:100%;height:auto}</style></head>
<body><img src="${url}" onload="setTimeout(function(){window.focus();window.print();},250)"/></body></html>`);
      w.document.close();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { alert(e?.response?.data?.detail || "Could not open sticker"); }
  };
  // Download the same sticker as a print-ready PDF.
  const downloadStickerPdf = async (o) => {
    try {
      const r = await api.get(`/admin/orders/${o.id}/sticker.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `neksathi-${(o.number_plate || o.id)}-${o.sticker_code || ""}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { alert(e?.response?.data?.detail || "Could not download PDF"); }
  };

  // Print a clean shipping/address label for the order (what to print on the parcel)
  const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const copyAddr = async (o) => {
    const a = o.address || {};
    const text = [
      a.name || o.user?.name, a.phone || o.user?.phone,
      a.line1, a.line2, `${a.city || ""} - ${a.pincode || ""}`,
      a.landmark ? `Landmark: ${a.landmark}` : "",
    ].filter(Boolean).join("\n");
    try { await navigator.clipboard.writeText(text); alert("Address copied — paste it for your delivery partner."); }
    catch { window.prompt("Copy address:", text.replace(/\n/g, ", ")); }
  };
  const printLabel = (o) => {
    const a = o.address || {};
    const w = window.open("", "_blank", "width=620,height=440");
    if (!w) { alert("Please allow pop-ups to print."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ship to — ${esc(o.number_plate)}</title>
<style>@page{margin:10mm}*{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
body{margin:0;color:#111;padding:14px}.lbl{border:2px solid #111;border-radius:12px;padding:20px;max-width:470px}
.h{font-size:11px;letter-spacing:1.5px;color:#e92546;font-weight:800;text-transform:uppercase;margin-bottom:8px}
.nm{font-size:21px;font-weight:800}.ad{font-size:15px;line-height:1.55;margin-top:6px}
.ph{margin-top:10px;font-weight:700;font-size:15px}
.meta{margin-top:14px;font-size:12px;color:#666;border-top:1px dashed #bbb;padding-top:8px}</style></head>
<body><div class="lbl"><div class="h">Nek Sathi · Ship to</div>
<div class="nm">${esc(a.name || o.user?.name)}</div>
<div class="ad">${esc(a.line1)}${a.line2 ? ", " + esc(a.line2) : ""}<br/>${esc(a.city)} - ${esc(a.pincode)}${a.landmark ? "<br/>Landmark: " + esc(a.landmark) : ""}</div>
<div class="ph">📞 ${esc(a.phone || o.user?.phone)}</div>
<div class="meta">${o.product_type === "tag" ? "Tag" : "Vehicle"}: ${esc(o.number_plate)} · ${esc(o.plan_name)}${o.sticker_code ? " · CODE " + esc(o.sticker_code) : ""}</div>
</div><script>window.onload=function(){setTimeout(function(){window.print();},250);}</script></body></html>`);
    w.document.close();
  };

  const saveRzp = async (e) => {
    e.preventDefault(); setRzpMsg("");
    try {
      await api.post("/admin/integrations/razorpay", form);
      setRzpMsg("Saved."); setForm((f) => ({ ...f, key_secret: "", webhook_secret: "" }));
      const r = await api.get("/admin/integrations/razorpay"); setRzp(r.data);
    } catch (e) { setRzpMsg(e?.response?.data?.detail || "Could not save"); }
  };

  return (
    <div className="page" data-testid="admin-orders-page">
      <div className="container-nk">
        <Link to="/admin" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Admin</Link>
        <h1 style={{ fontSize: 32, marginBottom: 6 }}><Truck size={26} style={{ verticalAlign: "-4px" }} /> QR <span className="neon">orders</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>Vehicle & tag orders — move each through the delivery stages. From <b>Printed</b> onward you can download / print that order's unique QR sticker (re-downloadable any time). On <b>Delivered</b> the customer's plan activates.</p>

        {/* Razorpay settings */}
        <div className="glass card-pad" style={{ padding: 22, marginBottom: 20 }} data-testid="rzp-settings">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 19 }}><CreditCard size={18} style={{ verticalAlign: "-3px" }} /> Razorpay</h2>
            {rzp && <span className={`pill ${rzp.dry_run ? "pill-warn" : "pill-ok"}`}>{rzp.dry_run ? "TEST / dry-run (no live keys)" : "LIVE"}</span>}
          </div>
          <form onSubmit={saveRzp}>
            <div className="grid grid-2">
              <div className="field"><label>Key ID</label><input className="input" value={form.key_id} onChange={(e) => setForm({ ...form, key_id: e.target.value })} placeholder="rzp_live_xxx / rzp_test_xxx" data-testid="rzp-key-id" /></div>
              <div className="field"><label>Key Secret {rzp?.has_secret && <span className="muted">(set — leave blank to keep)</span>}</label><input className="input" type="password" value={form.key_secret} onChange={(e) => setForm({ ...form, key_secret: e.target.value })} placeholder="••••••" data-testid="rzp-key-secret" /></div>
            </div>
            <div className="field"><label>Webhook Secret {rzp?.webhook_set && <span className="muted">(set — leave blank to keep)</span>}</label><input className="input" type="password" value={form.webhook_secret} onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })} placeholder="optional" data-testid="rzp-webhook" /></div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> <span className="muted" style={{ fontSize: 14 }}>Enabled</span>
            </label>
            <button className="btn btn-primary btn-sm" data-testid="rzp-save"><Save size={14} /> Save Razorpay keys</button>
            {rzpMsg && <span style={{ marginLeft: 12, fontSize: 13, color: rzpMsg === "Saved." ? "var(--ok)" : "var(--danger)" }}>{rzpMsg}</span>}
          </form>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Tip: secret can also stay only in the server <code>.env</code> (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET). With no keys, checkout runs in safe test mode.</p>
        </div>

        {/* filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <select className="input" style={{ maxWidth: 190 }} value={statusF} onChange={(e) => { setSkip(0); setStatusF(e.target.value); }} data-testid="order-status-filter">
            <option value="">All statuses</option>
            {Object.keys(LABEL).map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}
          </select>
          <input className="input" style={{ maxWidth: 200 }} placeholder="Search plate" value={q} onChange={(e) => { setSkip(0); setQ(e.target.value); }} data-testid="order-search" />
          <span className="muted" style={{ alignSelf: "center", fontSize: 13 }}>{total} orders</span>
        </div>

        <div className="glass card-pad" style={{ padding: 18 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}><th style={th}>Item</th><th style={th}>Customer</th><th style={th}>Plan</th><th style={th}>Amount</th><th style={th}>Status</th><th style={th}>QR sticker</th><th style={th}>Action</th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td style={td} colSpan={7} className="muted">No orders.</td></tr>}
                {items.map((o) => {
                  const ns = o.paid ? nextStatus(o.status === "generating" ? "generating" : o.status) : null;
                  const isTag = o.product_type === "tag";
                  return (
                    <tr key={o.id} style={{ borderTop: "1px solid rgba(179,18,47,.12)" }} data-testid={`admin-order-${o.id}`}>
                      <td style={td}>
                        <b>{o.number_plate}</b>
                        <div className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                          {isTag ? <TagIcon size={11} /> : <Car size={11} />}{isTag ? (o.tag_type || "tag") : "vehicle"}
                        </div>
                        {o.created_at && (
                          <div className="muted" style={{ fontSize: 10.5, display: "flex", alignItems: "center", gap: 4, marginTop: 3 }} data-testid={`order-datetime-${o.id}`}>
                            <Clock size={10} />{new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                          </div>
                        )}
                      </td>
                      <td style={td} className="muted">
                        <b style={{ color: "var(--text)" }}>{o.user?.name}</b><br />
                        <span style={{ fontSize: 12 }}>{o.user?.phone}</span>
                        {o.address && (
                          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45, background: "rgba(255,255,255,.04)", border: "1px solid var(--panel-brd)", borderRadius: 8, padding: "7px 9px", maxWidth: 230 }} data-testid={`order-address-${o.id}`}>
                            <span style={{ color: "#ff8fa3", fontWeight: 700, fontSize: 10, letterSpacing: ".04em" }}><MapPin size={10} style={{ verticalAlign: "-1px" }} /> SHIP TO</span><br />
                            <b style={{ color: "var(--text)" }}>{o.address.name}</b> · {o.address.phone}<br />
                            {o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ""}<br />
                            {o.address.city} - {o.address.pincode}{o.address.landmark ? ` (${o.address.landmark})` : ""}
                            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                              <button className="btn btn-ghost btn-sm" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => copyAddr(o)} data-testid={`copy-addr-${o.id}`}><Copy size={12} /> Copy</button>
                              <button className="btn btn-ghost btn-sm" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => printLabel(o)} data-testid={`print-label-${o.id}`}><FileText size={12} /> Print label</button>
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={td} className="muted">{o.plan_name}</td>
                      <td style={td}>{rupee(o.amount_paise)}</td>
                      <td style={td}><span className={`pill ${PILL[o.status] || "pill-info"}`}>{LABEL[o.status] || o.status}</span></td>
                      <td style={td}>
                        {o.sticker_ready ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid={`sticker-${o.id}`}>
                            {o.sticker_code && <span className="muted" style={{ fontSize: 11 }}><QrCode size={11} style={{ verticalAlign: "-1px" }} /> CODE {o.sticker_code}</span>}
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-primary btn-sm" style={{ padding: "6px 10px" }} onClick={() => downloadSticker(o)} data-testid={`dl-sticker-${o.id}`}><Download size={13} /> PNG</button>
                              <button className="btn btn-ghost btn-sm" style={{ padding: "6px 10px" }} onClick={() => downloadStickerPdf(o)} data-testid={`pdf-sticker-${o.id}`}><FileText size={13} /> PDF</button>
                              <button className="btn btn-ghost btn-sm" style={{ padding: "6px 10px" }} onClick={() => printSticker(o)} data-testid={`print-sticker-${o.id}`}><Printer size={13} /> Print</button>
                            </div>
                          </div>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>available once printed</span>
                        )}
                      </td>
                      <td style={td}>
                        {!o.paid && <span className="muted" style={{ fontSize: 12 }}>unpaid</span>}
                        {o.paid && o.status !== "delivered" && ns && (
                          <button className="btn btn-primary btn-sm" onClick={() => advance(o, ns)} data-testid={`advance-${o.id}`}>→ {LABEL[ns]}</button>
                        )}
                        {o.status === "delivered" && <span className="pill pill-ok">Done</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button className="btn btn-ghost btn-sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - LIMIT))}>Prev</button>
            <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
            <button className="btn btn-ghost btn-sm" disabled={skip + LIMIT >= total} onClick={() => setSkip(skip + LIMIT)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
const th = { padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "12px 10px" };
