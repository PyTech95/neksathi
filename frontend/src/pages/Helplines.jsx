import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Siren, Ambulance, Flame, HeartHandshake, Baby, Hospital, Building2, Phone, ShieldAlert } from "lucide-react";
import { useT } from "@/lib/i18n";

// National emergency helplines, one tap to dial. Numbers come from
// GET /public/emergency-numbers (admin-configurable; India defaults). Android
// won't let an app auto-dial an emergency number, so tel: opens the dialer with
// the number filled in and the user taps call.
const DEFAULTS = { police: "112", ambulance: "108", fire: "101", women: "1091", child: "1098" };

const LINES = [
  { key: "police", tkey: "hl.police", dkey: "hl.police.sub", icon: Siren, color: "#2563eb" },
  { key: "ambulance", tkey: "hl.ambulance", dkey: "hl.ambulance.sub", icon: Ambulance, color: "#dc2626" },
  { key: "fire", tkey: "hl.fire", dkey: "hl.fire.sub", icon: Flame, color: "#ea580c" },
  { key: "women", tkey: "hl.women", dkey: "hl.women.sub", icon: HeartHandshake, color: "#db2777" },
  { key: "child", tkey: "hl.child", dkey: "hl.child.sub", icon: Baby, color: "#0891b2" },
];

export default function Helplines() {
  const { t } = useT();
  const [n, setN] = useState(DEFAULTS);

  useEffect(() => {
    let m = true;
    api.get("/public/emergency-numbers")
      .then((r) => { if (m) setN({ ...DEFAULTS, ...(r.data || {}) }); })
      .catch(() => {});
    return () => { m = false; };
  }, []);

  return (
    <div className="page" data-testid="helplines-page">
      <div className="container-nk" style={{ maxWidth: 640 }}>
        <span className="chip"><ShieldAlert size={13} /> {t("hl.chip")}</span>
        <h1 style={{ fontSize: 32, marginTop: 12, marginBottom: 4 }}>{t("hl.title1")} <span className="neon">{t("hl.title2")}</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>{t("hl.sub")}</p>

        <div style={{ display: "grid", gap: 10 }}>
          {LINES.map(({ key, tkey, dkey, icon: Icon, color }) => (
            <a
              key={key}
              href={`tel:${n[key]}`}
              data-testid={`helpline-${key}`}
              className="glass glass-hover"
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16, textDecoration: "none", color: "var(--text)", border: "1px solid var(--panel-brd)" }}
            >
              <span style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", background: `${color}1f`, color, border: `1px solid ${color}55` }}>
                <Icon size={22} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 16, display: "block" }}>{t(tkey)}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{t(dkey)}</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                <b style={{ fontSize: 17, color }}>{n[key]}</b>
                <span style={{ width: 38, height: 38, borderRadius: "50%", display: "grid", placeItems: "center", background: color, color: "#fff" }}><Phone size={17} /></span>
              </span>
            </a>
          ))}
        </div>

        <h2 style={{ fontSize: 19, margin: "26px 0 10px" }}>{t("hl.findNearby")}</h2>
        <div className="grid grid-2" style={{ gap: 10 }}>
          <a href="https://www.google.com/maps/search/hospital+near+me" target="_blank" rel="noreferrer" data-testid="find-hospital"
            className="glass glass-hover" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, textDecoration: "none", color: "var(--text)", border: "1px solid var(--panel-brd)" }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(220,38,38,.14)", color: "#dc2626", border: "1px solid rgba(220,38,38,.4)" }}><Hospital size={20} /></span>
            <span><b style={{ fontSize: 15 }}>{t("hl.hospital")}</b><div className="muted" style={{ fontSize: 12.5 }}>{t("hl.openMaps")}</div></span>
          </a>
          <a href="https://www.google.com/maps/search/police+station+near+me" target="_blank" rel="noreferrer" data-testid="find-police"
            className="glass glass-hover" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, textDecoration: "none", color: "var(--text)", border: "1px solid var(--panel-brd)" }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(37,99,235,.14)", color: "#2563eb", border: "1px solid rgba(37,99,235,.4)" }}><Building2 size={20} /></span>
            <span><b style={{ fontSize: 15 }}>{t("hl.policeStation")}</b><div className="muted" style={{ fontSize: 12.5 }}>{t("hl.openMaps")}</div></span>
          </a>
        </div>

        <div className="glass" style={{ marginTop: 20, padding: "12px 16px", borderRadius: 14, fontSize: 12.5, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <ShieldAlert size={16} style={{ color: "#f5a524", flexShrink: 0, marginTop: 1 }} />
          <span className="muted">{t("hl.note1")} <b style={{ color: "var(--text)" }}>112</b> {t("hl.note2")}</span>
        </div>
      </div>
    </div>
  );
}
