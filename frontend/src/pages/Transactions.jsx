import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { rupee } from "@/lib/pay";
import { Receipt, ArrowLeft, FileText, ChevronRight, X, Printer } from "lucide-react";

const STATUS = { successful: "pill-ok", pending: "pill-warn", failed: "pill-danger", unsuccessful: "pill-danger" };

function printInvoice(tx) {
  const w = window.open("", "_blank", "width=820,height=920");
  if (!w) { alert("Please allow pop-ups to print the invoice."); return; }
  const logo = `${window.location.origin}/website/logo-original.jpg`;
  const inr = (p) => `₹${((p || 0) / 100).toLocaleString("en-IN")}`;
  const date = tx.date ? new Date(tx.date).toLocaleString("en-IN") : "—";
  const cust = tx.customer || {};
  const inv = (tx.id || "").replace(/-/g, "").slice(0, 10).toUpperCase();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Nek Sathi Invoice ${inv}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
  body{margin:0;background:#f4f4f6;color:#15151c;padding:24px}
  .inv{max-width:720px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e6ec}
  .top{display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-bottom:3px solid #e92546}
  .top img{height:56px}
  .top .r{text-align:right}
  .badge{display:inline-block;background:#e92546;color:#fff;font-weight:800;font-size:11px;letter-spacing:1.5px;padding:5px 12px;border-radius:999px}
  h1{font-size:20px;margin:8px 0 0}
  .meta{display:flex;justify-content:space-between;padding:18px 26px;font-size:13px;color:#555}
  .meta b{color:#15151c}
  table{width:100%;border-collapse:collapse;margin:0 26px;width:calc(100% - 52px)}
  th{background:#faf0f2;text-align:left;font-size:11px;letter-spacing:.5px;color:#9a3047;padding:10px 12px;text-transform:uppercase}
  td{padding:12px;border-bottom:1px solid #eee;font-size:14px}
  .tot{display:flex;justify-content:flex-end;padding:16px 26px}
  .tot .box{min-width:240px}
  .tot .row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px}
  .tot .grand{border-top:2px solid #e92546;margin-top:6px;padding-top:10px;font-size:18px;font-weight:800}
  .pay{margin:0 26px 8px;padding:12px;background:#f7fff9;border:1px solid #cdeedd;border-radius:10px;font-size:13px;color:#1b7a4b}
  .foot{padding:18px 26px;color:#888;font-size:12px;border-top:1px solid #eee;text-align:center}
  .foot b{color:#e92546}
  @media print{body{background:#fff;padding:0}.inv{border:none}}
</style></head><body>
<div class="inv">
  <div class="top"><img src="${logo}" alt="Nek Sathi"/><div class="r"><span class="badge">PAYMENT RECEIPT</span><h1>Invoice #${inv}</h1></div></div>
  <div class="meta">
    <div><div style="color:#9a3047;font-weight:700;margin-bottom:4px">BILLED TO</div><b>${cust.name || "Customer"}</b><br/>${cust.phone || ""}<br/>${cust.email && !String(cust.email).includes("@phone.") ? cust.email : ""}</div>
    <div style="text-align:right"><div style="color:#9a3047;font-weight:700;margin-bottom:4px">DETAILS</div>Date: <b>${date}</b><br/>Status: <b>${(tx.status || "").toUpperCase()}</b>${tx.number_plate ? `<br/>Vehicle: <b>${tx.number_plate}</b>` : ""}</div>
  </div>
  <table><thead><tr><th>Description</th><th>Validity</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody><tr><td>${tx.title || tx.plan_name || "Nek Sathi subscription"}</td><td>${tx.validity_days ? tx.validity_days + " days" : "—"}</td><td style="text-align:right">${inr(tx.amount_paise)}</td></tr></tbody></table>
  <div class="tot"><div class="box"><div class="row"><span>Subtotal</span><span>${inr(tx.amount_paise)}</span></div><div class="row grand"><span>Total paid</span><span>${inr(tx.amount_paise)}</span></div></div></div>
  ${tx.status === "successful" ? `<div class="pay">✓ Payment successful${tx.payment_id ? ` · Txn ID: ${tx.payment_id}` : ""}${tx.provider ? ` · via ${tx.provider === "dry" ? "test" : tx.provider}` : ""}</div>` : ""}
  <div class="foot">Thank you for choosing Nek Sathi. <b>Har musibat mein, ek Nek Sathi.</b><br/>neksathi.in · This is a computer-generated receipt.</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
</body></html>`);
  w.document.close();
}

export default function Transactions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);

  useEffect(() => { api.get("/me/transactions").then((r) => setItems(r.data.items || [])).finally(() => setLoading(false)); }, []);

  return (
    <div className="page" data-testid="transactions-page">
      <div className="container-nk" style={{ maxWidth: 720 }}>
        <Link to="/settings" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Settings</Link>
        <h1 style={{ fontSize: 30, marginBottom: 6 }}><Receipt size={26} style={{ verticalAlign: "-4px" }} /> Transaction <span className="neon">history</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>Every payment you've made. Tap a successful one to view / download its bill.</p>

        {loading && <div className="spinner" />}
        {!loading && items.length === 0 && <div className="glass card-pad center" style={{ padding: 34 }}><Receipt size={40} className="muted" /><p className="muted" style={{ marginTop: 10 }}>No transactions yet.</p></div>}

        <div className="grid" style={{ gap: 10 }}>
          {items.map((tx) => (
            <button key={tx.id} onClick={() => setSel(tx)} data-testid={`txn-${tx.id}`}
              className="glass glass-hover card-pad" style={{ textAlign: "left", cursor: "pointer", color: "inherit", display: "flex", alignItems: "center", gap: 14, border: "1px solid var(--panel-brd)" }}>
              <div className="brand-badge" style={{ borderRadius: 12 }}><FileText size={18} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{tx.title}</b><span className={`pill ${STATUS[tx.status] || "pill-muted"}`}>{tx.status}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{rupee(tx.amount_paise)} · {tx.number_plate || "—"} · {tx.date ? new Date(tx.date).toLocaleDateString() : "—"}</div>
              </div>
              <ChevronRight size={18} className="muted" />
            </button>
          ))}
        </div>
      </div>

      {sel && (
        <div style={overlay} onClick={() => setSel(null)} data-testid="txn-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 440, padding: 26 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 20 }}>Transaction</h2>
              <button className="btn btn-ghost btn-sm" style={{ padding: 8 }} onClick={() => setSel(null)}><X size={16} /></button>
            </div>
            <div style={{ fontSize: 14 }}>
              <Row label="Item" value={sel.title} />
              <Row label="Amount" value={rupee(sel.amount_paise)} />
              <Row label="Status" value={<span className={`pill ${STATUS[sel.status] || "pill-muted"}`}>{sel.status}</span>} />
              {sel.number_plate && <Row label="Vehicle" value={sel.number_plate} />}
              {sel.validity_days && <Row label="Validity" value={`${sel.validity_days} days`} />}
              <Row label="Date" value={sel.date ? new Date(sel.date).toLocaleString() : "—"} />
              {sel.payment_id && <Row label="Txn ID" value={sel.payment_id} />}
            </div>
            {sel.status === "successful" ? (
              <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => printInvoice(sel)} data-testid="print-invoice"><Printer size={16} /> View / download bill</button>
            ) : (
              <p className="muted center" style={{ fontSize: 13, marginTop: 16 }}>A bill is available once the payment is successful.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}><span className="muted">{label}</span><b style={{ textAlign: "right" }}>{value}</b></div>;
}
const overlay = { position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20, zIndex: 60 };
