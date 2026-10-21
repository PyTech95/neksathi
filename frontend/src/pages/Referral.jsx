import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, Gift, Copy, Share2, Coins, Users, Check, Ticket } from "lucide-react";

export default function Referral() {
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setR((await api.get("/me/referral")).data); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1800); }
    catch { window.prompt("Copy:", text); }
  };
  const shareMsg = r ? `Join me on Nek Sathi — vehicle & family safety QR. Use my referral code ${r.code} and we both get bonus tokens! ${r.link}` : "";
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(shareMsg)}`, "_blank");
  const nativeShare = async () => {
    if (navigator.share) { try { await navigator.share({ title: "Nek Sathi", text: shareMsg, url: r.link }); } catch {} }
    else copy(r.link, "link");
  };

  const apply = async (e) => {
    e.preventDefault(); setMsg(""); setBusy(true);
    try {
      const res = await api.post("/me/referral/apply", { code: code.trim() });
      setMsg(`✓ ${res.data.note || "Referral applied!"}`); setCode(""); load();
    } catch (e) { setMsg(e?.response?.data?.detail || "Could not apply code"); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page" data-testid="referral-page">
      <div className="container-nk" style={{ maxWidth: 620 }}>
        <Link to="/settings" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Settings</Link>
        <h1 style={{ fontSize: 30, marginBottom: 4 }}><Gift size={26} style={{ verticalAlign: "-4px" }} /> Refer &amp; <span className="neon">earn</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>Invite friends. When they buy their first plan, <b>you get {r?.reward_referrer} tokens</b> and <b>they get {r?.reward_referred}</b>. {r?.tokens_per_rupee} tokens = ₹1 off on any plan.</p>

        {/* tokens balance */}
        <div className="glass card-pad" style={{ padding: 20, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }} data-testid="token-balance">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="brand-badge" style={{ borderRadius: 12, width: 44, height: 44 }}><Coins size={22} /></div>
            <div><div className="muted" style={{ fontSize: 12 }}>Your tokens</div><div style={{ fontFamily: "'Chakra Petch'", fontSize: 28, fontWeight: 700 }}>{r?.tokens ?? 0}</div></div>
          </div>
          <div style={{ textAlign: "right" }}><div className="muted" style={{ fontSize: 12 }}>Worth</div><div className="pill pill-ok" style={{ fontSize: 15 }}>₹{r?.tokens_value_rupees ?? 0} off</div></div>
        </div>

        {/* referral code + share */}
        <div className="glass card-pad" style={{ padding: 22, marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Your referral code</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontFamily: "'Chakra Petch'", fontSize: 30, fontWeight: 800, letterSpacing: 3, color: "#ff5a74" }} data-testid="my-ref-code">{r?.code}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(r.code, "code")} data-testid="copy-code">{copied === "code" ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy code</>}</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={whatsapp} data-testid="share-whatsapp" style={{ background: "#25D366", borderColor: "#25D366" }}><Share2 size={16} /> WhatsApp</button>
            <button className="btn btn-ghost" onClick={() => copy(r.link, "link")} data-testid="copy-link">{copied === "link" ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy link</>}</button>
            <button className="btn btn-ghost" onClick={nativeShare} data-testid="share-more"><Share2 size={16} /> Share…</button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 12, wordBreak: "break-all" }}>{r?.link}</div>
        </div>

        {/* referred count */}
        <div className="glass card-pad" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <Users size={20} className="muted" />
          <div><b>{r?.referred_count ?? 0}</b> <span className="muted">friend(s) joined with your code</span></div>
        </div>

        {/* apply a code (only if not already referred) */}
        {r?.already_referred ? (
          <div className="glass card-pad" style={{ padding: 18 }}>
            <span className="pill pill-ok"><Check size={12} /> Referral applied</span>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>You joined with {r?.referrer?.name ? <b>{r.referrer.name}</b> : "a friend"}'s code{r?.referrer?.code ? ` (${r.referrer.code})` : ""}. {r?.reward_referred} tokens are credited on your first plan purchase.</p>
          </div>
        ) : (
          <form className="glass card-pad" style={{ padding: 20 }} onSubmit={apply} data-testid="apply-ref-form">
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}><Ticket size={14} style={{ verticalAlign: "-2px" }} /> Got a referral code from a friend? Enter it once:</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="input" style={{ maxWidth: 220, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. AB12CD" maxLength={8} data-testid="apply-ref-code" />
              <button className="btn btn-primary" disabled={!code.trim() || busy} data-testid="apply-ref-submit">{busy ? "Applying…" : "Apply code"}</button>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Only one referral code can be applied per account, and only if you haven't used one before.</p>
            {msg && <p style={{ fontSize: 13, marginTop: 8, color: msg.startsWith("✓") ? "var(--ok)" : "var(--danger)" }} data-testid="apply-ref-msg">{msg}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
