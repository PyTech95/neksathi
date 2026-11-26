import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/Modal";
import Copyright from "@/components/Copyright";
import { Siren, Users, ScanLine, QrCode, Lock, MapPin, Lock as LockIcon, LogIn, UserPlus, ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n";

// Shown to a guest who tapped "Explore the app". They can see everything Nek
// Sathi does, but each feature is gated — tapping one asks them to log in first.
const FEATURES = [
  { key: "sos", to: "/safety", icon: <Siren size={20} />, tkey: "auth.guest.f.sos", dkey: "auth.guest.f.sos.d", accent: "#ff3b5c" },
  { key: "family", to: "/family", icon: <Users size={20} />, tkey: "auth.guest.f.family", dkey: "auth.guest.f.family.d", accent: "#ff4d67" },
  { key: "scan", to: "/scanner", icon: <ScanLine size={20} />, tkey: "auth.guest.f.scan", dkey: "auth.guest.f.scan.d", accent: "#e92546" },
  { key: "tags", to: "/tags", icon: <QrCode size={20} />, tkey: "auth.guest.f.tags", dkey: "auth.guest.f.tags.d", accent: "#e92546" },
  { key: "theft", to: "/theft-protection", icon: <Lock size={20} />, tkey: "auth.guest.f.theft", dkey: "auth.guest.f.theft.d", accent: "#ff3b5c" },
  { key: "zones", to: "/safe-zones", icon: <MapPin size={20} />, tkey: "auth.guest.f.zones", dkey: "auth.guest.f.zones.d", accent: "#f5a524" },
];

export default function GuestHome() {
  const nav = useNavigate();
  const { exitGuest } = useAuth();
  const { t } = useT();
  const [gate, setGate] = useState(null); // the feature a guest tried to open

  const goLogin = (next) => { exitGuest(); nav(next ? `/login?next=${encodeURIComponent(next)}` : "/login"); };
  const goRegister = () => { exitGuest(); nav("/register"); };

  return (
    <div className="page" data-testid="guest-home">
      <div className="container-nk" style={{ maxWidth: 680 }}>
        <div className="center" style={{ padding: "8px 0 18px" }}>
          <img src="/website/logo-icon.png" alt="Nek Sathi" style={{ width: 64, height: 64, borderRadius: 16, margin: "0 auto 12px" }} />
          <h1 style={{ fontSize: 30, margin: "0 0 6px" }}>{t("auth.guest.welcome")} <span className="neon">Nek Sathi</span></h1>
          <p className="muted" style={{ fontSize: 14.5, margin: "0 auto", maxWidth: 440 }}>
            {t("auth.guest.sub")}
          </p>
        </div>

        <div className="glass" data-testid="guest-banner" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 14, marginBottom: 18, border: "1px solid rgba(245,165,36,.45)", background: "rgba(245,165,36,.1)" }}>
          <LockIcon size={18} style={{ color: "#f5a524", flexShrink: 0 }} />
          <div style={{ fontSize: 13.5, flex: 1 }}>{t("auth.guest.banner")}</div>
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          {FEATURES.map((f) => (
            <button
              key={f.key}
              type="button"
              className="glass glass-hover"
              data-testid={`guest-feature-${f.key}`}
              onClick={() => setGate(f)}
              style={{ textAlign: "left", cursor: "pointer", color: "inherit", border: "1px solid var(--panel-brd)", borderRadius: 16, padding: 16, display: "flex", gap: 13, alignItems: "flex-start" }}
            >
              <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", background: `${f.accent}22`, color: f.accent, border: `1px solid ${f.accent}55` }}>{f.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <b style={{ fontSize: 15 }}>{t(f.tkey)}</b>
                  <LockIcon size={13} className="muted" style={{ flexShrink: 0 }} />
                </span>
                <span className="muted" style={{ fontSize: 12.5, display: "block", marginTop: 3 }}>{t(f.dkey)}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="glass card-pad" style={{ padding: 22, marginTop: 20, textAlign: "center" }}>
          <h3 style={{ fontSize: 18, margin: "0 0 4px" }}>{t("auth.guest.ready")}</h3>
          <p className="muted" style={{ fontSize: 13.5, margin: "0 0 16px" }}>{t("auth.guest.readySub")}</p>
          <button className="btn btn-primary btn-block" data-testid="guest-register" onClick={goRegister} style={{ marginBottom: 10 }}>
            <UserPlus size={17} /> {t("auth.guest.createFree")}
          </button>
          <button className="btn btn-ghost btn-block" data-testid="guest-login" onClick={() => goLogin(null)}>
            <LogIn size={16} /> {t("auth.guest.haveAccount")}
          </button>
        </div>

        <Copyright />
      </div>

      <Modal open={!!gate} onClose={() => setGate(null)} title={gate ? t("auth.guest.gateTitle", { name: t(gate.tkey) }) : ""}>
        {gate && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: `${gate.accent}22`, color: gate.accent, border: `1px solid ${gate.accent}55` }}>{gate.icon}</span>
              <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>{t(gate.dkey)}{t("auth.guest.gateSuffix")}</p>
            </div>
            <button className="btn btn-primary btn-block" data-testid="gate-login" onClick={() => goLogin(gate.to)}>
              <LogIn size={16} /> {t("auth.guest.loginContinue")} <ArrowRight size={15} />
            </button>
            <button className="btn btn-ghost btn-block" data-testid="gate-register" onClick={goRegister}>
              <UserPlus size={15} /> {t("auth.guest.createAccount")}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
