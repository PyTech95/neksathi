import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { RefreshCw, BellRing, ChevronDown } from "lucide-react";
import IncidentCard, { INCIDENT_META as META, metaLabel } from "@/components/IncidentCard";
import { useT } from "@/lib/i18n";

const FIRST = 8;   // show this many, then "View more" reveals a few more
const MORE = 4;

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
          <div><span className="chip"><BellRing size={13} /> {t("inc.chip")}</span><h1 style={{ fontSize: 34, marginTop: 12 }}>{t("inc.title1")} <span className="neon">{t("inc.title2")}</span></h1></div>
          <button className="btn btn-ghost btn-sm" onClick={load} data-testid="refresh-incidents"><RefreshCw size={15} /> {t("common.refresh")}</button>
        </div>

        {loading ? <div className="spinner" /> : items.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-incidents">
            <BellRing size={40} color="#b3122f" /><h3 style={{ fontSize: 22, margin: "12px 0 6px" }}>{t("inc.empty")}</h3>
            <p className="muted">{t("inc.empty.sub")}</p>
          </div>
        ) : (
          <>
            <div className="glass card-pad" style={{ padding: 16, marginBottom: 16 }} data-testid="reason-breakdown">
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}><BellRing size={15} color="#b3122f" /> {t("inc.breakdown")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(items.reduce((a, it) => { a[it.type] = (a[it.type] || 0) + 1; return a; }, {})).sort((x, y) => y[1] - x[1]).map(([type, c]) => {
                  const m = META[type] || META.wrong_parking;
                  return (
                    <span key={type} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${m.color}1f`, borderColor: `${m.color}66`, color: "var(--text)" }} data-testid={`reason-stat-${type}`}>
                      <span style={{ color: m.color, display: "inline-flex" }}>{m.icon}</span> {metaLabel(t, m)} · <b style={{ color: m.color }}>{c}</b>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="grid" style={{ gap: 12 }}>
            {items.slice(0, visible).map((it) => (
              <IncidentCard key={it.id} incident={it} isOpen={open.has(it.id)} onToggle={() => toggle(it.id)}
                onRespond={respond} onResolve={resolve} onExtend={extend} />
            ))}
            {items.length > visible && (
              <button type="button" onClick={() => setVisible((v) => v + MORE)} data-testid="incidents-view-more"
                style={{ padding: 12, background: "rgba(233,37,70,.06)", border: "1px solid var(--panel-brd)", borderRadius: 12, color: "var(--accent)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                {t("inc.viewMoreLeft", { n: items.length - visible })} <ChevronDown size={15} />
              </button>
            )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
