import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { ParkingCircle, Siren, ShieldAlert, Check, X, CheckCircle2, Clock, MapPin, Phone, RefreshCw, BellRing, Ban, Lightbulb, DoorOpen, AlertTriangle, MessageSquare, Key, Bike, Package, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";

const FIRST = 8;   // show this many, then "View more" reveals a few more
const MORE = 4;

const META = {
  wrong_parking: { icon: <ParkingCircle size={18} />, color: "#f5a524", label: "Wrong parking" },
  vehicle_blocking: { icon: <Ban size={18} />, color: "#fb923c", label: "Vehicle blocking" },
  headlight_on: { icon: <Lightbulb size={18} />, color: "#eab308", label: "Headlight ON" },
  door_open: { icon: <DoorOpen size={18} />, color: "#e92546", label: "Door / window open" },
  keys_left: { icon: <Key size={18} />, color: "#f59e0b", label: "Keys left" },
  bike_fallen: { icon: <Bike size={18} />, color: "#f97316", label: "Bike fallen" },
  load_problem: { icon: <Package size={18} />, color: "#f59e0b", label: "Load / cargo" },
  emergency: { icon: <Siren size={18} />, color: "#ff3b5c", label: "Emergency" },
  vehicle_damage: { icon: <AlertTriangle size={18} />, color: "#f97316", label: "Vehicle damage" },
  other: { icon: <MessageSquare size={18} />, color: "#ff4d67", label: "Other" },
  accident: { icon: <Siren size={18} />, color: "#ff3b5c", label: "Accident" },
  theft: { icon: <ShieldAlert size={18} />, color: "#ff4d67", label: "Theft / suspicious" },
};
const statusLabel = (s) => ({ alert_sent: "Alert sent", coming: "You're coming", no_response: "No response", call_attempted: "Call attempted", resolved: "Resolved" }[s] || s);

export default function Incidents() {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(() => new Set()); // which incidents are expanded
  const [visible, setVisible] = useState(FIRST);      // how many rows are rendered
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const itemsRef = useRef([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api.get("/incidents")).data.results); } finally { setLoading(false); }
  }, []);

  // Live-sync across family members: poll the lightweight status feed and merge
  // the changed fields in place (no photo re-download). If a brand-new incident
  // appears, pull the full list once to get its photos/details.
  const syncStatuses = useCallback(async () => {
    let live;
    try { live = (await api.get("/incidents/status")).data.results || []; }
    catch (_) { return; }
    const prevIds = new Set(itemsRef.current.map((x) => x.id));
    if (live.some((x) => !prevIds.has(x.id))) { load(); return; }
    const map = Object.fromEntries(live.map((x) => [x.id, x]));
    setItems((cur) => cur.map((it) => (map[it.id] ? { ...it, ...map[it.id] } : it)));
  }, [load]);

  useEffect(() => {
    load();
    const t = setInterval(syncStatuses, 8000);
    const onVis = () => { if (document.visibilityState === "visible") syncStatuses(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load, syncStatuses]);

  const respond = async (id, response) => { await api.post(`/incidents/${id}/respond`, { response }); syncStatuses(); };
  const resolve = async (id) => { await api.post(`/incidents/${id}/resolve`); syncStatuses(); };
  const extend = async (id) => { await api.post(`/incidents/${id}/extend`); syncStatuses(); };

  return (
    <div className="page" data-testid="incidents-page">
      <div className="container-nk" style={{ maxWidth: 760 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div><span className="chip"><BellRing size={13} /> Incidents</span><h1 style={{ fontSize: 34, marginTop: 12 }}>QR scan <span className="neon">incidents</span></h1></div>
          <button className="btn btn-ghost btn-sm" onClick={load} data-testid="refresh-incidents"><RefreshCw size={15} /> Refresh</button>
        </div>

        {loading ? <div className="spinner" /> : items.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-incidents">
            <BellRing size={40} color="#b3122f" /><h3 style={{ fontSize: 22, margin: "12px 0 6px" }}>No incidents yet</h3>
            <p className="muted">When someone scans your QR and reports an issue, respond here.</p>
          </div>
        ) : (
          <>
            <div className="glass card-pad" style={{ padding: 16, marginBottom: 16 }} data-testid="reason-breakdown">
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}><BellRing size={15} color="#b3122f" /> Alert reasons breakdown</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(items.reduce((a, it) => { a[it.type] = (a[it.type] || 0) + 1; return a; }, {})).sort((x, y) => y[1] - x[1]).map(([t, c]) => {
                  const m = META[t] || META.wrong_parking;
                  return (
                    <span key={t} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${m.color}1f`, borderColor: `${m.color}66`, color: "var(--text)" }} data-testid={`reason-stat-${t}`}>
                      <span style={{ color: m.color, display: "inline-flex" }}>{m.icon}</span> {m.label} · <b style={{ color: m.color }}>{c}</b>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="grid" style={{ gap: 12 }}>
            {items.slice(0, visible).map((it) => {
              const m = META[it.type] || META.wrong_parking;
              const pending = !it.resolved && (it.status === "alert_sent" || it.status === "no_response");
              const hasTimer = (it.type === "wrong_parking" || it.type === "vehicle_blocking") && !it.resolved;
              const isOpen = open.has(it.id);
              return (
                <div key={it.id} className="glass" style={{ borderRadius: 16, overflow: "hidden", borderColor: isOpen ? "rgba(233,37,70,.45)" : undefined }} data-testid={`incident-${it.id}`}>
                  {/* Collapsed header — tap to expand / collapse */}
                  <button type="button" onClick={() => toggle(it.id)} data-testid={`incident-head-${it.id}`}
                    style={{ width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "13px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                    <span className="alert-ico" style={{ background: `${m.color}22`, color: m.color, flexShrink: 0 }}>{m.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.label} · {it.number_plate}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, flexWrap: "wrap" }}>
                        <span className="pill" style={{ background: it.resolved ? "rgba(233,37,70,.14)" : `${m.color}22`, color: it.resolved ? "var(--accent)" : m.color }}>{statusLabel(it.status)}</span>
                        {hasTimer && <span className="pill" style={{ background: "rgba(255,59,92,.14)", color: "var(--danger)" }}><Clock size={11} /> {it.minutes_left} min left</span>}
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
                              <span className="muted" style={{ display: "block", fontSize: 11.5, marginTop: 4, textAlign: "center" }}>Vehicle</span>
                            </a>
                          )}
                          {it.reporter_photo_base64 && (
                            <a href={it.reporter_photo_base64} target="_blank" rel="noreferrer" data-testid={`incident-reporter-${it.id}`}>
                              <img src={it.reporter_photo_base64} alt="Reporter" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(245,165,36,.5)" }} />
                              <span className="muted" style={{ display: "block", fontSize: 11.5, marginTop: 4, textAlign: "center" }}>Reporter</span>
                            </a>
                          )}
                        </div>
                      )}
                      {it.scanner_lat != null ? (
                        <a href={`https://maps.google.com/?q=${it.scanner_lat},${it.scanner_lng}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 12 }} data-testid={`incident-map-${it.id}`}><MapPin size={15} /> View location on map</a>
                      ) : (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> Location was not captured for this scan.</div>
                      )}
                      {it.scanner_phone && <a href={`tel:${it.scanner_phone}`} className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 10, color: "#ff5a74" }} data-testid={`incident-call-${it.id}`}><Phone size={14} /> Call reporter · {it.scanner_phone}</a>}

                      <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                        {pending && (
                          <>
                            <button className="btn btn-primary btn-block btn-sm" onClick={() => respond(it.id, "coming")} data-testid={`coming-${it.id}`}><Check size={15} /> I'm coming</button>
                            <button className="btn btn-ghost btn-block btn-sm" onClick={() => respond(it.id, "cant")} data-testid={`cant-${it.id}`}><X size={15} /> Can't respond</button>
                          </>
                        )}
                        {hasTimer && (
                          <button className="btn btn-ghost btn-block btn-sm" onClick={() => extend(it.id)} data-testid={`extend-${it.id}`}><Clock size={15} color="#f5a524" /> Need more time (+10 min)</button>
                        )}
                        {!it.resolved && <button className="btn btn-ghost btn-block btn-sm" onClick={() => resolve(it.id)} data-testid={`resolve-${it.id}`}><CheckCircle2 size={15} color="#34d399" /> Mark resolved</button>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {items.length > visible && (
              <button type="button" onClick={() => setVisible((v) => v + MORE)} data-testid="incidents-view-more"
                style={{ padding: 12, background: "rgba(233,37,70,.06)", border: "1px solid var(--panel-brd)", borderRadius: 12, color: "var(--accent)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                View more ({items.length - visible} left) <ChevronDown size={15} />
              </button>
            )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
