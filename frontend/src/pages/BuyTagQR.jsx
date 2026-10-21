import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { runCheckout, rupee } from "@/lib/pay";
import { TAG_META } from "@/pages/Tags";
import { QrCode, CheckCircle2, MapPin, CreditCard, ChevronRight, Plus, ShieldCheck, ShieldAlert } from "lucide-react";

const TYPES = Object.keys(TAG_META);
const emptyAddr = { name: "", phone: "", line1: "", line2: "", city: "", pincode: "", landmark: "" };

export default function BuyTagQR() {
  const { tagId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const verified = !!user?.phone_verified;
  const [step, setStep] = useState("tag");          // tag | plan | address | done
  const [tags, setTags] = useState([]);
  const [plans, setPlans] = useState([]);
  const [tid, setTid] = useState(tagId || "");
  const [planId, setPlanId] = useState("");
  const [addr, setAddr] = useState(emptyAddr);
  const [newT, setNewT] = useState({ name: "", tag_type: "bag", description: "" });
  const [addingT, setAddingT] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [doneOrder, setDoneOrder] = useState(null);
  const [tokens, setTokens] = useState(0);
  const [useTok, setUseTok] = useState(false);

  const load = useCallback(async () => {
    const t = await api.get("/tags");
    setTags(t.data);
    api.get("/me/tokens").then((r) => setTokens(r.data.tokens || 0)).catch(() => {});
    if (tagId) { setTid(tagId); setStep("plan"); }
  }, [tagId]);
  useEffect(() => { load(); }, [load]);

  const chosenT = tags.find((t) => t.id === tid);
  const chosenP = plans.find((p) => p.id === planId);
  const planRs = (chosenP?.price_cents || 0) / 100;
  const maxDiscRs = Math.min(Math.floor(tokens / 10), planRs);
  const payRs = planRs - (useTok ? maxDiscRs : 0);

  // load the tag-type specific plans whenever the chosen tag changes
  useEffect(() => {
    if (!chosenT) { setPlans([]); return; }
    api.get(`/tag-plans?tag_type=${chosenT.tag_type}`)
      .then((r) => setPlans((r.data.items || []).filter((p) => p.active)))
      .catch(() => setPlans([]));
    setPlanId("");
  }, [chosenT]);

  const addTag = async (e) => {
    e.preventDefault(); setErr(""); setAddingT(true);
    try {
      const r = await api.post("/tags", { ...newT });
      setTags((ts) => [r.data, ...ts]);
      setTid(r.data.id); setNewT({ name: "", tag_type: "bag", description: "" });
      setStep("plan");
    } catch (e) { setErr(e?.response?.data?.detail || "Could not add tag"); }
    finally { setAddingT(false); }
  };

  const pay = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const create = (await api.post("/tag-orders/create", { tag_id: tid, plan_id: planId, address: addr, use_tokens: useTok ? tokens : 0 })).data;
      const res = await runCheckout(create);
      await api.post("/orders/verify", { qr_order_id: create.qr_order_id, ...(res.dry ? {} : res) });
      setDoneOrder(create.qr_order_id); setStep("done");
    } catch (e) {
      setErr(e?.message === "Payment cancelled" ? "Payment cancelled." : (e?.response?.data?.detail || "Payment failed"));
    } finally { setBusy(false); }
  };

  const Steps = () => (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 22, flexWrap: "wrap" }}>
      {[["tag", "Tag"], ["plan", "Plan"], ["address", "Address"], ["done", "Done"]].map(([k, l], i) => {
        const order = ["tag", "plan", "address", "done"];
        const active = order.indexOf(step) >= i;
        return <span key={k} className={`pill ${active ? "pill-danger" : "pill-muted"}`}>{i + 1}. {l}</span>;
      })}
    </div>
  );

  return (
    <div className="page" data-testid="buytag-page">
      <div className="container-nk" style={{ maxWidth: 620 }}>
        <span className="chip"><QrCode size={13} /> Order tag QR</span>
        <h1 style={{ fontSize: 30, margin: "12px 0 6px" }}>Get your <span className="neon">Safety QR Tag</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>Pick a plan for your tag type, enter your delivery address, pay securely — your QR tag is then printed & shipped to you.</p>

        {!verified && (
          <div className="glass card-pad" data-testid="buytag-verify-gate" style={{ padding: 16, marginBottom: 18, borderColor: "rgba(245,165,36,.5)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <ShieldAlert size={22} style={{ color: "#f5a524", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <b>Verify your mobile number first</b>
              <div className="muted" style={{ fontSize: 13 }}>Your QR’s emergency number must be verified before you can order — it takes a few seconds.</div>
            </div>
            <Link to="/settings" className="btn btn-primary btn-sm" data-testid="buytag-verify-link"><ShieldCheck size={15} /> Verify now</Link>
          </div>
        )}
        <Steps />

        {step === "tag" && (
          <div className="glass card-pad" style={{ padding: 24 }} data-testid="buytag-tag">
            <h2 style={{ fontSize: 20, marginBottom: 12 }}>Which tag?</h2>
            {tags.filter((t) => !t.qr_ordered).map((t) => {
              const m = TAG_META[t.tag_type] || TAG_META.other;
              return (
                <button key={t.id} onClick={() => { setTid(t.id); setStep("plan"); }} data-testid={`pick-tag-${t.name}`}
                  className="glass glass-hover" style={{ width: "100%", textAlign: "left", padding: 14, marginBottom: 10, border: "1px solid var(--panel-brd)", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: "none", color: "inherit" }}>
                  <div className="brand-badge" style={{ borderRadius: 10, width: 40, height: 40 }}>{m.icon}</div>
                  <div style={{ flex: 1 }}><b>{t.name}</b><div className="muted" style={{ fontSize: 13 }}>{m.label}{t.description ? ` · ${t.description}` : ""}</div></div>
                  <ChevronRight size={18} className="muted" />
                </button>
              );
            })}
            <div style={{ borderTop: "1px solid var(--panel-brd)", marginTop: 14, paddingTop: 16 }}>
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>…or add a new tag</h3>
              <form onSubmit={addTag}>
                <div className="field"><label>Name</label><input className="input" value={newT.name} onChange={(e) => setNewT({ ...newT, name: e.target.value })} required data-testid="newt-name" placeholder="e.g. Aarav's school bag" /></div>
                <div className="grid grid-2">
                  <div className="field"><label>Type</label><select className="input" value={newT.tag_type} onChange={(e) => setNewT({ ...newT, tag_type: e.target.value })} data-testid="newt-type">{TYPES.map((t) => <option key={t} value={t}>{TAG_META[t].label}</option>)}</select></div>
                  <div className="field"><label>Description</label><input className="input" value={newT.description} onChange={(e) => setNewT({ ...newT, description: e.target.value })} data-testid="newt-desc" /></div>
                </div>
                {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{err}</p>}
                <button className="btn btn-ghost btn-block" disabled={addingT} data-testid="newt-submit"><Plus size={16} /> {addingT ? "Adding…" : "Add & continue"}</button>
              </form>
            </div>
          </div>
        )}

        {step === "plan" && (
          <div className="glass card-pad" style={{ padding: 24 }} data-testid="buytag-plan">
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Choose a plan</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>For {chosenT?.name || "your tag"} ({TAG_META[chosenT?.tag_type]?.label || "tag"}) · your QR stays active for the plan's validity, then you can recharge.</p>
            {plans.length === 0 && <p className="muted">No plans available for this tag type yet. Ask admin to add tag plans.</p>}
            <div className="grid grid-2">
              {plans.map((p) => (
                <button key={p.id} onClick={() => setPlanId(p.id)} data-testid={`pick-tagplan-${p.id}`}
                  className="glass glass-hover card-pad" style={{ textAlign: "left", cursor: "pointer", color: "inherit", border: planId === p.id ? "2px solid var(--accent)" : "1px solid var(--panel-brd)" }}>
                  {p.popular && <span className="pill pill-danger" style={{ marginBottom: 6 }}>Most popular</span>}
                  <h3 style={{ fontSize: 18, margin: "4px 0" }}>{p.name}</h3>
                  <div className="neon" style={{ fontFamily: "'Chakra Petch'", fontSize: 24, fontWeight: 700 }}>{rupee(p.price_cents)}<span className="muted" style={{ fontSize: 13 }}> · {p.validity_days ?? 30} days</span></div>
                  {p.description && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{p.description}</p>}
                  {p.features?.length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 12 }} className="muted">{p.features.slice(0, 4).map((f, i) => <li key={i}>{f}</li>)}</ul>}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => setStep("tag")}>Back</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!planId} onClick={() => setStep("address")} data-testid="tagplan-continue">Continue <ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {step === "address" && (
          <form className="glass card-pad" style={{ padding: 24 }} onSubmit={pay} data-testid="buytag-address">
            <h2 style={{ fontSize: 20, marginBottom: 4 }}><MapPin size={18} style={{ verticalAlign: "-3px" }} /> Delivery address</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>We'll print & ship your QR tag here.</p>
            <div className="grid grid-2">
              <div className="field"><label>Full name</label><input className="input" value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} required data-testid="taddr-name" /></div>
              <div className="field"><label>Mobile</label><input className="input" value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} required data-testid="taddr-phone" placeholder="10-digit" /></div>
            </div>
            <div className="field"><label>Address line 1</label><input className="input" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} required data-testid="taddr-line1" placeholder="House no, street" /></div>
            <div className="field"><label>Address line 2 (optional)</label><input className="input" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} data-testid="taddr-line2" /></div>
            <div className="grid grid-2">
              <div className="field"><label>City</label><input className="input" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} required data-testid="taddr-city" /></div>
              <div className="field"><label>Pincode</label><input className="input" value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} required data-testid="taddr-pincode" /></div>
            </div>
            <div className="field"><label>Landmark (optional)</label><input className="input" value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} data-testid="taddr-landmark" /></div>

            {tokens >= 10 && (
              <label className="glass" style={{ padding: 12, borderRadius: 12, margin: "6px 0 10px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", borderColor: useTok ? "var(--accent)" : "var(--panel-brd)" }} data-testid="use-tokens-toggle">
                <input type="checkbox" checked={useTok} onChange={(e) => setUseTok(e.target.checked)} />
                <span style={{ fontSize: 13.5 }}>Use my <b>{tokens} tokens</b> — ₹{maxDiscRs} off</span>
              </label>
            )}
            <div className="glass" style={{ padding: 14, borderRadius: 14, margin: "0 0 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div className="muted" style={{ fontSize: 12 }}>You pay</div><div style={{ fontFamily: "'Chakra Petch'", fontSize: 22, fontWeight: 700 }}>₹{payRs.toLocaleString("en-IN")}{useTok && maxDiscRs > 0 && <span className="muted" style={{ fontSize: 13, textDecoration: "line-through", marginLeft: 8 }}>₹{planRs.toLocaleString("en-IN")}</span>}</div></div>
              <div style={{ textAlign: "right" }}><div className="muted" style={{ fontSize: 12 }}>{chosenP?.name}</div><div className="pill pill-ok">{chosenP?.validity_days ?? 365} days validity</div></div>
            </div>
            {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="buytag-error">{err}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep("plan")}>Back</button>
              {verified ? (
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={busy} data-testid="tagpay-btn"><CreditCard size={17} /> {busy ? "Processing…" : `Pay ₹${payRs.toLocaleString("en-IN")} & order`}</button>
              ) : (
                <Link to="/settings" className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} data-testid="tagpay-btn-locked"><ShieldCheck size={16} /> Verify number to continue</Link>
              )}
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="glass card-pad center" style={{ padding: 34 }} data-testid="buytag-done">
            <CheckCircle2 size={60} color="#2fcf7a" />
            <h2 style={{ fontSize: 26, marginTop: 14 }}>Order placed! 🎉</h2>
            <p className="muted" style={{ marginTop: 6 }}>Payment received. Your QR tag is now being generated and will be shipped to your address.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              <Link to={`/orders/${doneOrder}`} className="btn btn-primary" data-testid="tag-go-tracking"><ShieldCheck size={16} /> Track my order</Link>
              <button className="btn btn-ghost" onClick={() => nav("/tags")}>My tags</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
