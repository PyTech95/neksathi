import { Link } from "react-router-dom";
import { ShieldCheck, QrCode, Bell, MapPin, Users, EyeOff, Zap, Car, ParkingCircle, Siren, ShieldAlert, Phone, Clock, CheckCircle2, Factory, Store, UserCheck, Video, Gauge, IdCard, Tag } from "lucide-react";

const DEMO_SCAN = "/scan/45805f3a-f10a-4534-bc7d-29699029b2cf";

const features = [
  { icon: <EyeOff size={22} />, title: "Number stays hidden", desc: "Strangers alert you without ever seeing your personal phone number." },
  { icon: <Bell size={22} />, title: "Instant scan alerts", desc: "Wrong-parking, accident, theft, fire or towing — you're notified in real time." },
  { icon: <Users size={22} />, title: "Family safety circle", desc: "Add trusted contacts per vehicle who also receive every alert." },
  { icon: <MapPin size={22} />, title: "Location on every alert", desc: "Scanners can attach GPS so help reaches the exact spot." },
  { icon: <Gauge size={22} />, title: "Live tracking & speed", desc: "Follow the vehicle live and get overspeed alerts automatically." },
  { icon: <Tag size={22} />, title: "One sticker, any asset", desc: "Cars, bags, pets, keys — a single QR turns anyone into a first-responder." },
  { icon: <IdCard size={22} />, title: "Digital Share-Tap cards", desc: "Share a contact card with a scan — save-to-phone vCard included." },
  { icon: <ShieldCheck size={22} />, title: "Lost mode & rewards", desc: "Flip an asset to lost mode and turn every scan into a recovery lead." },
];

const actions = [
  { icon: <ParkingCircle size={30} />, title: "Wrong Parking", desc: "Alert the owner to move — a 15-minute window starts, with a private call fallback.", bg: "linear-gradient(100deg,#f59e0b,#f5a524)" },
  { icon: <Siren size={30} />, title: "Accident", desc: "Instant alert to owner + family and a one-tap private call for fast help.", bg: "linear-gradient(100deg,#e11d48,#ff3b5c)" },
  { icon: <ShieldAlert size={30} />, title: "Theft / Suspicious", desc: "Flag suspicious activity, notify the family circle and connect privately.", bg: "linear-gradient(100deg,#7c3aed,#8b5cf6)" },
];

const lifecycle = [
  { icon: <Factory size={24} />, n: "Admin", t: "Generate & print", d: "Bulk-generate unique QR stickers, export & print them." },
  { icon: <Store size={24} />, n: "Dealer", t: "Distribute & sell", d: "Stickers are assigned to dealers who sell them to customers." },
  { icon: <UserCheck size={24} />, n: "Customer", t: "Scan & activate", d: "Scan, register the vehicle with OTP — QR becomes Active." },
  { icon: <ShieldCheck size={24} />, n: "Anyone", t: "Scan & help", d: "A stranger scans to alert the owner — privately, no app needed." },
];

const parkingSteps = [
  { icon: <Bell size={18} />, t: "Alert sent", d: "Reporter taps 'Alarm / Alert Owner'." },
  { icon: <Clock size={18} />, t: "15-min window", d: "Owner + family notified via app & WhatsApp." },
  { icon: <CheckCircle2 size={18} />, t: "I AM COMING", d: "Owner responds; reporter sees 'owner is coming'." },
  { icon: <Phone size={18} />, t: "Private call", d: "Still stuck? Call the owner — number stays hidden." },
];

const faqs = [
  { q: "Does the person scanning see my phone number?", a: "Never. All alerts and calls are routed through the Nek Sathi portal, so your number (and your family's) stays completely private." },
  { q: "Do people need to install an app to report an issue?", a: "No. Anyone can scan the QR and report wrong-parking, accident or theft straight from their browser — no login, no install." },
  { q: "What happens to a QR after it's activated?", a: "It's permanently linked to that vehicle. Re-scanning the sticker opens the emergency screen, not the setup screen." },
  { q: "Can my family get the alerts too?", a: "Yes — add up to 4 trusted contacts per vehicle and control who gets notified." },
];

export default function Landing() {
  return (
    <div data-testid="landing-page">
      {/* HERO */}
      <section className="container-nk" style={{ padding: "70px 22px 40px" }}>
        <div className="grid grid-2" style={{ alignItems: "center", gap: 40 }}>
          <div className="fade-up">
            <span className="chip" data-testid="landing-tagline">Har Musibat Mein, Ek Nek Sathi</span>
            <h1 style={{ fontSize: 52, lineHeight: 1.04, margin: "18px 0 16px" }}>
              One QR turns any stranger into a <span className="neon">first-responder</span>.
            </h1>
            <p className="muted" style={{ fontSize: 18, maxWidth: 520, lineHeight: 1.6 }}>
              Nek Sathi puts a smart safety QR on your vehicle and belongings. Wrong-parking alerts,
              accident & theft response, live tracking and family safety — all while your phone number stays private.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <Link to="/register" className="btn btn-primary" data-testid="hero-get-started"><QrCode size={18} /> Create your QR</Link>
              <Link to={DEMO_SCAN} className="btn btn-ghost" data-testid="hero-try-scan"><ShieldCheck size={17} /> Try a live scan demo</Link>
            </div>
            <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
              Admin demo: <b style={{ color: "#d9c9ff" }}>admin@safeqr.com</b> / <b style={{ color: "#d9c9ff" }}>admin1234</b>
            </p>
          </div>
          <div className="fade-up" style={{ animationDelay: ".15s" }}>
            <div className="glass card-pad" style={{ padding: 34 }}>
              <div className="scanner">
                <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
                <span className="sweep" />
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}><QrCode size={120} color="#22d3ee" strokeWidth={1.2} /></div>
              </div>
              <div className="center" style={{ marginTop: 20 }}>
                <div className="chip"><Car size={13} /> Scanning MH12 AB 1234</div>
                <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Wrong parking · Accident · Theft · Live track</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STAT BAND */}
      <section className="container-nk" style={{ padding: "10px 22px 30px" }}>
        <div className="glass card-pad grid grid-4" style={{ padding: 24, textAlign: "center" }}>
          {[["10,000+", "QR / batch"], ["3 taps", "to report & help"], ["0", "numbers exposed"], ["15 min", "response window"]].map(([n, l], i) => (
            <div key={i} data-testid={`stat-band-${i}`}><div className="stat-num neon">{n}</div><div className="muted" style={{ fontSize: 13 }}>{l}</div></div>
          ))}
        </div>
      </section>

      {/* EMERGENCY ACTIONS */}
      <section className="container-nk" style={{ padding: "40px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 6 }}>Scan → pick a problem → <span className="neon">help instantly</span></h2>
        <p className="muted" style={{ marginBottom: 26, fontSize: 16 }}>No app, no login. A stranger taps one button and you're alerted — privately.</p>
        <div className="grid grid-3">
          {actions.map((a, i) => (
            <div key={i} className="glass glass-hover card-pad fade-up" data-testid={`action-${i}`} style={{ animationDelay: `${i * 0.06}s` }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: a.bg, display: "grid", placeItems: "center", color: "#fff", marginBottom: 14 }}>{a.icon}</div>
              <h3 style={{ fontSize: 21, marginBottom: 8 }}>{a.title}</h3>
              <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.55 }}>{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WRONG PARKING TIMELINE */}
      <section className="container-nk" style={{ padding: "30px 22px" }}>
        <div className="glass card-pad" style={{ padding: 30 }}>
          <h2 style={{ fontSize: 28, marginBottom: 6 }}>How a <span className="neon">wrong-parking</span> alert plays out</h2>
          <p className="muted" style={{ marginBottom: 22 }}>Fast, fair and private — for both sides.</p>
          <div className="grid grid-4">
            {parkingSteps.map((s, i) => (
              <div key={i} data-testid={`parking-step-${i}`} style={{ display: "flex", gap: 12 }}>
                <div className="alert-ico" style={{ background: "rgba(34,211,238,.14)", color: "#22d3ee", flexShrink: 0 }}>{s.icon}</div>
                <div><h3 style={{ fontSize: 16 }}>{s.t}</h3><p className="muted" style={{ fontSize: 13.5 }}>{s.d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LIFECYCLE */}
      <section className="container-nk" style={{ padding: "40px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 6 }}>From factory to <span className="neon">family</span></h2>
        <p className="muted" style={{ marginBottom: 26, fontSize: 16 }}>One QR sticker, tracked at every step.</p>
        <div className="grid grid-4">
          {lifecycle.map((s, i) => (
            <div key={i} className="glass card-pad" data-testid={`lifecycle-${i}`}>
              <div className="brand-badge" style={{ borderRadius: 12 }}>{s.icon}</div>
              <div className="chip" style={{ marginTop: 12 }}>{s.n}</div>
              <h3 style={{ fontSize: 18, margin: "10px 0 4px" }}>{s.t}</h3>
              <p className="muted" style={{ fontSize: 14 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="container-nk" style={{ padding: "40px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 8 }}>Everything a modern <span className="neon">safety network</span> needs</h2>
        <div className="grid grid-4" style={{ marginTop: 20 }}>
          {features.map((f, i) => (
            <div key={i} className="glass glass-hover card-pad fade-up" data-testid={`feature-${i}`} style={{ animationDelay: `${i * 0.04}s` }}>
              <div style={{ color: "#22d3ee", marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, marginBottom: 8 }}>{f.title}</h3>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRIVACY BAND */}
      <section className="container-nk" style={{ padding: "30px 22px" }}>
        <div className="glass card-pad" style={{ padding: 40, display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap", borderColor: "rgba(34,211,238,.4)" }}>
          <EyeOff size={54} color="#22d3ee" />
          <div style={{ flex: 1, minWidth: 260 }}>
            <h2 style={{ fontSize: 28, marginBottom: 6 }}>Privacy is the <span className="neon">whole point</span></h2>
            <p className="muted" style={{ fontSize: 15.5, lineHeight: 1.6 }}>Reporters never see your number, address, or family details. Every call is bridged through the Nek Sathi portal, and every alert shows only what's needed to help your vehicle.</p>
          </div>
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
        <div className="glass card-pad center" style={{ padding: 50 }}>
          <h2 style={{ fontSize: 36, marginBottom: 12 }}>Ready to make your vehicle <span className="neon">safer</span>?</h2>
          <p className="muted" style={{ fontSize: 17, marginBottom: 26 }}>Create your first QR sticker free. No app install required to scan.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/register" className="btn btn-primary" data-testid="cta-register"><QrCode size={18} /> Get started now</Link>
            <Link to={DEMO_SCAN} className="btn btn-ghost" data-testid="cta-try-scan"><ShieldCheck size={17} /> Try a live scan</Link>
          </div>
        </div>
        <p className="center muted" style={{ marginTop: 40, fontSize: 13 }}>
          Made with ❤️ in India · Nek Sathi · <Link to="/contact" className="neon" data-testid="landing-contact-link" style={{ textDecoration: "none" }}>Contact us</Link>
        </p>
      </section>
    </div>
  );
}
