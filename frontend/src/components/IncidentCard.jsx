import { ParkingCircle, Siren, ShieldAlert, Check, X, CheckCircle2, Clock, MapPin, Phone, Ban, Lightbulb, DoorOpen, AlertTriangle, MessageSquare, Key, Bike, Package, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";

// `label` is the English fallback; `lkey` is the translation key (rtype.*).
export const INCIDENT_META = {
  wrong_parking: { icon: <ParkingCircle size={18} />, color: "#f5a524", label: "Wrong parking", lkey: "rtype.wrong_parking" },
  vehicle_blocking: { icon: <Ban size={18} />, color: "#fb923c", label: "Vehicle blocking", lkey: "rtype.vehicle_blocking" },
  headlight_on: { icon: <Lightbulb size={18} />, color: "#eab308", label: "Headlight ON", lkey: "rtype.headlight_on" },
  door_open: { icon: <DoorOpen size={18} />, color: "#e92546", label: "Door / window open", lkey: "rtype.door_open" },
  keys_left: { icon: <Key size={18} />, color: "#f59e0b", label: "Keys left", lkey: "rtype.keys_left" },
  bike_fallen: { icon: <Bike size={18} />, color: "#f97316", label: "Bike fallen", lkey: "rtype.bike_fallen" },
  load_problem: { icon: <Package size={18} />, color: "#f59e0b", label: "Load / cargo", lkey: "rtype.load_problem" },
  emergency: { icon: <Siren size={18} />, color: "#ff3b5c", label: "Emergency", lkey: "rtype.emergency" },
  vehicle_damage: { icon: <AlertTriangle size={18} />, color: "#f97316", label: "Vehicle damage", lkey: "rtype.vehicle_damage" },
  other: { icon: <MessageSquare size={18} />, color: "#ff4d67", label: "Other", lkey: "rtype.other" },
  accident: { icon: <Siren size={18} />, color: "#ff3b5c", label: "Accident", lkey: "rtype.accident" },
  theft: { icon: <ShieldAlert size={18} />, color: "#ff4d67", label: "Theft / suspicious", lkey: "rtype.theft" },
};

// Translate a reason type / incident status, falling back to the raw value.
export const metaLabel = (t, m) => (m && m.lkey ? t(m.lkey) : (m && m.label) || "");
const statusText = (t, s) => { const v = t("istatus." + s); return v === "istatus." + s ? s : v; };

// A QR-scan incident as a collapsible card: a compact header (tap to expand) and,
// when open, the captured photos, location and the owner's response buttons.
// Used by both the Incidents page and the Alert feed so they stay identical.
export default function IncidentCard({ incident: it, isOpen, onToggle, onRespond, onResolve, onExtend }) {
  const { t } = useT();
  const m = INCIDENT_META[it.type] || INCIDENT_META.wrong_parking;
  const pending = !it.resolved && (it.status === "alert_sent" || it.status === "no_response");
  const hasTimer = (it.type === "wrong_parking" || it.type === "vehicle_blocking") && !it.resolved;
  return (
    <div className="glass" style={{ borderRadius: 16, overflow: "hidden", borderColor: isOpen ? "rgba(233,37,70,.45)" : undefined }} data-testid={`incident-${it.id}`}>
      {/* Collapsed header — tap to expand / collapse */}
      <button type="button" onClick={onToggle} data-testid={`incident-head-${it.id}`}
        style={{ width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "13px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
        <span className="alert-ico" style={{ background: `${m.color}22`, color: m.color, flexShrink: 0 }}>{m.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metaLabel(t, m)} · {it.number_plate}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, flexWrap: "wrap" }}>
            <span className="pill" style={{ background: it.resolved ? "rgba(233,37,70,.14)" : `${m.color}22`, color: it.resolved ? "var(--accent)" : m.color }}>{statusText(t, it.status)}</span>
            {hasTimer && <span className="pill" style={{ background: "rgba(255,59,92,.14)", color: "var(--danger)" }}><Clock size={11} /> {t("inc.minLeft", { n: it.minutes_left })}</span>}
          </div>
        </div>
        {it.evidence_photo_base64 && !isOpen && <img src={it.evidence_photo_base64} alt="" style={{ width: 38, height: 38, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />}
        <ChevronDown size={18} className="muted" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s ease", flexShrink: 0 }} />
      </button>

      {/* Expanded body — photos, location, respond buttons */}
      {isOpen && (
        <div style={{ padding: "2px 14px 16px", borderTop: "1px solid var(--panel-brd)" }}>
          {it.scanner_note && <p className="muted" style={{ fontSize: 14, margin: "12px 0 0" }}>{it.scanner_note}</p>}
          {(it.evidence_photo_base64 || it.reporter_photo_base64) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }} data-testid={`incident-photos-${it.id}`}>
              {it.evidence_photo_base64 && (
                <a href={it.evidence_photo_base64} target="_blank" rel="noreferrer" data-testid={`incident-evidence-${it.id}`}>
                  <img src={it.evidence_photo_base64} alt="Vehicle" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(233,37,70,.4)" }} />
                  <span className="muted" style={{ display: "block", fontSize: 11.5, marginTop: 4, textAlign: "center" }}>{t("inc.vehiclePhoto")}</span>
                </a>
              )}
              {it.reporter_photo_base64 && (
                <a href={it.reporter_photo_base64} target="_blank" rel="noreferrer" data-testid={`incident-reporter-${it.id}`}>
                  <img src={it.reporter_photo_base64} alt="Reporter" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(245,165,36,.5)" }} />
                  <span className="muted" style={{ display: "block", fontSize: 11.5, marginTop: 4, textAlign: "center" }}>{t("inc.reporterPhoto")}</span>
                </a>
              )}
            </div>
          )}
          {it.scanner_lat != null ? (
            <a href={`https://maps.google.com/?q=${it.scanner_lat},${it.scanner_lng}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 12 }} data-testid={`incident-map-${it.id}`}><MapPin size={15} /> {t("inc.viewLocation")}</a>
          ) : (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> {t("inc.noLocation")}</div>
          )}
          {it.scanner_phone && <a href={`tel:${it.scanner_phone}`} className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 10, color: "#ff5a74" }} data-testid={`incident-call-${it.id}`}><Phone size={14} /> {t("inc.callReporter")} · {it.scanner_phone}</a>}

          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {pending && (
              <>
                <button className="btn btn-primary btn-block btn-sm" onClick={() => onRespond(it.id, "coming")} data-testid={`coming-${it.id}`}><Check size={15} /> {t("inc.coming")}</button>
                <button className="btn btn-ghost btn-block btn-sm" onClick={() => onRespond(it.id, "cant")} data-testid={`cant-${it.id}`}><X size={15} /> {t("inc.cant")}</button>
              </>
            )}
            {hasTimer && (
              <button className="btn btn-ghost btn-block btn-sm" onClick={() => onExtend(it.id)} data-testid={`extend-${it.id}`}><Clock size={15} color="#f5a524" /> {t("inc.needTime")}</button>
            )}
            {!it.resolved && <button className="btn btn-ghost btn-block btn-sm" onClick={() => onResolve(it.id)} data-testid={`resolve-${it.id}`}><CheckCircle2 size={15} color="#34d399" /> {t("inc.resolve")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
