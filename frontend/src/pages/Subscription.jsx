import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Check, Sparkles, BadgeCheck, Loader2 } from "lucide-react";

const money = (cents, cur) => {
  const sym = cur === "INR" ? "₹" : cur === "USD" ? "$" : `${cur} `;
  return `${sym}${(cents / 100).toLocaleString()}`;
};

export default function Subscription() {
  const [plans, setPlans] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([api.get("/plans"), api.get("/subscriptions/me")]);
      setPlans(p.data);
      setCurrent(m.data.subscription);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const subscribe = async (code) => {
    setBusyCode(code); setNotice("");
    try {
      const r = await api.post("/subscriptions/checkout-session", { plan_code: code });
      if (r.data.dry_run) {
        // Preview mode: Stripe runs in DRY-RUN, so we confirm immediately
        await api.post("/subscriptions/confirm", { session_id: r.data.session_id });
        setNotice("✅ Subscription activated (Stripe test mode / DRY-RUN).");
        await load();
      } else if (r.data.url) {
        window.location.href = r.data.url; // real Stripe checkout
      }
    } catch (e) {
      setNotice(e?.response?.data?.detail || "Could not start checkout");
    } finally { setBusyCode(""); }
  };

  return (
    <div className="page" data-testid="subscription-page">
      <div className="container-nk" style={{ maxWidth: 900 }}>
        <div className="center" style={{ marginBottom: 8 }}>
          <span className="chip"><Sparkles size={13} /> Plans</span>
          <h1 style={{ fontSize: 38, marginTop: 14 }}>Choose your <span className="neon">protection</span></h1>
          <p className="muted" style={{ fontSize: 16 }}>Stripe test mode — no real charge in preview.</p>
        </div>

        {current && current.status === "active" && (
          <div className="glass card-pad center" style={{ padding: 16, margin: "18px auto", maxWidth: 520, borderColor: "rgba(34,211,238,.5)" }} data-testid="current-sub-banner">
            <BadgeCheck size={20} color="#22d3ee" style={{ verticalAlign: "-4px" }} /> You're on <b style={{ color: "#fff" }}>&nbsp;{current.plan_name}</b> &nbsp;·&nbsp; active
          </div>
        )}
        {notice && <p className="center" style={{ margin: "10px 0", color: "#22d3ee", fontWeight: 600 }} data-testid="sub-notice">{notice}</p>}

        {loading ? <div className="spinner" /> : (
          <div className="grid grid-2" style={{ marginTop: 24 }}>
            {plans.map((p, i) => {
              const isCurrent = current?.status === "active" && current?.plan_code === p.code;
              const featured = !!p.popular;
              return (
                <div key={p.id} className="glass glass-hover card-pad fade-up" data-testid={`plan-${p.code}`}
                  style={{ padding: 28, borderColor: featured ? "rgba(34,211,238,.5)" : undefined, animationDelay: `${i * 0.06}s` }}>
                  {featured && <span className="chip" style={{ marginBottom: 12 }}><Sparkles size={12} /> Most popular</span>}
                  <h2 style={{ fontSize: 26 }}>{p.name}</h2>
                  <p className="muted" style={{ fontSize: 14, minHeight: 40 }}>{p.description}</p>
                  <div style={{ margin: "14px 0" }}>
                    <span className="head neon" style={{ fontSize: 40, fontWeight: 700 }}>{money(p.price_cents, p.currency)}</span>
                    <span className="muted"> / {p.interval}</span>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px" }}>
                    {p.features.map((f, j) => (
                      <li key={j} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", fontSize: 14.5 }}>
                        <Check size={16} color="#22d3ee" /> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`btn btn-block ${featured ? "btn-primary" : "btn-ghost"}`}
                    disabled={isCurrent || busyCode === p.code}
                    onClick={() => subscribe(p.code)}
                    data-testid={`subscribe-${p.code}`}
                  >
                    {busyCode === p.code ? <><Loader2 size={16} className="spin" /> Processing…</> : isCurrent ? <><BadgeCheck size={16} /> Current plan</> : `Subscribe to ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
