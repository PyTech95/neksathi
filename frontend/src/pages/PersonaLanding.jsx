import { useParams, Link, Navigate } from "react-router-dom";
import { QrCode, ShieldPlus, Phone, MapPin, HeartPulse, IdCard, Baby, PackageSearch, ArrowLeft, CheckCircle2, Building2 } from "lucide-react";

const CONFIGS = {
  schools: {
    tag: "For Schools",
    icon: <Baby size={16} />,
    img: "https://images.unsplash.com/photo-1630830844072-b7ad174db3bc?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    title: ["Keep every child safe, ", "gate to gate"],
    intro: "Give every student a smart ID tag. A teacher, guard or good-samaritan can privately reach a parent in seconds — or raise a 'Kid needs help' alert with live location — without ever seeing anyone's phone number.",
    benefits: [
      { icon: <ShieldPlus size={22} />, t: "Guardian & medical on tap", d: "Blood group, allergies and next-of-kin — ready the instant it's needed." },
      { icon: <Phone size={22} />, t: "Private masked call", d: "Reach a parent through the Nek Sathi portal; numbers stay hidden." },
      { icon: <MapPin size={22} />, t: "Live location on 'Kid needs help'", d: "Emergency scans broadcast to guardian and school with a maps link." },
      { icon: <QrCode size={22} />, t: "Bulk pre-printed tags", d: "Order a batch, hand them out, each child self-activates in a tap." },
    ],
  },
  hospitals: {
    tag: "For Hospitals & Care",
    icon: <HeartPulse size={16} />,
    img: "https://images.unsplash.com/photo-1586324304780-c9a5031a3599?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    title: ["Emergency info for ", "every patient"],
    intro: "Wristband and ID tags that show an ICE (in-case-of-emergency) profile the moment they're scanned — blood group, allergies and a one-tap masked call to the guardian. Built for elderly care, wards and ambulances.",
    benefits: [
      { icon: <HeartPulse size={22} />, t: "ICE profile, instantly", d: "Paramedics see blood group and critical notes without any login." },
      { icon: <Phone size={22} />, t: "One-tap guardian call", d: "Connect to family privately through the portal — no number exposed." },
      { icon: <ShieldPlus size={22} />, t: "SOS broadcast", d: "An emergency scan alerts guardian and staff at once, with location." },
      { icon: <QrCode size={22} />, t: "Batch tags per ward", d: "Generate and print tags per department, activated on admission." },
    ],
  },
  offices: {
    tag: "For Offices",
    icon: <IdCard size={16} />,
    img: "https://images.unsplash.com/photo-1690378820474-b468b8ee64d3?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    title: ["Staff ID & lost-and-found, ", "sorted"],
    intro: "Turn staff badges, laptops and access cards into smart, recoverable assets. Found items reach their owner through Nek Sathi — without leaking anyone's personal details.",
    benefits: [
      { icon: <IdCard size={22} />, t: "Smart staff badges", d: "Each badge links to a private contact route for the employee." },
      { icon: <PackageSearch size={22} />, t: "Lost-and-found that works", d: "A finder scans, you're notified — devices and cards come back fast." },
      { icon: <Phone size={22} />, t: "Privacy by default", d: "All contact is masked through the portal; no numbers shared." },
      { icon: <QrCode size={22} />, t: "Bulk onboarding", d: "Generate a batch for the whole team; staff self-activate in seconds." },
    ],
  },
};

const STEPS = [
  { t: "Order a batch", d: "Tell us how many tags you need — we generate and you print (or we ship) pre-coded stickers." },
  { t: "Hand them out", d: "Give each person their tag. They scan and activate it with their details in one tap." },
  { t: "Safe & recoverable", d: "Any scan routes help privately — emergencies, contact and lost-and-found, all masked." },
];

export default function PersonaLanding() {
  const { persona } = useParams();
  const cfg = CONFIGS[persona];
  if (!cfg) return <Navigate to="/" replace />;

  return (
    <div className="page" data-testid={`persona-landing-${persona}`}>
      <div className="container-nk" style={{ paddingTop: 18 }}>
        <Link to="/" className="nav-link" style={{ display: "inline-flex", marginBottom: 18 }}><ArrowLeft size={16} /> Home</Link>

        {/* HERO */}
        <div className="grid" style={{ gridTemplateColumns: "1.1fr 1fr", gap: 32, alignItems: "center" }}>
          <div>
            <span className="chip">{cfg.icon} {cfg.tag}</span>
            <h1 style={{ fontSize: 44, lineHeight: 1.08, margin: "16px 0 14px" }}>{cfg.title[0]}<span className="neon">{cfg.title[1]}</span></h1>
            <p className="muted" style={{ fontSize: 17, lineHeight: 1.6, maxWidth: 520 }}>{cfg.intro}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <Link to="/register" className="btn btn-primary" data-testid="persona-cta-register"><CheckCircle2 size={17} /> Get started free</Link>
              <Link to="/contact" className="btn btn-ghost" data-testid="persona-cta-contact"><Building2 size={16} /> Request bulk order</Link>
            </div>
          </div>
          <div className="glass" style={{ overflow: "hidden", borderRadius: 20 }}>
            <img src={cfg.img} alt={cfg.tag} style={{ width: "100%", height: 340, objectFit: "cover", display: "block" }} />
          </div>
        </div>

        {/* BENEFITS */}
        <section style={{ padding: "48px 0 20px" }}>
          <div className="grid grid-2">
            {cfg.benefits.map((b, i) => (
              <div key={i} className="glass card-pad fade-up" data-testid={`persona-benefit-${i}`} style={{ padding: 22, display: "flex", gap: 14, animationDelay: `${i * 0.06}s` }}>
                <span style={{ color: "#22d3ee", flexShrink: 0 }}>{b.icon}</span>
                <div><h3 style={{ fontSize: 18, marginBottom: 4 }}>{b.t}</h3><p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{b.d}</p></div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section style={{ padding: "20px 0 30px" }}>
          <h2 style={{ fontSize: 30, marginBottom: 22 }}>How the <span className="neon">bulk order</span> works</h2>
          <div className="grid grid-3">
            {STEPS.map((s, i) => (
              <div key={i} className="glass card-pad" style={{ padding: 22 }}>
                <div className="brand-badge" style={{ width: 40, height: 40, borderRadius: 12, fontFamily: "Chakra Petch", fontWeight: 700 }}>{i + 1}</div>
                <h3 style={{ fontSize: 18, margin: "12px 0 4px" }}>{s.t}</h3>
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="glass card-pad center" style={{ padding: 40, margin: "10px 0 50px", borderColor: "rgba(34,211,238,.35)" }}>
          <h2 style={{ fontSize: 30 }}>Ready to roll it out?</h2>
          <p className="muted" style={{ fontSize: 16, marginTop: 6, marginBottom: 20 }}>Start free, or talk to us for a bulk order tailored to your {persona === "schools" ? "school" : persona === "hospitals" ? "hospital" : "office"}.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/register" className="btn btn-primary" data-testid="persona-cta-register-bottom">Get started free</Link>
            <Link to="/contact" className="btn btn-ghost" data-testid="persona-cta-contact-bottom">Request bulk order</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
