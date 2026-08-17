import { Link } from "react-router-dom";
import {
  ShieldCheck, QrCode, Bell, MapPin, Users, EyeOff, Car, ParkingCircle, Siren, ShieldAlert,
  Phone, Clock, CheckCircle2, ScanLine, Link2, Volume2, Lock, Camera, Signal, BatteryLow,
  HeartHandshake, BarChart3, Route, ArrowRight, Baby, Dog, Luggage, Fingerprint, LifeBuoy,
} from "lucide-react";

const DEMO_SCAN = "/scan/45805f3a-f10a-4534-bc7d-29699029b2cf";

const IMG = {
  personalSafety: "https://images.unsplash.com/photo-1642326343988-bcba5111079f?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  family: "https://images.pexels.com/photos/28700034/pexels-photo-28700034.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  antiTheft: "https://images.pexels.com/photos/33335189/pexels-photo-33335189.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  smartQr: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
  child: "https://images.pexels.com/photos/207697/pexels-photo-207697.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  elderly: "https://images.pexels.com/photos/4894604/pexels-photo-4894604.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  pet: "https://images.pexels.com/photos/14520081/pexels-photo-14520081.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  luggage: "https://images.pexels.com/photos/30782813/pexels-photo-30782813.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  vehicle: "https://images.unsplash.com/photo-1623346483743-b968a27ed34c?crop=entropy&cs=srgb&fm=jpg&q=85&w=940",
};

const pillars = [
  {
    key: "personal-safety", chip: "Personal Safety", icon: <LifeBuoy size={26} />,
    accent: "#22d3ee", tint: "rgba(34,211,238,.14)", brd: "rgba(34,211,238,.4)",
    title: "Help is always one tap away",
    blurb: "A panic button that actually works. Trigger a silent SOS, blast a siren, share your live location and reach the right helpline — instantly.",
    img: IMG.personalSafety, link: "/safety", linkLabel: "Open Safety",
    features: [
      { icon: <Siren size={17} />, label: "One-Tap SOS with auto-escalation" },
      { icon: <Volume2 size={17} />, label: "Loud emergency siren" },
      { icon: <Users size={17} />, label: "Trusted emergency contacts" },
      { icon: <MapPin size={17} />, label: "Live location share link" },
      { icon: <Phone size={17} />, label: "National & local helplines" },
      { icon: <Link2 size={17} />, label: "Safe link & file scanner" },
    ],
  },
  {
    key: "family-guardian", chip: "Family Guardian", icon: <Users size={26} />,
    accent: "#8b5cf6", tint: "rgba(124,58,237,.18)", brd: "rgba(124,58,237,.45)",
    title: "Know your loved ones are safe",
    blurb: "See your family on one live map, get pinged when kids reach school, check in with a tap and never miss a low battery or an unanswered SOS.",
    img: IMG.family, link: "/family", linkLabel: "Open Family", reverse: true,
    features: [
      { icon: <MapPin size={17} />, label: "Live family map" },
      { icon: <Bell size={17} />, label: "Place alerts (arrive / leave)" },
      { icon: <HeartHandshake size={17} />, label: "\"Are you okay?\" check-ins" },
      { icon: <BatteryLow size={17} />, label: "Low-battery alerts" },
      { icon: <ShieldAlert size={17} />, label: "Portal-wide SOS alarm" },
      { icon: <BarChart3 size={17} />, label: "Weekly safety digest" },
    ],
  },
  {
    key: "anti-theft", chip: "Anti-Theft & Mobile Security", icon: <Lock size={26} />,
    accent: "#ff3b5c", tint: "rgba(255,59,92,.14)", brd: "rgba(255,59,92,.45)",
    title: "Outsmart phone thieves",
    blurb: "Register your devices and fight back remotely — lock the phone, sound a siren, catch the intruder's selfie and get alerted the moment the SIM is swapped.",
    img: IMG.antiTheft, link: "/theft-protection", linkLabel: "Open Anti-Theft",
    features: [
      { icon: <Lock size={17} />, label: "Remote device lock" },
      { icon: <Camera size={17} />, label: "Intruder selfie capture" },
      { icon: <Signal size={17} />, label: "SIM-change alert" },
      { icon: <Volume2 size={17} />, label: "Remote siren" },
      { icon: <MapPin size={17} />, label: "Geo-fenced safe zones" },
      { icon: <Fingerprint size={17} />, label: "Device registry & FIR guide" },
    ],
  },
  {
    key: "smart-qr", chip: "Smart QR", icon: <QrCode size={26} />,
    accent: "#2dd4bf", tint: "rgba(45,212,191,.14)", brd: "rgba(45,212,191,.4)",
    title: "One sticker turns strangers into helpers",
    blurb: "Put a smart QR on cars, kids, pets and bags. Anyone can scan to reach you for wrong-parking, an accident or a lost item — your number always stays hidden.",
    img: IMG.smartQr, link: DEMO_SCAN, linkLabel: "Try a live scan", reverse: true,
    features: [
      { icon: <ScanLine size={17} />, label: "Scan-to-alert, no app needed" },
      { icon: <EyeOff size={17} />, label: "Private masked calling" },
      { icon: <ParkingCircle size={17} />, label: "Wrong-parking 15-min window" },
      { icon: <Car size={17} />, label: "Live vehicle tracking" },
      { icon: <ShieldCheck size={17} />, label: "Lost mode & rewards" },
      { icon: <QrCode size={17} />, label: "Digital share-tap cards" },
    ],
  },
];

const flow = [
  { icon: <Siren size={22} />, t: "Tap SOS or scan a QR", d: "You raise an alert — or a stranger scans your smart QR. No app, no login needed to help." },
  { icon: <Route size={22} />, t: "We alert & auto-escalate", d: "Your family and trusted contacts get a WhatsApp, push and a private call — and it escalates if unanswered." },
  { icon: <CheckCircle2 size={22} />, t: "Help reaches you", d: "Live location, siren and check-ins bring the right help to the exact spot, fast." },
];

const personas = [
  { img: IMG.child, tag: "School kids", title: "Safe to & from school", desc: "A guardian tag + place alerts when they arrive or leave. A teacher or stranger can reach you privately.", link: "/for/schools" },
  { img: IMG.elderly, tag: "Patients & elderly", title: "Emergency ICE profile", desc: "Blood group, allergies and a one-tap masked call to the guardian — first-responders act in seconds.", link: "/for/hospitals" },
  { img: IMG.pet, tag: "Pets", title: "Bring them home", desc: "A collar QR lets any finder reach you instantly and share your pet's live location." },
  { img: IMG.luggage, tag: "Travel & luggage", title: "Never lose a bag", desc: "Tag suitcases and gadgets — a finder pings you, no personal details revealed." },
  { img: IMG.vehicle, tag: "Vehicles", title: "Cars, bikes & more", desc: "Wrong-parking, accident and theft response with a private masked call and live tracking." },
];

const testimonials = [
  { quote: "My son's school bag has a Nek Sathi tag. When he got lost at a fair, a volunteer scanned it and called me in seconds — without ever seeing my number.", name: "Priya, parent", place: "Pune" },
  { quote: "We put ICE tags on every elderly patient. Paramedics instantly see blood group and reach the family. It has genuinely saved time in emergencies.", name: "Dr. Mehta", place: "City Care Hospital" },
  { quote: "Someone tried to grab my phone. The remote lock + siren kicked in and I got the intruder's selfie. Got it back the same day.", name: "Arjun", place: "Bengaluru" },
];

const faqs = [
  { q: "Does the person scanning or my SOS reveal my phone number?", a: "Never. All alerts and calls are routed through the Nek Sathi portal, so your number (and your family's) stays completely private." },
  { q: "Do people need an app to report an issue or help?", a: "No. Anyone can scan the QR and report wrong-parking, accident or theft straight from their browser — no login, no install." },
  { q: "How does the SOS reach my family?", a: "It fans out over WhatsApp, push and a private masked call to your trusted contacts and family circle — and auto-escalates if nobody responds in time." },
  { q: "Can I control who gets which alerts?", a: "Yes — set trusted contacts, safe zones, quiet hours, place-alert rules and the low-battery threshold, all from the app." },
];

function Pillar({ p, i }) {
  const media = (
    <div className="fade-up" style={{ position: "relative", borderRadius: 20, overflow: "hidden", border: `1px solid ${p.brd}`, minHeight: 300, background: "#0d0d1a" }}>
      <img src={p.img} alt={p.chip} loading="lazy" style={{ width: "100%", height: "100%", minHeight: 300, objectFit: "cover", opacity: 0.9, display: "block" }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(3,3,8,0) 40%, rgba(3,3,8,.75) 100%)` }} />
      <span className="chip" style={{ position: "absolute", left: 16, top: 16, background: "rgba(3,3,8,.6)", backdropFilter: "blur(6px)", color: p.accent, borderColor: p.brd }}>
        {p.icon} {p.chip}
      </span>
    </div>
  );
  const text = (
    <div>
      <div style={{ width: 58, height: 58, borderRadius: 16, background: p.tint, color: p.accent, display: "grid", placeItems: "center", marginBottom: 16, border: `1px solid ${p.brd}` }}>{p.icon}</div>
      <h2 style={{ fontSize: 32, lineHeight: 1.1, margin: "0 0 10px" }}>{p.title}</h2>
      <p className="muted" style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 520 }}>{p.blurb}</p>
      <div className="grid grid-2" style={{ gap: 10, marginTop: 20 }}>
        {p.features.map((f, k) => (
          <div key={k} data-testid={`pillar-${p.key}-feature-${k}`} className="glass" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 12 }}>
            <span style={{ color: p.accent, flexShrink: 0, display: "grid", placeItems: "center" }}>{f.icon}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{f.label}</span>
          </div>
        ))}
      </div>
      <Link to={p.link} data-testid={`pillar-${p.key}-link`} className="btn btn-ghost" style={{ marginTop: 22, borderColor: p.brd, color: p.accent }}>
        {p.linkLabel} <ArrowRight size={16} />
      </Link>
    </div>
  );
  return (
    <section className="container-nk" style={{ padding: "56px 22px" }}>
      <div className="grid grid-2" style={{ alignItems: "center", gap: 44 }}>
        {p.reverse ? <>{media}{text}</> : <>{text}{media}</>}
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div data-testid="landing-page">
      {/* HERO */}
      <section className="container-nk" style={{ padding: "70px 22px 40px" }}>
        <div className="grid grid-2" style={{ alignItems: "center", gap: 40 }}>
          <div className="fade-up">
            <span className="chip" data-testid="landing-tagline">Har Musibat Mein, Ek Nek Sathi</span>
            <h1 style={{ fontSize: 52, lineHeight: 1.04, margin: "18px 0 16px" }}>
              Total safety, <span className="neon">one tap</span> away.
            </h1>
            <p className="muted" style={{ fontSize: 18, maxWidth: 540, lineHeight: 1.6 }}>
              Nek Sathi is your all-in-one safety companion — a panic-button SOS, a live family guardian,
              anti-theft for your phone, and a smart QR that turns any stranger into a first-responder.
              All while your phone number stays completely private.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <Link to="/register" className="btn btn-primary" data-testid="hero-get-started"><QrCode size={18} /> Get started free</Link>
              <Link to={DEMO_SCAN} className="btn btn-ghost" data-testid="hero-try-scan"><ScanLine size={17} /> Try a live scan demo</Link>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
              {pillars.map((p) => (
                <a key={p.key} href={`#${p.key}`} data-testid={`hero-jump-${p.key}`} className="chip" style={{ textDecoration: "none", color: p.accent, borderColor: p.brd, background: p.tint }}>
                  {p.icon} {p.chip}
                </a>
              ))}
            </div>
          </div>
          <div className="fade-up" style={{ animationDelay: ".15s" }}>
            <div className="glass card-pad" style={{ padding: 34 }}>
              <div className="scanner">
                <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
                <span className="sweep" />
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><QrCode size={120} color="#22d3ee" strokeWidth={1.2} /></div>
              </div>
              <div className="center" style={{ marginTop: 20 }}>
                <div className="chip"><ShieldCheck size={13} /> SOS · Family · Anti-Theft · Smart QR</div>
                <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>One app for every emergency, big or small.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STAT BAND */}
      <section className="container-nk" style={{ padding: "10px 22px 20px" }}>
        <div className="glass card-pad grid grid-4" style={{ padding: 24, textAlign: "center" }}>
          {[["4-in-1", "safety suite"], ["3 taps", "to alert & help"], ["0", "numbers exposed"], ["24×7", "auto-escalation"]].map(([n, l], i) => (
            <div key={i} data-testid={`stat-band-${i}`}><div className="stat-num neon">{n}</div><div className="muted" style={{ fontSize: 13 }}>{l}</div></div>
          ))}
        </div>
      </section>

      {/* FEATURE PILLARS */}
      <div style={{ position: "relative" }}>
        {pillars.map((p, i) => (
          <div id={p.key} key={p.key} data-testid={`pillar-${p.key}`} style={{ scrollMarginTop: 90 }}>
            <Pillar p={p} i={i} />
          </div>
        ))}
      </div>

      {/* HOW IT WORKS */}
      <section className="container-nk" style={{ padding: "40px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 6 }}>How it <span className="neon">works</span></h2>
        <p className="muted" style={{ marginBottom: 26, fontSize: 16 }}>The same simple flow behind every Nek Sathi feature.</p>
        <div className="grid grid-3">
          {flow.map((s, i) => (
            <div key={i} className="glass card-pad fade-up" data-testid={`flow-step-${i}`} style={{ animationDelay: `${i * 0.07}s`, position: "relative" }}>
              <div style={{ position: "absolute", right: 18, top: 14, fontFamily: "Chakra Petch", fontSize: 40, fontWeight: 700, color: "rgba(124,58,237,.18)" }}>{i + 1}</div>
              <div className="alert-ico" style={{ background: "rgba(34,211,238,.14)", color: "#22d3ee" }}>{s.icon}</div>
              <h3 style={{ fontSize: 19, margin: "12px 0 6px" }}>{s.t}</h3>
              <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.55 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRIVACY BAND */}
      <section className="container-nk" style={{ padding: "20px 22px" }}>
        <div className="glass card-pad" style={{ padding: 40, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap", borderColor: "rgba(34,211,238,.4)" }}>
          <EyeOff size={54} color="#22d3ee" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <h2 style={{ fontSize: 28, marginBottom: 6 }}>Privacy is the <span className="neon">whole point</span></h2>
            <p className="muted" style={{ fontSize: 15.5, lineHeight: 1.6 }}>Reporters and helpers never see your number, address or family details. Every call is bridged through the Nek Sathi portal, and every alert shows only what's needed to help.</p>
          </div>
        </div>
      </section>

      {/* PERSONAS */}
      <section className="container-nk" style={{ padding: "40px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 6 }}>Protects <span className="neon">everyone you love</span></h2>
        <p className="muted" style={{ marginBottom: 26, fontSize: 16 }}>One smart safety network for the people and things that matter most.</p>
        <div className="grid grid-3">
          {personas.map((p, i) => (
            <div key={i} className="glass glass-hover fade-up" data-testid={`persona-${i}`} style={{ overflow: "hidden", animationDelay: `${i * 0.06}s` }}>
              <div style={{ height: 168, background: "#0d0d1a", position: "relative" }}>
                <img src={p.img} alt={p.tag} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.92 }} />
                <span className="chip" style={{ position: "absolute", left: 12, top: 12, background: "rgba(3,3,8,.6)", backdropFilter: "blur(6px)" }}>{p.tag}</span>
              </div>
              <div className="card-pad" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 19, marginBottom: 6 }}>{p.title}</h3>
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{p.desc}</p>
                {p.link && <Link to={p.link} className="neon" data-testid={`persona-link-${i}`} style={{ display: "inline-block", marginTop: 12, fontSize: 14, textDecoration: "none", fontWeight: 600 }}>Learn more →</Link>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="container-nk" style={{ padding: "40px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 6 }}>Trusted by <span className="neon">families & teams</span></h2>
        <p className="muted" style={{ marginBottom: 26, fontSize: 16 }}>Real moments where Nek Sathi made all the difference.</p>
        <div className="grid grid-3">
          {testimonials.map((t, i) => (
            <div key={i} className="glass card-pad fade-up" data-testid={`testimonial-${i}`} style={{ padding: 24, animationDelay: `${i * 0.06}s` }}>
              <div style={{ color: "#22d3ee", fontSize: 34, fontFamily: "Chakra Petch", lineHeight: 1, marginBottom: 8 }}>&ldquo;</div>
              <p style={{ fontSize: 15, lineHeight: 1.6 }}>{t.quote}</p>
              <p className="muted" style={{ fontSize: 13, marginTop: 14 }}><b style={{ color: "#d9c9ff" }}>{t.name}</b> · {t.place}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="container-nk" style={{ padding: "40px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 20 }}>Questions, <span className="neon">answered</span></h2>
        <div className="grid" style={{ gap: 12 }}>
          {faqs.map((f, i) => (
            <details key={i} className="glass card-pad" data-testid={`faq-${i}`} style={{ padding: 18 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontFamily: "Chakra Petch", fontSize: 17 }}>{f.q}</summary>
              <p className="muted" style={{ marginTop: 10, fontSize: 14.5, lineHeight: 1.6 }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-nk" style={{ padding: "30px 22px 90px" }}>
        <div className="glass card-pad center" style={{ padding: 50, borderColor: "rgba(124,58,237,.4)" }}>
          <h2 style={{ fontSize: 36, marginBottom: 12 }}>Your safety net, <span className="neon">ready in minutes</span></h2>
          <p className="muted" style={{ fontSize: 17, marginBottom: 26 }}>Create your free account and set up SOS, family and anti-theft in one place.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/register" className="btn btn-primary" data-testid="cta-register"><QrCode size={18} /> Get started now</Link>
            <Link to={DEMO_SCAN} className="btn btn-ghost" data-testid="cta-try-scan"><ScanLine size={17} /> Try a live scan</Link>
          </div>
        </div>
        <p className="center muted" style={{ marginTop: 40, fontSize: 13 }}>
          Made with ❤️ in India · Nek Sathi · <Link to="/contact" className="neon" data-testid="landing-contact-link" style={{ textDecoration: "none" }}>Contact us</Link>
        </p>
      </section>
    </div>
  );
}
