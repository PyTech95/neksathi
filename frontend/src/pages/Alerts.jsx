import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Siren, ParkingCircle, Lock, Flame, Truck, Gauge, Video, Bell, MapPin, Phone, RefreshCw, Ban, Check, ChevronDown, Loader2, Lightbulb, PhoneMissed, MessageSquare } from "lucide-react";
import IncidentCard from "@/components/IncidentCard";
import { useT } from "@/lib/i18n";
import { cacheGet, cacheSet } from "@/lib/cache";

// Load a first page, then a few more on "View more" — a user with thousands of
// alerts never loads them all at once.
const PAGE = 8;
const MORE = 4;

const META = {
  emergency: { icon: <Siren size={17} />, color: "#ff3b5c", label: "Emergency", lkey: "rtype.emergency" },
  sos: { icon: <Siren size={17} />, color: "#ff3b5c", label: "SOS", lkey: "rtype.sos" },
  sos_video: { icon: <Video size={17} />, color: "#ff3b5c", label: "SOS video", lkey: "rtype.sos_video" },
  accident: { icon: <Siren size={17} />, color: "#ff3b5c", label: "Accident", lkey: "rtype.accident" },
  wrong_parking: { icon: <ParkingCircle size={17} />, color: "#f5a524", label: "Wrong parking", lkey: "rtype.wrong_parking" },
  vehicle_blocking: { icon: <Ban size={17} />, color: "#fb923c", label: "Vehicle blocking", lkey: "rtype.vehicle_blocking" },
  headlight_on: { icon: <Lightbulb size={17} />, color: "#eab308", label: "Headlight ON", lkey: "rtype.headlight_on" },
  theft: { icon: <Lock size={17} />, color: "#ff4d67", label: "Theft / suspicious", lkey: "rtype.theft" },
  fire: { icon: <Flame size={17} />, color: "#f97316", label: "Fire", lkey: "rtype.fire" },
  towing: { icon: <Truck size={17} />, color: "#e92546", label: "Towing", lkey: "rtype.towing" },
  speed_alert: { icon: <Gauge size={17} />, color: "#f5a524", label: "Overspeed", lkey: "rtype.speed_alert" },
  missed_call: { icon: <PhoneMissed size={17} />, color: "#ff4d67", label: "Missed call", lkey: "rtype.missed_call" },
  card_message: { icon: <MessageSquare size={17} />, color: "#ff8fa3", label: "Card message", lkey: "rtype.card_message" },
  found: { icon: <MapPin size={17} />, color: "#34d399", label: "Tag found", lkey: "rtype.found" },
};
// Pretty fallback so an unknown raw type never shows as "some_type".
const pretty = (t) => (t || "alert").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmt = (d) => {
  const dt = new Date(d);
  return dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function Alerts() {
  const { t } = useT();
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [blocked, setBlocked] = useState({}); // phone -> true once blocked this session
  // Actionable incidents (wrong parking etc.), keyed by id — an alert carrying an
  // incident_id is shown as a collapsible IncidentCard so people can respond here.
  const [incMap, setIncMap] = useState({});
  const [openInc, setOpenInc] = useState(() => new Set());
  const toggleInc = (id) => setOpenInc((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const loadIncidents = async () => {
    try {
      const r = await api.get("/incidents");
      const map = {};
      (r.data?.results || []).forEach((i) => { map[i.id] = i; });
      setIncMap(map);
    } catch { /* feed still works without respond */ }
  };
  const respond = async (id, response) => { await api.post(`/incidents/${id}/respond`, { response }); loadIncidents(); };
  const resolve = async (id) => { await api.post(`/incidents/${id}/resolve`); loadIncidents(); };
  const extend = async (id) => { await api.post(`/incidents/${id}/extend`); loadIncidents(); };

  const load = async () => {
    // Show the last view instantly (if any); otherwise show the spinner.
    const cached = cacheGet("alerts:v1");
    if (cached) { setAlerts(cached.alerts); setTotal(cached.total); setIncMap(cached.incMap); setLoading(false); }
    else setLoading(true);
    try {
      // Fetch alerts + count + incidents together, so an alert that carries an
      // incident renders as its full IncidentCard immediately (no late "pop-in").
      const [r, c, inc] = await Promise.all([
        api.get("/alerts", { params: { skip: 0, limit: PAGE } }),
        api.get("/alerts/count").catch(() => ({ data: {} })),
        api.get("/incidents").catch(() => ({ data: { results: [] } })),
      ]);
      const page = Array.isArray(r.data) ? r.data : [];
      const total = c.data?.total ?? page.length;
      const map = {};
      (inc.data?.results || []).forEach((i) => { map[i.id] = i; });
      setAlerts(page);
      setTotal(total);
      setIncMap(map);
      cacheSet("alerts:v1", { alerts: page, total, incMap: map });
    } finally {
      setLoading(false);
    }
  };
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await api.get("/alerts", { params: { skip: alerts.length, limit: MORE } });
      const page = Array.isArray(r.data) ? r.data : [];
      setAlerts((prev) => [...prev, ...page]);
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => { load(); }, []);
  const hasMore = alerts.length < total;

  const blockNumber = async (phone) => {
    if (!phone || blocked[phone]) return;
    try {
      await api.post("/me/blocked-numbers", { phone });
      setBlocked((b) => ({ ...b, [phone]: true }));
    } catch (_) {}
  };

  return (
    <div className="page" data-testid="alerts-page">
      <div className="container-nk" style={{ maxWidth: 680 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <span className="chip">{t("alerts.chip")}</span>
            <h1 style={{ fontSize: 30, marginTop: 10 }}>{t("alerts.title1")} <span className="neon">{t("alerts.title2")}</span></h1>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load} data-testid="refresh-alerts"><RefreshCw size={15} /> {t("common.refresh")}</button>
        </div>

        {loading ? (
          <div className="spinner" />
        ) : alerts.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-alerts">
            <Bell size={40} color="#e92546" />
            <h3 style={{ fontSize: 22, margin: "12px 0 6px" }}>{t("alerts.empty")}</h3>
            <p className="muted">{t("alerts.empty.sub")}</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {alerts.map((a) => {
              // Actionable incident → show the collapsible respond card right here.
              const inc = a.incident_id ? incMap[a.incident_id] : null;
              if (inc) {
                return <IncidentCard key={a.id} incident={inc} isOpen={openInc.has(inc.id)} onToggle={() => toggleInc(inc.id)}
                  onRespond={respond} onResolve={resolve} onExtend={extend} />;
              }
              const m = META[a.type] || { icon: <Bell size={17} />, color: "#ff4d67", label: pretty(a.type) };
              const label = m.lkey ? t(m.lkey) : m.label;
              return (
                <div key={a.id} className="glass" data-testid={`alert-row-${a.id}`} style={{ borderRadius: 14, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", background: `${m.color}1f`, color: m.color }}>{m.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}{a.number_plate ? ` · ${a.number_plate}` : ""}</span>
                      <span className="muted" style={{ fontSize: 11.5, flexShrink: 0, textAlign: "right" }}>{fmt(a.created_at)}</span>
                    </div>
                    {a.scanner_note && <p className="muted" style={{ fontSize: 12.5, margin: "3px 0 0" }}>{a.scanner_note}</p>}
                    {(a.scanner_phone || (a.scanner_lat != null && a.scanner_lng != null)) && (
                      <div style={{ display: "flex", gap: 14, marginTop: 7, flexWrap: "wrap", alignItems: "center" }}>
                        {a.scanner_phone && (
                          <a href={`tel:${a.scanner_phone}`} style={{ fontSize: 12.5, fontWeight: 700, color: "#ff5a74", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Phone size={13} /> {a.scanner_phone}
                          </a>
                        )}
                        {a.scanner_phone && (
                          blocked[a.scanner_phone] ? (
                            <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }} data-testid={`blocked-done-${a.id}`}><Check size={13} /> {t("alerts.blocked")}</span>
                          ) : (
                            <button onClick={() => blockNumber(a.scanner_phone)} data-testid={`block-${a.id}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4, padding: 0 }}>
                              <Ban size={13} /> {t("alerts.block")}
                            </button>
                          )
                        )}
                        {a.scanner_lat != null && a.scanner_lng != null && (
                          <a href={`https://www.openstreetmap.org/?mlat=${a.scanner_lat}&mlon=${a.scanner_lng}#map=17/${a.scanner_lat}/${a.scanner_lng}`} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <MapPin size={13} /> {t("common.viewOnMap")}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <button type="button" onClick={loadMore} disabled={loadingMore} data-testid="alerts-view-more"
                style={{ padding: "12px 14px", background: "rgba(233,37,70,.06)", border: "1px solid var(--panel-brd)", borderRadius: 12, color: "var(--accent)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                {loadingMore ? <><Loader2 size={15} className="spin" /> {t("common.loading")}</> : <>{t("alerts.viewMoreLeft", { n: total - alerts.length })} <ChevronDown size={15} /></>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
