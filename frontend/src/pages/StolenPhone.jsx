import { ShieldAlert, ExternalLink, Phone, Smartphone, FileText, Ban, Radio, CheckCircle2, RotateCcw } from "lucide-react";

const STEPS = [
  { icon: <Phone size={18} />, title: "1. Call 112 / local police", desc: "If the theft just happened, dial the emergency number 112 immediately and report it.", tone: "#ff3b5c" },
  { icon: <FileText size={18} />, title: "2. File a police complaint / FIR", desc: "Report the lost or stolen phone at your nearest police station (or online e-FIR where available). Keep the FIR / complaint number safe — you'll need it to block the device.", tone: "#22d3ee" },
  { icon: <Ban size={18} />, title: "3. Block the IMEI (CEIR)", desc: "Use the Government's CEIR / Sanchar Saathi portal to block your stolen device across all networks. You'll need the FIR number and your IMEI (dial *#06# on the phone, or check the box).", tone: "#f5a524" },
  { icon: <Radio size={18} />, title: "4. Inform your telecom operator", desc: "Ask your operator (Jio/Airtel/Vi/BSNL) to block the SIM and issue a duplicate so no one misuses your number for OTPs.", tone: "#c084fc" },
  { icon: <ShieldAlert size={18} />, title: "5. Report cyber fraud (if any)", desc: "If money was lost or accounts misused, file a complaint on the National Cyber Crime portal or call 1930 within the golden hour.", tone: "#fb7185" },
  { icon: <RotateCcw size={18} />, title: "6. Unblock when recovered", desc: "Got your phone back? Use the same CEIR / Sanchar Saathi portal to un-block the IMEI and start using it again.", tone: "#34d399" },
];

const LINKS = [
  { label: "CEIR — Block / Unblock Device", url: "https://www.ceir.gov.in/", sub: "Government Central Equipment Identity Register" },
  { label: "Sanchar Saathi Portal", url: "https://sancharsaathi.gov.in/", sub: "Block stolen mobile, IMEI & connection services" },
  { label: "National Cyber Crime Portal", url: "https://cybercrime.gov.in/", sub: "Report online / financial fraud" },
  { label: "Digital Police Portal", url: "https://digitalpolice.gov.in/", sub: "Citizen services & e-FIR (state-wise)" },
];

export default function StolenPhone() {
  return (
    <div className="page" data-testid="stolen-phone-page" style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Smartphone size={26} className="neon" />
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Lost or Stolen Phone</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Follow these steps to file an FIR and block your device on the official Government portals.</p>

      <div className="glass" style={{ padding: 16, borderRadius: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, borderColor: "rgba(245,165,36,.35)" }} data-testid="imei-tip">
        <span style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(245,165,36,.12)", color: "#f5a524", flexShrink: 0 }}><Smartphone size={20} /></span>
        <div>
          <div style={{ fontWeight: 700 }}>Find your IMEI now — before you need it</div>
          <div className="muted" style={{ fontSize: 13 }}>Dial <b style={{ color: "var(--text)" }}>*#06#</b> on your phone, or check Settings → About phone. Save it somewhere safe.</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={i} data-testid={`fir-step-${i + 1}`} className="glass" style={{ padding: 16, borderRadius: 14, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, color: s.tone, background: "rgba(255,255,255,.05)" }}>{s.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.title}</div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 3, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Official Government portals</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
        {LINKS.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer" data-testid={`gov-link-${l.url}`} className="glass glass-hover"
            style={{ padding: 16, borderRadius: 12, textDecoration: "none", color: "var(--text)", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{l.label}</span>
              <ExternalLink size={15} className="neon" style={{ flexShrink: 0 }} />
            </div>
            <span className="muted" style={{ fontSize: 12.5 }}>{l.sub}</span>
          </a>
        ))}
      </div>

      <div className="glass" style={{ padding: 16, borderRadius: 14, marginTop: 20, display: "flex", gap: 12, alignItems: "center", borderColor: "rgba(52,211,153,.3)" }} data-testid="fir-cyberfraud-tip">
        <CheckCircle2 size={22} style={{ color: "#34d399", flexShrink: 0 }} />
        <div style={{ fontSize: 13.5 }}>Financial fraud? Call the <b>Cyber Crime Helpline 1930</b> immediately — reporting within the first hour greatly improves the chance of recovering money.</div>
      </div>
    </div>
  );
}
