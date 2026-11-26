import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Wallet as WalletIcon, Gift, ArrowDownLeft, ArrowUpRight, Loader2, Coins, ChevronRight } from "lucide-react";

const PAGE = 20;

const REASON = {
  referral_bonus_referrer: "Referral reward — a friend bought a plan",
  referral_bonus_referred: "Welcome bonus — referral applied",
  redeemed_discount: "Redeemed on a plan",
};
const reasonLabel = (r) => REASON[r] || "Adjustment";

const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch (_) { return ""; } };

export default function Wallet() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);

  const load = async (nextSkip = 0) => {
    if (nextSkip === 0) setLoading(true); else setMore(true);
    try {
      const r = await api.get("/me/wallet", { params: { skip: nextSkip, limit: PAGE } });
      setData(r.data);
      setHistory((prev) => (nextSkip === 0 ? r.data.history : [...prev, ...r.data.history]));
      setSkip(nextSkip);
    } finally { setLoading(false); setMore(false); }
  };
  useEffect(() => { load(0); }, []);

  const hasMore = data && history.length < data.total;

  return (
    <div className="page" data-testid="wallet-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <span className="chip"><WalletIcon size={13} /> Wallet</span>
        <h1 style={{ fontSize: 30, marginTop: 12, marginBottom: 16 }}>My <span className="neon">wallet</span></h1>

        <div className="glass card-pad" data-testid="wallet-balance" style={{ padding: 24, marginBottom: 16, background: "linear-gradient(135deg, rgba(179,18,47,.22), rgba(233,37,70,.10))", border: "1px solid rgba(233,37,70,.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13 }}><Coins size={16} /> Nek Coins balance</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{loading ? "—" : (data?.tokens ?? 0)}</span>
            <span className="muted" style={{ fontSize: 15 }}>coins</span>
          </div>
          <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>
            ≈ <b style={{ color: "var(--text)" }}>₹{data?.value_rupees ?? 0}</b> off your next plan
            {data ? <span style={{ marginLeft: 6, fontSize: 12.5 }}>({data.tokens_per_rupee} coins = ₹1)</span> : null}
          </div>
        </div>

        <button type="button" className="glass glass-hover" onClick={() => nav("/referral")} data-testid="wallet-earn"
          style={{ width: "100%", textAlign: "left", cursor: "pointer", color: "inherit", border: "1px solid var(--panel-brd)", padding: "14px 16px", borderRadius: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(245,165,36,.16)", border: "1px solid rgba(245,165,36,.4)", color: "#f5a524" }}><Gift size={18} /></span>
          <span style={{ flex: 1 }}><b>Earn more coins</b><div className="muted" style={{ fontSize: 13 }}>Refer friends — coins credit after their first plan</div></span>
          <ChevronRight size={18} className="muted" />
        </button>

        <h2 style={{ fontSize: 18, margin: "0 0 10px" }}>History</h2>
        {loading ? (
          <div className="spinner" />
        ) : history.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 36 }} data-testid="wallet-empty">
            <Coins size={34} color="var(--muted)" />
            <p className="muted" style={{ marginTop: 10 }}>No coin activity yet. Refer a friend to earn your first coins.</p>
          </div>
        ) : (
          <div className="glass" style={{ overflow: "hidden" }}>
            {history.map((e) => {
              const credit = e.delta >= 0;
              return (
                <div key={e.id} data-testid={`wallet-row-${e.id}`} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", borderBottom: "1px solid var(--panel-brd)" }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: credit ? "rgba(52,211,153,.14)" : "rgba(255,59,92,.14)", color: credit ? "#34d399" : "#ff5a74", border: `1px solid ${credit ? "rgba(52,211,153,.35)" : "rgba(255,59,92,.35)"}` }}>
                    {credit ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{reasonLabel(e.reason)}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{fmtDate(e.created_at)}</div>
                  </div>
                  <b style={{ flexShrink: 0, color: credit ? "#34d399" : "#ff5a74" }}>{credit ? "+" : ""}{e.delta}</b>
                </div>
              );
            })}
            {hasMore && (
              <button type="button" onClick={() => load(skip + PAGE)} disabled={more} data-testid="wallet-more"
                style={{ width: "100%", padding: "12px", background: "none", border: "none", color: "var(--accent)", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                {more ? <Loader2 size={15} className="spin" /> : `View more (${data.total - history.length} left)`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
