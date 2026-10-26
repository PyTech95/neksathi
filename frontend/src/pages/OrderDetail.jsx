import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { runCheckout, rupee } from "@/lib/pay";
import { ArrowLeft, CheckCircle2, Circle, Truck, Package, Printer, Home, Clock, MapPin, RefreshCw, ShieldCheck } from "lucide-react";

const TRACK = [
  { k: "generating", l: "QR generating", icon: Package },
  { k: "printed", l: "Printed", icon: Printer },
  { k: "shipped", l: "Shipped", icon: Package },
  { k: "out_for_delivery", l: "Out for delivery", icon: Truck },
  { k: "delivered", l: "Delivered", icon: Home },
];
const PLAN_PILL = { active: "pill-ok", grace: "pill-warn", expired: "pill-danger", none: "pill-muted" };

export default function OrderDetail() {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const [err, setErr] = useState("");
  const [plans, setPlans] = useState([]);
  const [recId, setRecId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tokens, setTokens] = useState(0);
  const [useTok, setUseTok] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/me/orders/${id}`);
      setO(r.data);
      // load the right plan catalogue for recharge (vehicle plans vs tag plans)
      if (r.data.product_type === "tag") {
        const tp = await api.get(`/tag-plans?tag_type=${r.data.tag_type || ""}`);
        setPlans((tp.data.items || []).filter((p) => p.active));
      } else {
        const vp = await api.get("/plans");
        setPlans((vp.data || []).filter((p) => p.active));
      }
    } catch (e) { setErr(e?.response?.data?.detail || "Order not found"); }
  }, [id]);
  useEffect(() => { load(); api.get("/me/tokens").then((r) => setTokens(r.data.tokens || 0)).catch(() => {}); }, [load]);

  const recharge = async () => {
    if (!recId) return;
    setBusy(true); setMsg("");
    try {
      const body = o.product_type === "tag"
        ? { product_type: "tag", tag_id: o.tag_id, plan_id: recId, use_tokens: useTok ? tokens : 0 }
        : { product_type: "vehicle", vehicle_id: o.vehicle_id, plan_id: recId, use_tokens: useTok ? tokens : 0 };
      const create = (await api.post("/me/recharge/create", body)).data;
      const res = await runCheckout(create);
      await api.post("/me/recharge/verify", { recharge_id: create.recharge_id, ...(res.dry ? {} : res) });
      setMsg("Recharged! Your plan is active again.");
      setRecId(""); load();
    } catch (e) { setMsg(e?.message === "Payment cancelled" ? "Payment cancelled." : (e?.response?.data?.detail || "Recharge failed")); }
    finally { setBusy(false); }
  };

  if (err) return <div className="page"><div className="container-nk"><p className="muted">{err}</p><Link to="/orders" className="btn btn-ghost" style={{ marginTop: 12 }}><ArrowLeft size={16} /> Orders</Link></div></div>;
  if (!o) return <div className="page"><div className="spinner" /></div>;

  const doneStatuses = o.timeline.map((t) => t.status);
  const curIdx = TRACK.map((t) => t.k).lastIndexOf(o.status);
  const paid = o.status !== "pending_payment";
  const plan = o.plan;

  return (
    <div className="page" data-testid="order-detail">
      <div className="container-nk" style={{ maxWidth: 620 }}>
        <Link to="/orders" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Orders</Link>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>{o.number_plate} <span className="muted" style={{ fontSize: 16 }}>· {o.plan_name}</span></h1>
        <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>Ordered {new Date(o.created_at).toLocaleString()} · {rupee(o.amount_paise)}</p>

        {!paid && (
          <div className="glass card-pad" style={{ padding: 18, marginBottom: 16, borderColor: "var(--warn)" }}>
            <span className="pill pill-warn"><Clock size={12} /> Payment pending</span>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>This order isn't paid yet. Start a new order from Buy QR.</p>
          </div>
        )}

        {paid && (
          <div className="glass card-pad" style={{ padding: 22, marginBottom: 16 }} data-testid="order-tracker">
            <h2 style={{ fontSize: 18, marginBottom: 16 }}><Truck size={17} style={{ verticalAlign: "-3px" }} /> Delivery status</h2>
            {TRACK.map((t, i) => {
              const done = doneStatuses.includes(t.k) || curIdx > i;
              const current = curIdx === i;
              const Ico = t.icon;
              return (
                <div key={t.k} style={{ display: "flex", gap: 14, alignItems: "flex-start", paddingBottom: i < TRACK.length - 1 ? 18 : 0, position: "relative" }}>
                  {i < TRACK.length - 1 && <div style={{ position: "absolute", left: 15, top: 30, bottom: 0, width: 2, background: done ? "var(--ok)" : "rgba(255,255,255,.1)" }} />}
                  <div style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, zIndex: 1, background: done ? "var(--ok-dim)" : "rgba(255,255,255,.05)", color: done ? "var(--ok)" : "var(--muted)", border: current ? "2px solid var(--accent)" : "none" }}>
                    {done ? <CheckCircle2 size={18} /> : <Ico size={16} />}
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: done ? "#fff" : "var(--muted)" }}>{t.l}</div>
                    {current && <div className="muted" style={{ fontSize: 12 }}>In progress…</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {plan && plan.status !== "none" && (
          <div className="glass card-pad" style={{ padding: 20, marginBottom: 16 }} data-testid="order-plan">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Plan status</div>
                <span className={`pill ${PLAN_PILL[plan.status] || "pill-muted"}`}>
                  {plan.status === "active" ? `Active · ${plan.days_left} days left` : plan.status === "grace" ? "Expired (grace period)" : "Expired"}
                </span>
              </div>
              {plan.expires_at && <div style={{ textAlign: "right" }}><div className="muted" style={{ fontSize: 12 }}>Valid till</div><b>{new Date(plan.expires_at).toLocaleDateString()}</b></div>}
            </div>
            {(plan.status === "grace" || plan.status === "expired" || plan.status === "active") && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--panel-brd)", paddingTop: 14 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}><RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> Recharge to extend validity</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select className="input" style={{ maxWidth: 240 }} value={recId} onChange={(e) => setRecId(e.target.value)} data-testid="recharge-plan">
                    <option value="">Choose plan…</option>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupee(p.price_cents)} · {p.validity_days}d</option>)}
                  </select>
                  <button className="btn btn-primary" disabled={!recId || busy} onClick={recharge} data-testid="recharge-btn">{busy ? "Processing…" : "Recharge"}</button>
                </div>
                {tokens >= 10 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 13 }} data-testid="recharge-use-tokens">
                    <input type="checkbox" checked={useTok} onChange={(e) => setUseTok(e.target.checked)} />
                    <span>Use my <b>{tokens} tokens</b> — up to ₹{Math.floor(tokens / 10)} off</span>
                  </label>
                )}
                {msg && <p style={{ fontSize: 13, marginTop: 8, color: msg.includes("active") ? "var(--ok)" : "var(--danger)" }}>{msg}</p>}
              </div>
            )}
          </div>
        )}

        <div className="glass card-pad" style={{ padding: 18 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}><MapPin size={13} style={{ verticalAlign: "-2px" }} /> Delivery address</div>
          <div style={{ fontSize: 14 }}>
            <b>{o.address?.name}</b> · {o.address?.phone}<br />
            {o.address?.line1}{o.address?.line2 ? `, ${o.address.line2}` : ""}<br />
            {o.address?.city} - {o.address?.pincode}{o.address?.landmark ? ` (${o.address.landmark})` : ""}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--panel-brd)", fontSize: 13, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <span className="muted"><Clock size={13} style={{ verticalAlign: "-2px" }} /> Date &amp; time</span>
            <b>{new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}</b>
          </div>
        </div>

        {plan && plan.status === "active" && o.status === "delivered" && (
          <p className="center muted" style={{ fontSize: 12, marginTop: 16 }}><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Your QR is live — scanning it rings your phone.</p>
        )}
      </div>
    </div>
  );
}
