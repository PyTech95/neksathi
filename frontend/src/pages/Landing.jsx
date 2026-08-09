import { Link } from "react-router-dom";
import { ShieldCheck, QrCode, Bell, MapPin, Users, EyeOff, Zap, Car } from "lucide-react";

const features = [
  { icon: <EyeOff size={22} />, title: "Phone number stays hidden", desc: "Strangers can alert you instantly without ever seeing your personal number." },
  { icon: <Bell size={22} />, title: "Instant scan alerts", desc: "Emergency, wrong-parking, theft, fire or towing — you're notified in real time." },
  { icon: <Users size={22} />, title: "Family safety circle", desc: "Add up to 4 trusted contacts per vehicle with per-alert channel controls." },
  { icon: <MapPin size={22} />, title: "Location on every alert", desc: "Scanners can attach GPS coordinates so help reaches the exact spot." },
  { icon: <ShieldCheck size={22} />, title: "Lost mode & rewards", desc: "Flip a vehicle to lost mode and turn every scan into a recovery lead." },
  { icon: <Zap size={22} />, title: "One sticker, any asset", desc: "Vehicles, bags, pets, kids or keys — a single QR turns anyone into a first-responder." },
];

const steps = [
  { n: "01", t: "Register your vehicle", d: "Add plate details and generate a unique QR sticker in seconds." },
  { n: "02", t: "Stick it on", d: "Place the printable QR on your windshield or asset." },
  { n: "03", t: "Anyone scans", d: "A passerby opens the public page — no app needed." },
  { n: "04", t: "You get alerted", d: "The alert lands in your feed with type, note and location." },
];

export default function Landing() {
  return (
    <div data-testid="landing-page">
      {/* HERO */}
      <section className="container-nk" style={{ padding: "70px 22px 40px" }}>
        <div className="grid grid-2" style={{ alignItems: "center", gap: 40 }}>
          <div className="fade-up">
            <span className="chip" data-testid="landing-tagline">Har Musibat Mein, Ek Nek Saathi</span>
            <h1 style={{ fontSize: 52, lineHeight: 1.04, margin: "18px 0 16px" }}>
              One QR turns any stranger into a <span className="neon">first-responder</span>.
            </h1>
            <p className="muted" style={{ fontSize: 18, maxWidth: 520, lineHeight: 1.6 }}>
              Nek Saathi puts a smart safety QR on your vehicle and belongings. Emergency alerts,
              accident detection and family tracking — all while your phone number stays private.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
              <Link to="/register" className="btn btn-primary" data-testid="hero-get-started"><QrCode size={18} /> Create your QR</Link>
              <a href="#how" className="btn btn-ghost">How it works</a>
            </div>
            <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
              Try the admin demo: <b style={{ color: "#d9c9ff" }}>admin@safeqr.com</b> / <b style={{ color: "#d9c9ff" }}>admin1234</b>
            </p>
          </div>
          <div className="fade-up" style={{ animationDelay: ".15s" }}>
            <div className="glass card-pad" style={{ padding: 34 }}>
              <div className="scanner">
                <span className="corner tl" /><span className="corner tr" />
                <span className="corner bl" /><span className="corner br" />
                <span className="sweep" />
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <QrCode size={120} color="#22d3ee" strokeWidth={1.2} />
                </div>
              </div>
              <div className="center" style={{ marginTop: 20 }}>
                <div className="chip"><Car size={13} /> Scanning MH12 AB 1234</div>
                <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Emergency · Wrong parking · Theft · Fire · Towing</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="container-nk" style={{ padding: "50px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 8 }}>Built for real-world <span className="neon">emergencies</span></h2>
        <p className="muted" style={{ marginBottom: 28, fontSize: 16 }}>Everything a modern vehicle-safety network needs.</p>
        <div className="grid grid-3">
          {features.map((f, i) => (
            <div key={i} className="glass glass-hover card-pad fade-up" data-testid={`feature-${i}`} style={{ animationDelay: `${i * 0.05}s` }}>
              <div style={{ color: "#22d3ee", marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 19, marginBottom: 8 }}>{f.title}</h3>
              <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="container-nk" style={{ padding: "50px 22px" }}>
        <h2 style={{ fontSize: 34, marginBottom: 28 }}>How it <span className="neon">works</span></h2>
        <div className="grid grid-4">
          {steps.map((s, i) => (
            <div key={i} className="glass card-pad" data-testid={`step-${i}`}>
              <div className="neon head" style={{ fontSize: 30, fontWeight: 700 }}>{s.n}</div>
              <h3 style={{ fontSize: 18, margin: "8px 0" }}>{s.t}</h3>
              <p className="muted" style={{ fontSize: 14 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-nk" style={{ padding: "40px 22px 90px" }}>
        <div className="glass card-pad center" style={{ padding: 50 }}>
          <h2 style={{ fontSize: 36, marginBottom: 12 }}>Ready to make your vehicle <span className="neon">safer</span>?</h2>
          <p className="muted" style={{ fontSize: 17, marginBottom: 26 }}>Create your first QR sticker free. No app install required to scan.</p>
          <Link to="/register" className="btn btn-primary" data-testid="cta-register"><QrCode size={18} /> Get started now</Link>
        </div>
        <p className="center muted" style={{ marginTop: 40, fontSize: 13 }}>Made with ❤️ in India · Nek Saathi</p>
      </section>
    </div>
  );
}
