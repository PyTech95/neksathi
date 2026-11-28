import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { cacheGet, cacheSet } from "@/lib/cache";
import { loadLeaflet } from "@/lib/leaflet";
import { getPosition, locationHint, openLocationSettings } from "@/lib/native";
import SosActions from "@/components/SosActions";
import SosPhoto from "@/components/SosPhoto";
import BackgroundLocationCard from "@/components/BackgroundLocationCard";
import { Users, ShieldCheck, Copy, CheckCircle2, LogOut, UserMinus, MapPin, BatteryMedium, Activity, Loader2, Crown, Eye, EyeOff, LocateFixed, Clock, Smartphone, LogIn, Bell, Moon, Send, BarChart3, AlertTriangle, HeartHandshake, BatteryLow, ShieldAlert, Timer, BellRing, ChevronDown, UserPlus, Camera, Lock, Gauge, X } from "lucide-react";
import { useT } from "@/lib/i18n";

function fmtSecs(s) { if (!s) return "0m"; const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }

function MemberActivity({ memberId }) {
  const { t } = useT();
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/family/members/${memberId}/activity`).then((r) => setD(r.data)).catch(() => setD({ shared: false, items: [] })); }, [memberId]);
  if (!d) return <div style={{ padding: 12 }}><Loader2 className="spin" size={16} /></div>;
  if (!d.shared) return <p className="muted" style={{ fontSize: 13, padding: "8px 0" }} data-testid="activity-not-shared">{t("fam.act.notShared")}</p>;
  const totals = Object.entries(d.today_totals || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div data-testid="member-activity" style={{ marginTop: 10 }}>
      {totals.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t("fam.act.screenTime")}</div>
          {totals.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
              <span>{k}</span><span style={{ fontWeight: 700 }}>{fmtSecs(v)}</span>
            </div>
          ))}
        </div>
      )}
      {d.items.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>{t("fam.act.none")}</p> : (
        <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {d.items.slice(0, 20).map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span>{a.type === "app_usage" ? `📱 ${a.app_name || t("fam.act.app")}` : a.type === "screen_time" ? `⏱ ${t("fam.act.screenTimeLabel")}` : a.type === "checkin" ? `📍 ${a.note || t("fam.act.checkin")}` : a.type === "battery" ? `🔋 ${a.battery}%` : a.type}{a.seconds ? ` · ${fmtSecs(a.seconds)}` : ""}</span>
              <span className="muted">{new Date(a.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A member's location trail for a chosen day — "9:00 here, 9:30 there" — drawn
// as a route on the map plus a time-ordered list. Reads /family/member/:id/history.
// Points load a page at a time (4 per "Next") so a long day never loads at once.
const TIMELINE_PAGE = 4;
function MemberTimeline({ memberId, name, onClose }) {
  const { t } = useT();
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [points, setPoints] = useState([]);   // accumulated, oldest → newest
  const [total, setTotal] = useState(0);
  const [shared, setShared] = useState(true);
  const [loading, setLoading] = useState(true);     // first page of a day
  const [loadingMore, setLoadingMore] = useState(false); // a "Next" page
  const mapEl = useRef(null); const mapObj = useRef(null); const layer = useRef(null);

  const isToday = new Date().toDateString() === day.toDateString();
  const shiftDay = (n) => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0, 0, 0, 0); return x; });

  const dayRange = () => {
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setHours(23, 59, 59, 999);
    return { since: start.toISOString(), until: end.toISOString() };
  };

  const fetchPage = (skip, append) => {
    const setBusy = append ? setLoadingMore : setLoading;
    setBusy(true);
    return api.get(`/family/member/${memberId}/history`, { params: { ...dayRange(), skip, limit: TIMELINE_PAGE } })
      .then((r) => {
        const d = r.data || {};
        setShared(d.shared !== false);
        setTotal(d.total ?? (d.points || []).length);
        setPoints((prev) => (append ? [...prev, ...(d.points || [])] : (d.points || [])));
      })
      .catch(() => { if (!append) { setShared(true); setPoints([]); setTotal(0); } })
      .finally(() => setBusy(false));
  };

  // Fresh first page whenever the member or the day changes.
  useEffect(() => { setPoints([]); setTotal(0); fetchPage(0, false); /* eslint-disable-next-line */ }, [memberId, day]);

  // Map shows every point loaded so far (route builds up as you tap Next).
  useEffect(() => {
    if (!mapEl.current) return;
    const pts = points.filter((p) => p.lat != null && p.lng != null);
    loadLeaflet().then((L) => {
      if (!mapObj.current) {
        mapObj.current = L.map(mapEl.current, { zoomControl: true }).setView(pts[0] ? [pts[0].lat, pts[0].lng] : [20.59, 78.96], pts[0] ? 13 : 4);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapObj.current);
        layer.current = L.layerGroup().addTo(mapObj.current);
      }
      layer.current.clearLayers();
      if (pts.length) {
        const ll = pts.map((p) => [p.lat, p.lng]);
        L.polyline(ll, { color: "#e92546", weight: 4, opacity: 0.85 }).addTo(layer.current);
        L.circleMarker(ll[0], { radius: 7, color: "#10b981", fillColor: "#10b981", fillOpacity: 1 }).addTo(layer.current).bindPopup(t("fam.tl.earliest"));
        L.circleMarker(ll[ll.length - 1], { radius: 7, color: "#e92546", fillColor: "#e92546", fillOpacity: 1 }).addTo(layer.current).bindPopup(t("fam.tl.latest"));
        try { mapObj.current.fitBounds(ll, { padding: [28, 28] }); } catch (_) {}
      }
    }).catch(() => {});
  }, [points]);

  useEffect(() => () => { if (mapObj.current) { try { mapObj.current.remove(); } catch (_) {} mapObj.current = null; } }, []);

  const pts = points.filter((p) => p.lat != null);
  const hasMore = points.length < total;
  const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dayLabel = isToday ? t("fam.tl.today") : day.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "var(--bg)", display: "flex", flexDirection: "column" }} data-testid="member-timeline">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(14px, env(safe-area-inset-top, 0px)) 16px 14px", borderBottom: "1px solid var(--panel-brd)", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 17, display: "inline-flex", alignItems: "center", gap: 8 }}><Activity size={18} className="neon" /> {t("fam.tl.title", { name })}</div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftDay(-1)} data-testid="timeline-prev">{t("fam.tl.prev")}</button>
          <span style={{ fontWeight: 700 }}>{dayLabel}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => shiftDay(1)} disabled={isToday} data-testid="timeline-next">{t("fam.tl.next")}</button>
        </div>
        <div ref={mapEl} style={{ height: 220, borderRadius: 12, overflow: "hidden", marginBottom: 12, background: "rgba(255,255,255,.04)" }} data-testid="timeline-map" />
        {loading ? (
          <div className="center" style={{ padding: 20 }}><Loader2 className="spin" size={22} /></div>
        ) : !shared ? (
          <p className="muted center" style={{ fontSize: 13 }}>{t("fam.tl.notShared")}</p>
        ) : total === 0 ? (
          <p className="muted center" style={{ fontSize: 13 }} data-testid="timeline-empty">{t("fam.tl.empty", { day: dayLabel.toLowerCase() })}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="timeline-list">
            <div className="muted" style={{ fontSize: 12.5 }}>{t("fam.tl.showing", { n: pts.length, total })}</div>
            {pts.map((p, i) => (
              <div key={i} className="info-row" style={{ padding: "7px 0", borderTop: i ? "1px solid var(--border, rgba(255,255,255,.06))" : "none" }}>
                <span className="ir-k" style={{ fontWeight: 700 }}><Clock size={13} /> {fmtTime(p.at)}</span>
                <a className="btn btn-ghost btn-sm" href={`https://maps.google.com/?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}><MapPin size={13} /> {p.speed_kmh != null ? `${Math.round(p.speed_kmh)} km/h` : t("sf.map")}</a>
              </div>
            ))}
            {hasMore && (
              <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 4 }} disabled={loadingMore}
                onClick={() => fetchPage(points.length, true)} data-testid="timeline-more">
                {loadingMore ? <Loader2 className="spin" size={15} /> : <>{t("fam.tl.nextN", { n: Math.min(TIMELINE_PAGE, total - points.length) })}</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Family() {
  const { t } = useT();
  // Hydrate instantly from the last view (if any) so coming back to this tab
  // shows the previous data at once instead of a spinner + full refetch. The
  // background refresh below updates it in place.
  const _cached = cacheGet("family:v1");
  const [data, setData] = useState(_cached?.data ?? null);
  const [placeEvents, setPlaceEvents] = useState(_cached?.placeEvents ?? []);
  const [rules, setRules] = useState(_cached?.rules ?? null);
  const [zones, setZones] = useState(_cached?.zones ?? []);
  const [checkIns, setCheckIns] = useState(_cached?.checkIns ?? { incoming: [], outgoing: [] });
  const [activeSos, setActiveSos] = useState(_cached?.activeSos ?? []);
  const [intruders, setIntruders] = useState(_cached?.intruders ?? []);
  const [addPhone, setAddPhone] = useState("");
  const [addName, setAddName] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [digest, setDigest] = useState(_cached?.digest ?? null);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  // Only show the first-load spinner when there's nothing cached to show.
  const [loading, setLoading] = useState(!_cached);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeline, setTimeline] = useState(null); // { id, name } of member whose day trail is open
  const [openMember, setOpenMember] = useState(null);
  const [locPrompt, setLocPrompt] = useState(null);  // {message, canOpenSettings} when location is off
  const [photoBox, setPhotoBox] = useState(null);     // enlarged intruder photo
  const mapEl = useRef(null); const mapObj = useRef(null); const layer = useRef(null);

  // `background` refreshes keep the cached view on screen (no spinner, no
  // flicker) and just update it in place — used by the live poller below so
  // members' speed/battery/location stay current without the page blinking.
  const load = async (background = false) => {
    if (!background) setLoading(true);
    // Build a snapshot as we go so the whole view can be cached for instant
    // re-entry (see cacheGet above).
    const snap = { data: null, placeEvents: [], rules: null, zones: [],
      checkIns: { incoming: [], outgoing: [] }, activeSos: [], intruders: [], digest: null };
    try {
      const d = (await api.get("/family")).data;
      setData(d); snap.data = d;
      if (d.in_family) {
        // Fire all secondary panels in PARALLEL (was sequential — the main cause
        // of the slow Family load). Each keeps its previous value on failure.
        const [pe, rl, zn, ci, asos, intr, dg] = await Promise.all([
          api.get("/family/place-events").then((r) => r.data.items || []).catch(() => snap.placeEvents),
          api.get("/family/alert-rules").then((r) => r.data).catch(() => snap.rules),
          api.get("/family/zones").then((r) => r.data.items || []).catch(() => snap.zones),
          api.get("/family/check-ins").then((r) => r.data).catch(() => snap.checkIns),
          api.get("/family/active-sos").then((r) => r.data.items || []).catch(() => snap.activeSos),
          api.get("/family/intruder-alerts").then((r) => r.data.items || []).catch(() => snap.intruders),
          api.get("/family/digest").then((r) => r.data).catch(() => snap.digest),
        ]);
        snap.placeEvents = pe; setPlaceEvents(pe);
        snap.rules = rl; setRules(rl);
        snap.zones = zn; setZones(zn);
        snap.checkIns = ci; setCheckIns(ci);
        snap.activeSos = asos; setActiveSos(asos);
        snap.intruders = intr; setIntruders(intr);
        snap.digest = dg; setDigest(dg);
      }
      cacheSet("family:v1", snap); // remember this view for instant re-entry
    } catch (_) { /* keep showing the last good data */ }
    finally { if (!background) setLoading(false); }
  };
  // On mount: if we have a cached view, refresh quietly (no spinner); otherwise
  // do a normal first load with the spinner.
  useEffect(() => { load(Boolean(_cached)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live refresh every 20s in the background (members' speed/battery/location +
  // SOS pins) — cached view stays put, so no reload flicker.
  useEffect(() => {
    if (!data?.in_family) return;
    const tmr = setInterval(() => {
      load(true);
      api.get("/family/active-sos").then((r) => setActiveSos(r.data.items || [])).catch(() => {});
    }, 20000);
    const onVis = () => { if (document.visibilityState === "visible") load(true); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(tmr); document.removeEventListener("visibilitychange", onVis); };
  }, [data?.in_family]);  // eslint-disable-line react-hooks/exhaustive-deps

  const saveRules = async (patch) => {
    const next = { ...rules, ...patch };
    setRules(next);
    await api.put("/family/alert-rules", {
      place_alerts_enabled: next.place_alerts_enabled,
      place_alert_direction: next.place_alert_direction,
      quiet_start: next.quiet_start, quiet_end: next.quiet_end,
      low_battery_threshold: next.low_battery_threshold ?? 15,
      sos_escalation_min: next.sos_escalation_min ?? 3,
      digest_day: next.digest_day ?? 6,
      digest_hour: next.digest_hour ?? 9,
    });
  };
  const sendDigest = async () => {
    setSending(true); setSentMsg("");
    try { const r = (await api.post("/family/digest/send")).data; setSentMsg(t("fam.digestSent", { n: r.sent, email: r.emailed ? t("fam.digestSentEmail", { m: r.emailed }) : "" })); load(); }
    catch (e) { setSentMsg(e?.response?.data?.detail || t("fam.digestErr")); }
    finally { setSending(false); }
  };
  const muteZone = async (z) => {
    setZones(zones.map((x) => x.id === z.id ? { ...x, muted: !z.muted } : x));
    await api.put(`/family/zones/${z.id}/mute`, { muted: !z.muted });
  };
  const requestCheckIn = async (memberId) => { await api.post("/family/check-in", { member_id: memberId }); await load(); };
  const respondCheckIn = async (id, status) => { await api.post(`/family/check-in/${id}/respond`, { status }); await load(); };
  const nudgeMember = async (memberId) => { await api.post("/family/nudge", { member_id: memberId }); };

  useEffect(() => {
    if (!data?.in_family) return;
    const pts = data.members.filter((m) => m.latitude != null);
    const sosPts = (activeSos || []).filter((s) => s.latitude != null);
    if (!pts.length && !sosPts.length) return;
    const center = pts[0] || sosPts[0];
    loadLeaflet().then((L) => {
      if (!mapEl.current) return;
      if (!mapObj.current) {
        mapObj.current = L.map(mapEl.current, { zoomControl: true }).setView([center.latitude, center.longitude], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapObj.current);
        // The map often mounts before its container has a measured size, which
        // leaves it grey/black until a resize. Recompute size on the next frames.
        setTimeout(() => { try { mapObj.current && mapObj.current.invalidateSize(); } catch (_) {} }, 100);
        setTimeout(() => { try { mapObj.current && mapObj.current.invalidateSize(); } catch (_) {} }, 600);
      } else {
        try { mapObj.current.invalidateSize(); } catch (_) {}
      }
      if (layer.current) layer.current.remove();
      layer.current = L.layerGroup().addTo(mapObj.current);
      pts.forEach((m) => L.marker([m.latitude, m.longitude]).addTo(layer.current).bindPopup(`<b>${m.name}</b>${m.battery != null ? `<br/>🔋 ${m.battery}%` : ""}`));
      sosPts.forEach((s) => L.circleMarker([s.latitude, s.longitude], { radius: 12, color: "#ff3b5c", fillColor: "#ff3b5c", fillOpacity: 0.6, weight: 3 }).addTo(layer.current).bindPopup(`<b>🆘 ${s.member_name}</b><br/>SOS active`).openPopup());
      const all = [...pts.map((m) => [m.latitude, m.longitude]), ...sosPts.map((s) => [s.latitude, s.longitude])];
      if (all.length > 1) mapObj.current.fitBounds(all, { padding: [40, 40] });
    }).catch(() => { /* map CDN unreachable: the list and buttons still work */ });
  }, [data, activeSos]);

  const create = async () => { setBusy(true); setErr(""); try { await api.post("/family", { name }); await load(); } catch (e) { setErr(e?.response?.data?.detail || t("fam.createErr")); } finally { setBusy(false); } };
  const join = async () => { setBusy(true); setErr(""); try { await api.post("/family/join", { invite_code: code }); await load(); } catch (e) { setErr(e?.response?.data?.detail || t("fam.joinErr")); } finally { setBusy(false); } };
  const addByPhone = async () => {
    setAdding(true); setAddMsg("");
    try { const r = (await api.post("/family/add-by-phone", { phone: addPhone, name: addName || undefined })).data; setAddMsg(t("fam.addedMsg", { name: r.name || t("fam.member") })); setAddPhone(""); setAddName(""); await load(); }
    catch (e) { setAddMsg(e?.response?.data?.detail || t("fam.addErr")); }
    finally { setAdding(false); }
  };
  const leave = async () => { if (!window.confirm(data.is_guardian ? t("fam.leaveGuardian") : t("fam.leaveMember"))) return; await api.post("/family/leave"); load(); };
  const removeMember = async (id) => { if (!window.confirm(t("fam.removeConfirm"))) return; await api.delete(`/family/members/${id}`); load(); };
  const copyCode = () => { navigator.clipboard.writeText(data.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const setSharing = async (key, val) => { await api.put("/family/my-sharing", { share_location: key === "loc" ? val : me.share_location, share_activity: key === "act" ? val : me.share_activity }); load(); };
  // `manual` = user tapped "Share my status": show a clear prompt if location is
  // off. The 60s auto-refresh runs silently (no nagging popup).
  const shareStatus = async (manual = false) => {
    let batt = null;
    try { if (navigator.getBattery) { const b = await navigator.getBattery(); batt = Math.round(b.level * 100); } } catch (_) {}
    try {
      const pos = await getPosition({ timeout: 8000, enableHighAccuracy: true });
      await api.post("/me/status", { latitude: pos.latitude, longitude: pos.longitude, battery: batt, speed_kmh: pos.speed_kmh ?? null });
      setLocPrompt(null);
      load(true);   // background refresh — no spinner, no flicker
      return pos.speed_kmh ?? null;
    } catch (e) {
      if (manual) setLocPrompt(locationHint(e));   // only prompt on an explicit tap
      return null;
    }
  };

  // Share location by DEFAULT while in a family: as long as "Share location" is
  // on (which it is by default), auto-post the user's location when the page
  // opens and refresh it every 60s — no manual tap needed.
  const _myShareLoc = !!data?.in_family && !!(data.members || []).find((m) => m.is_me)?.share_location;
  useEffect(() => {
    if (!_myShareLoc) return;
    let stop = false;
    let timer;
    // Adaptive cadence: refresh every 15s while MOVING (so live speed stays
    // fresh) and back off to 45s when parked — keeps speed live without draining
    // the battery when stationary.
    const tick = async () => {
      const spd = await shareStatus();
      if (stop) return;
      const next = spd != null && spd >= 5 ? 15000 : 45000;
      timer = setTimeout(tick, next);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_myShareLoc]);

  if (loading) return <div className="page" style={{ padding: 40 }}><div className="spinner" data-testid="family-loading" /></div>;
  const me = data.in_family ? data.members.find((m) => m.is_me) : null;

  return (
    <div className="page" data-testid="family-page" style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 80px" }}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <Users size={26} className="neon" /><h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{t("fam.title")}</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{t("fam.sub")}</p>

      {!data.in_family ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="family-start">
          <div className="glass card-pad" style={{ padding: 24 }} data-testid="family-create-card">
            <Crown size={22} style={{ color: "#f5a524" }} /><h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>{t("fam.createTitle")}</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{t("fam.createSub")}</p>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fam.namePh")} data-testid="family-name-input" style={{ marginBottom: 10 }} />
            <button className="btn btn-primary btn-block" onClick={create} disabled={busy || !name.trim()} data-testid="family-create-btn">{busy ? <Loader2 className="spin" size={16} /> : t("fam.createBtn")}</button>
          </div>
          <div className="glass card-pad" style={{ padding: 24 }} data-testid="family-join-card">
            <Users size={22} className="neon" /><h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>{t("fam.joinTitle")}</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{t("fam.joinSub")}</p>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("fam.codePh")} data-testid="family-code-input" style={{ marginBottom: 10 }} />
            <button className="btn btn-primary btn-block" onClick={join} disabled={busy || !code.trim()} data-testid="family-join-btn">{busy ? <Loader2 className="spin" size={16} /> : t("fam.joinBtn")}</button>
          </div>
          {err && <p style={{ color: "#ff7591", fontSize: 13, gridColumn: "1/-1" }} data-testid="family-error">{err}</p>}
        </div>
      ) : (
        <>
          <div className="glass" style={{ padding: "14px 18px", borderRadius: 14, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div><div style={{ fontWeight: 800, fontSize: 18 }}>{data.name}</div><div className="muted" style={{ fontSize: 12.5 }}>{t("fam.membersCount", { n: data.members.length })}{data.is_guardian ? t("fam.youGuardian") : ""}</div></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {data.is_guardian && data.invite_code && (
                <button className="btn btn-ghost btn-sm" onClick={copyCode} data-testid="family-invite-copy">{copied ? <><CheckCircle2 size={14} /> {t("common.copied")}</> : <><Copy size={14} /> {t("fam.inviteCode", { code: data.invite_code })}</>}</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => shareStatus(true)} data-testid="family-share-status"><LocateFixed size={14} /> {t("fam.shareStatus")}</button>
              <button className="btn btn-danger btn-sm" onClick={leave} data-testid="family-leave-btn"><LogOut size={14} /> {t("fam.leave")}</button>
            </div>
          </div>

          {locPrompt && (
            <div data-testid="location-prompt" className="glass" style={{ padding: "12px 16px", borderRadius: 12, margin: "0 0 14px", border: "1px solid rgba(245,165,36,.5)", background: "rgba(245,165,36,.1)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <LocateFixed size={18} style={{ color: "#f5a524", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13.5, minWidth: 180 }}>{locPrompt.message}</span>
              {locPrompt.canOpenSettings && <button className="btn btn-primary btn-sm" data-testid="location-open-settings" onClick={() => openLocationSettings()}>{t("fam.openLocSettings")}</button>}
              <button className="btn btn-ghost btn-sm" data-testid="location-retry" onClick={() => shareStatus(true)}>{t("common.retry")}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setLocPrompt(null)} aria-label="Dismiss"><X size={14} /></button>
            </div>
          )}

          {data.is_guardian && (
            <div className="glass" style={{ padding: 16, borderRadius: 14, marginBottom: 16 }} data-testid="family-add-phone-card">
              <div style={{ fontWeight: 700, fontSize: 14.5, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><UserPlus size={17} className="neon" /> {t("fam.addTitle")}</div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>{t("fam.addDesc")}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input className="input" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} placeholder={t("fam.phonePh")} data-testid="family-add-phone-input" style={{ flex: "1 1 160px" }} />
                <input className="input" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t("fam.nameOptPh")} data-testid="family-add-name-input" style={{ flex: "1 1 140px" }} />
                <button className="btn btn-primary btn-sm" onClick={addByPhone} disabled={adding || !addPhone.trim()} data-testid="family-add-phone-btn">{adding ? <Loader2 className="spin" size={15} /> : <><UserPlus size={14} /> {t("common.add")}</>}</button>
              </div>
              {addMsg && <p style={{ fontSize: 12.5, marginTop: 8, color: addMsg.startsWith("✓") ? "#34d399" : "#ff7591" }} data-testid="family-add-msg">{addMsg}</p>}
            </div>
          )}

          {checkIns.incoming.length > 0 && (
            <div className="glass" style={{ padding: 16, borderRadius: 14, marginBottom: 16, borderColor: "rgba(245,165,36,.5)", background: "rgba(245,165,36,.06)" }} data-testid="checkin-incoming">
              {checkIns.incoming.map((ci) => (
                <div key={ci.id} data-testid={`checkin-incoming-${ci.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}><HeartHandshake size={20} style={{ color: "#f5a524" }} /><span style={{ fontSize: 14, fontWeight: 600 }}>{t("fam.checkinAsk", { name: ci.guardian_name || t("fam.yourGuardian") })}</span></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => respondCheckIn(ci.id, "safe")} data-testid={`checkin-safe-${ci.id}`}><CheckCircle2 size={14} /> {t("fam.imSafe")}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => respondCheckIn(ci.id, "need_help")} data-testid={`checkin-help-${ci.id}`}><AlertTriangle size={14} /> {t("fam.needHelp")}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSos.length > 0 && (
            <div className="glass" style={{ padding: 16, borderRadius: 14, marginBottom: 16, borderColor: "rgba(255,59,92,.6)", background: "rgba(255,59,92,.08)" }} data-testid="active-sos-banner">
              {activeSos.map((s) => (
                <div key={s.id} data-testid={`active-sos-${s.id}`} style={{ display: "grid", gap: 10, padding: "6px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <ShieldAlert size={22} style={{ color: "#ff3b5c", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: "#ff3b5c" }}>🆘 {s.is_me ? t("fam.yourSosActive") : t("fam.memberSosActive", { name: s.member_name })}{s.source && s.source !== "app" ? t("fam.quickSosSuffix") : ""}{s.escalated ? t("fam.escalatedSuffix") : ""}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{new Date(s.created_at).toLocaleString()}{s.message ? ` · "${s.message}"` : ""}</div>
                    </div>
                    {s.latitude != null && <a className="btn btn-danger btn-sm" href={`https://maps.google.com/?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" data-testid={`active-sos-nav-${s.id}`}><MapPin size={14} /> {t("fam.navigate")}</a>}
                  </div>
                  {!s.is_me && s.has_photo && <SosPhoto sosId={s.id} testPrefix={`active-sos-${s.id}`} />}
                  {/* Police / Ambulance / Location — one per line, same on every phone */}
                  <SosActions sos={s} compact testPrefix={`active-sos-${s.id}`} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {s.can_resolve !== false && (
                      <button className="btn btn-primary btn-sm" data-testid={`active-sos-resolve-${s.id}`}
                        onClick={async () => { try { await api.post(`/family/sos/${s.id}/resolve`); } catch (_) {} setActiveSos((cur) => cur.filter((x) => x.id !== s.id)); }}>
                        <CheckCircle2 size={14} /> {s.is_me ? t("fam.imSafe") : t("fam.markResolved")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(data.members.some((m) => m.latitude != null) || activeSos.some((s) => s.latitude != null)) && (
            <div ref={mapEl} data-testid="family-map" style={{ height: 300, borderRadius: 14, overflow: "hidden", border: "1px solid var(--panel-brd)", marginBottom: 16 }} />
          )}

          {me && (
            <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, marginBottom: 16, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }} data-testid="family-privacy">
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{t("fam.myPrivacy")}</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }} onClick={() => setSharing("loc", !me.share_location)} data-testid="toggle-share-location">{me.share_location ? <Eye size={15} className="neon" /> : <EyeOff size={15} className="muted" />} {t("fam.shareLocation")}</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }} onClick={() => setSharing("act", !me.share_activity)} data-testid="toggle-share-activity">{me.share_activity ? <Eye size={15} className="neon" /> : <EyeOff size={15} className="muted" />} {t("fam.shareActivity")}</label>
            </div>
          )}

          {me && me.share_location && <BackgroundLocationCard />}

          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>{t("fam.members")}</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {data.members.map((m) => (
              <div key={m.member_id} data-testid={`member-${m.member_id}`} className="glass" style={{ padding: 14, borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg,#b3122f,#e92546)", display: "grid", placeItems: "center", fontWeight: 800, color: "#fff", flexShrink: 0 }}>{m.name?.[0]?.toUpperCase() || "?"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>{m.name} {m.role === "guardian" && <Crown size={14} style={{ color: "#f5a524" }} />}{m.is_me && <span className="muted" style={{ fontSize: 12 }}>{t("fam.you")}</span>}</div>
                    {m.latitude == null && <div className="muted" style={{ fontSize: 12.5 }}>{t("fam.noLocation")}</div>}
                  </div>
                </div>

                {/* Detail box — one row per fact. Speed/battery/last-seen/location
                    show for everyone; vehicle number + speed limit only when the
                    member has a vehicle registered (no empty placeholders). */}
                <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13 }} data-testid={`member-detail-${m.member_id}`}>
                  {m.speed_kmh != null && (
                    <div className="info-row">
                      <span className="muted ir-k"><Gauge size={13} /> {t("fam.speed")}</span>
                      <span className="ir-v" style={{ color: m.overspeed ? "#ff3b5c" : "inherit" }} data-testid={`member-speed-${m.member_id}`}>{Math.round(m.speed_kmh)} km/h{m.overspeed ? t("fam.overLimit") : ""}</span>
                    </div>
                  )}
                  {m.vehicle_number && (
                    <div className="info-row">
                      <span className="muted ir-k"><Smartphone size={13} /> {t("fam.vehicle")}</span>
                      <span className="ir-v" data-testid={`member-vehicle-${m.member_id}`}>{m.vehicle_number}{m.speed_limit_kmh ? t("fam.limitSuffix", { n: m.speed_limit_kmh }) : ""}</span>
                    </div>
                  )}
                  {m.battery != null && (
                    <div className="info-row">
                      <span className="muted ir-k"><BatteryMedium size={13} /> {t("fam.battery")}</span>
                      <span className="ir-v" style={{ color: m.battery <= 15 ? "#ff3b5c" : "inherit" }}>{m.battery}%</span>
                    </div>
                  )}
                  {m.last_seen && (
                    <div className="info-row">
                      <span className="muted ir-k"><Clock size={13} /> {t("fam.lastSeen")}</span>
                      <span className="ir-v" style={{ fontWeight: 400 }}>{new Date(m.last_seen).toLocaleString()}</span>
                    </div>
                  )}
                  {m.latitude != null && (
                    <div className="info-row">
                      <span className="muted ir-k"><MapPin size={13} /> {t("fam.location")}</span>
                      <a className="btn btn-ghost btn-sm" href={`https://maps.google.com/?q=${m.latitude},${m.longitude}`} target="_blank" rel="noreferrer" data-testid={`member-map-${m.member_id}`} style={{ padding: "2px 10px", flexShrink: 0 }}>{t("fam.openMap")}</a>
                    </div>
                  )}
                </div>

                {/* Actions wrap so none are clipped on narrow phones. */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {data.is_guardian && !m.is_me && <button className="btn btn-ghost btn-sm" onClick={() => requestCheckIn(m.member_id)} data-testid={`member-checkin-${m.member_id}`}><HeartHandshake size={14} /> {t("fam.checkIn")}</button>}
                  {data.is_guardian && !m.is_me && <button className="btn btn-ghost btn-sm" onClick={() => nudgeMember(m.member_id)} data-testid={`member-nudge-${m.member_id}`} title={t("fam.nudgeTitle")}><BellRing size={14} /> {t("fam.nudge")}</button>}
                  {(data.is_guardian || m.is_me) && <button className="btn btn-ghost btn-sm" onClick={() => setOpenMember(openMember === m.member_id ? null : m.member_id)} data-testid={`member-activity-btn-${m.member_id}`}><Activity size={14} /> {t("fam.activity")}</button>}
                  {/* Show Timeline for anyone who shares location (or me) — not only
                      when a current location exists — so a member who simply hasn't
                      pinged yet still has the button; the panel then explains if empty. */}
                  {(m.is_me || m.share_location !== false) && <button className="btn btn-ghost btn-sm" onClick={() => setTimeline({ id: m.member_id, name: m.name || t("fam.member") })} data-testid={`member-timeline-btn-${m.member_id}`}><Clock size={14} /> {t("fam.timeline")}</button>}
                  {data.is_guardian && m.role !== "guardian" && <button className="btn btn-ghost btn-sm" onClick={() => removeMember(m.member_id)} data-testid={`member-remove-${m.member_id}`}><UserMinus size={14} /> {t("fam.remove")}</button>}
                </div>
                {openMember === m.member_id && <MemberActivity memberId={m.member_id} />}
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 18, margin: "26px 0 12px", display: "flex", alignItems: "center", gap: 8 }}><ShieldAlert size={17} style={{ color: "#ff3b5c" }} /> {t("fam.intruderTitle")}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>{t("fam.intruderDesc")}</p>
          {intruders.length === 0 ? (
            <p className="muted" data-testid="family-intruder-empty" style={{ textAlign: "center", padding: "14px 0", fontSize: 13.5 }}>{t("fam.intruderEmpty")}</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }} data-testid="family-intruder-list">
              {intruders.map((ev) => (
                <div key={ev.id} data-testid={`family-intruder-${ev.id}`} className="glass" style={{ padding: 12, borderRadius: 14 }}>
                  {ev.photo_base64 ? (
                    <img src={ev.photo_base64.startsWith("data:") ? ev.photo_base64 : `data:image/jpeg;base64,${ev.photo_base64}`} alt="intruder" data-testid={`family-intruder-photo-${ev.id}`} onClick={() => setPhotoBox(ev.photo_base64.startsWith("data:") ? ev.photo_base64 : `data:image/jpeg;base64,${ev.photo_base64}`)} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 12, cursor: "pointer", background: "#0c0c14", border: "1px solid var(--panel-brd)" }} />
                  ) : <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, background: "#0c0c14", border: "1px solid var(--panel-brd)", display: "grid", placeItems: "center", gap: 6 }} className="muted"><Camera size={22} /><span style={{ fontSize: 12 }}>{t("fam.noPhoto")}</span></div>}
                  <div style={{ fontWeight: 700, marginTop: 10, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}><ShieldAlert size={14} style={{ color: "#ff3b5c" }} /> {t("fam.attempts", { n: ev.attempt_count })} {ev.triggered_lock && <Lock size={12} style={{ color: "#ff3b5c" }} />}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}><Smartphone size={12} style={{ verticalAlign: "-2px" }} /> {ev.owner_name}{ev.is_me ? ` ${t("fam.you")}` : ""} · {ev.device_name}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{ev.created_at ? new Date(ev.created_at).toLocaleString() : ""}</div>
                  {ev.latitude != null ? (
                    <a className="btn btn-danger btn-sm" href={`https://maps.google.com/?q=${ev.latitude},${ev.longitude}`} target="_blank" rel="noreferrer" data-testid={`family-intruder-loc-${ev.id}`} style={{ marginTop: 8, width: "100%" }}><MapPin size={14} /> {t("fam.seeLocation")}</a>
                  ) : <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{t("fam.noLocSent")}</div>}
                </div>
              ))}
            </div>
          )}

          {photoBox && (
            <div data-testid="family-intruder-lightbox" onClick={() => setPhotoBox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", display: "grid", placeItems: "center", zIndex: 4500, padding: 20 }}>
              <img src={photoBox} alt="intruder" style={{ maxWidth: "92%", maxHeight: "86%", borderRadius: 12, objectFit: "contain" }} />
            </div>
          )}

          <h2 style={{ fontSize: 18, margin: "26px 0 12px", display: "flex", alignItems: "center", gap: 8 }}><MapPin size={17} className="neon" /> {t("fam.placeAlerts")}</h2>
          {placeEvents.length === 0 ? (
            <p className="muted" data-testid="place-events-empty" style={{ textAlign: "center", padding: "14px 0", fontSize: 13.5 }}>{t("fam.placeEmpty")}</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }} data-testid="place-events-timeline">
              {placeEvents.map((e) => (
                <div key={e.id} data-testid={`place-event-${e.id}`} className="glass" style={{ padding: "11px 14px", borderRadius: 11, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", flexShrink: 0, background: e.type === "enter" ? "rgba(52,211,153,.14)" : "rgba(245,165,36,.14)", color: e.type === "enter" ? "#34d399" : "#f5a524" }}>{e.type === "enter" ? <LogIn size={16} /> : <LogOut size={16} />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}><b>{e.member_name}</b> {e.type === "enter" ? t("fam.arrivedAt") : t("fam.leftPlace")} <b>{e.zone_name}</b></div>
                    <div className="muted" style={{ fontSize: 12 }}>{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {rules?.is_guardian && (
            <div className="glass" style={{ padding: 16, borderRadius: 14, marginTop: 22 }} data-testid="alert-rules-card">
              <h2 style={{ fontSize: 18, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}><Bell size={17} className="neon" /> {t("fam.rulesTitle")}</h2>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{t("fam.rulesSub")}</p>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 12 }} onClick={() => saveRules({ place_alerts_enabled: !rules.place_alerts_enabled })} data-testid="rules-enabled-toggle">
                <span style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid var(--panel-brd)", background: rules.place_alerts_enabled ? "linear-gradient(100deg,#b3122f,#e92546)" : "transparent", display: "grid", placeItems: "center" }}>{rules.place_alerts_enabled && <CheckCircle2 size={12} color="#fff" />}</span>
                <span style={{ fontSize: 13.5 }}>{t("fam.sendPlaceAlerts")}</span>
              </label>
              <div className="field" style={{ marginBottom: 12, opacity: rules.place_alerts_enabled ? 1 : .5 }}>
                <label style={{ fontSize: 13 }}>{t("fam.alertWhen")}</label>
                <select className="input" value={rules.place_alert_direction} onChange={(e) => saveRules({ place_alert_direction: e.target.value })} disabled={!rules.place_alerts_enabled} data-testid="rules-direction-select">
                  <option value="both">{t("fam.dirBoth")}</option>
                  <option value="enter">{t("fam.dirEnter")}</option>
                  <option value="exit">{t("fam.dirExit")}</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", opacity: rules.place_alerts_enabled ? 1 : .5 }}>
                <div className="field" style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Moon size={13} /> {t("fam.quietFrom")}</label>
                  <select className="input" value={rules.quiet_start ?? ""} onChange={(e) => saveRules({ quiet_start: e.target.value === "" ? null : Number(e.target.value) })} disabled={!rules.place_alerts_enabled} data-testid="rules-quiet-start">
                    <option value="">{t("common.off")}</option>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 13 }}>{t("fam.quietUntil")}</label>
                  <select className="input" value={rules.quiet_end ?? ""} onChange={(e) => saveRules({ quiet_end: e.target.value === "" ? null : Number(e.target.value) })} disabled={!rules.place_alerts_enabled} data-testid="rules-quiet-end">
                    <option value="">{t("common.off")}</option>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><BatteryLow size={14} /> {t("fam.batteryBelow")}</label>
                <select className="input" value={rules.low_battery_threshold ?? 15} onChange={(e) => saveRules({ low_battery_threshold: Number(e.target.value) })} data-testid="rules-battery-threshold">
                  {[5, 10, 15, 20, 25, 30, 40, 50].map((p) => <option key={p} value={p}>{p}%</option>)}
                </select>
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Timer size={14} /> {t("fam.sosUnanswered")}</label>
                <select className="input" value={rules.sos_escalation_min ?? 3} onChange={(e) => saveRules({ sos_escalation_min: Number(e.target.value) })} data-testid="rules-sos-escalation">
                  {[1, 2, 3, 5, 10, 15].map((m) => <option key={m} value={m}>{t("fam.minutes", { n: m })}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                <div className="field" style={{ flex: 1, minWidth: 130 }}>
                  <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><BarChart3 size={14} /> {t("fam.digestOn")}</label>
                  <select className="input" value={rules.digest_day ?? 6} onChange={(e) => saveRules({ digest_day: Number(e.target.value) })} data-testid="rules-digest-day">
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => <option key={i} value={i}>{t("fam.day." + i)}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 130 }}>
                  <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Clock size={14} /> {t("fam.atIst")}</label>
                  <select className="input" value={rules.digest_hour ?? 9} onChange={(e) => saveRules({ digest_hour: Number(e.target.value) })} data-testid="rules-digest-hour">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                  </select>
                </div>
              </div>
              {zones.length > 0 && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--panel-brd)", paddingTop: 14 }} data-testid="zone-rules">
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{t("fam.muteTitle")}</div>
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 10 }}>{t("fam.muteSub")}</p>
                  <div style={{ display: "grid", gap: 8 }}>
                    {zones.map((z) => (
                      <label key={z.id} data-testid={`zone-mute-${z.id}`} onClick={() => muteZone(z)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 10, background: "rgba(255,255,255,.03)" }}>
                        <span style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}><MapPin size={14} className={z.muted ? "muted" : "neon"} /> {z.name} <span className="muted" style={{ fontSize: 12 }}>· {z.member_name}</span></span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: z.muted ? "var(--muted)" : "#34d399" }}>{z.muted ? <><EyeOff size={14} /> {t("fam.muted")}</> : <><Bell size={14} /> {t("common.on")}</>}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {data.is_guardian && checkIns.outgoing?.length > 0 && (
            <div className="glass" style={{ padding: 16, borderRadius: 14, marginTop: 18 }} data-testid="checkin-history">
              <h2 style={{ fontSize: 18, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}><HeartHandshake size={17} className="neon" /> {t("fam.checkinHistory")}</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {checkIns.outgoing.map((ci) => {
                  const replyMs = ci.responded_at ? new Date(ci.responded_at) - new Date(ci.created_at) : null;
                  const replyTxt = replyMs != null ? (replyMs < 60000 ? `${Math.max(1, Math.round(replyMs / 1000))}s` : `${Math.round(replyMs / 60000)}m`) : null;
                  const meta = ci.status === "pending" ? { c: "#f5a524", t: t("fam.awaitingReply") } : ci.status === "safe" ? { c: "#34d399", t: t("fam.repliedSafe", { t: replyTxt }) } : { c: "#ff3b5c", t: t("fam.needsHelpReplied", { t: replyTxt }) };
                  return (
                    <div key={ci.id} data-testid={`checkin-hist-${ci.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderRadius: 10, background: "rgba(255,255,255,.03)" }}>
                      <span style={{ fontSize: 13.5 }}>{ci.member_name}</span>
                      <span style={{ fontSize: 12.5, color: meta.c, fontWeight: 600 }}>{meta.t}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{new Date(ci.created_at).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {digest && (
            <div className="glass" style={{ padding: 16, borderRadius: 14, marginTop: 18 }} data-testid="digest-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 18, margin: 0, display: "flex", alignItems: "center", gap: 8 }}><BarChart3 size={17} className="neon" /> {t("fam.digestTitle")}</h2>
                {digest.is_guardian && <button className="btn btn-primary btn-sm" onClick={sendDigest} disabled={sending} data-testid="digest-send-btn">{sending ? <Loader2 className="spin" size={14} /> : <><Send size={14} /> {t("fam.sendNow")}</>}</button>}
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t("fam.digestAuto", { day: t("fam.days." + (rules?.digest_day ?? 6)), hour: String(rules?.digest_hour ?? 9).padStart(2, "0"), last: digest.last_sent_at ? t("fam.lastSent", { date: new Date(digest.last_sent_at).toLocaleString() }) : "" })}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 6 }}>
                <div style={{ textAlign: "center", padding: "12px 6px", borderRadius: 10, background: "rgba(233,37,70,.08)" }}><MapPin size={18} className="neon" /><div style={{ fontSize: 22, fontWeight: 800 }} data-testid="digest-visits">{digest.place_visits}</div><div className="muted" style={{ fontSize: 12 }}>{t("fam.placeVisits")}</div></div>
                <div style={{ textAlign: "center", padding: "12px 6px", borderRadius: 10, background: "rgba(255,59,92,.08)" }}><AlertTriangle size={18} style={{ color: "#ff3b5c" }} /><div style={{ fontSize: 22, fontWeight: 800 }} data-testid="digest-sos">{digest.sos_events}</div><div className="muted" style={{ fontSize: 12 }}>{t("fam.sosAlerts")}</div></div>
                <div style={{ textAlign: "center", padding: "12px 6px", borderRadius: 10, background: "rgba(245,165,36,.08)" }}><BatteryMedium size={18} style={{ color: "#f5a524" }} /><div style={{ fontSize: 22, fontWeight: 800 }} data-testid="digest-battery">{digest.low_battery}</div><div className="muted" style={{ fontSize: 12 }}>{t("fam.lowBattery")}</div></div>
              </div>
              {digest.top_places?.length > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t("fam.mostVisited", { list: digest.top_places.map((p) => `${p.name} (${p.count})`).join(", ") })}</p>}
              {digest.is_guardian && digest.preview_text && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDigestOpen((v) => !v)} data-testid="digest-preview-toggle"><ChevronDown size={14} style={{ transform: digestOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> {digestOpen ? t("fam.hidePreview") : t("fam.previewMsg")}</button>
                  {digestOpen && (
                    <pre data-testid="digest-preview-text" style={{ marginTop: 8, padding: 12, borderRadius: 10, background: "rgba(255,255,255,.04)", border: "1px solid var(--panel-brd)", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.6 }}>{digest.preview_text}</pre>
                  )}
                </div>
              )}
              {sentMsg && <p style={{ fontSize: 12.5, marginTop: 8, color: "#34d399" }} data-testid="digest-sent-msg">{sentMsg}</p>}
            </div>
          )}
        </>
      )}
      {timeline && <MemberTimeline memberId={timeline.id} name={timeline.name} onClose={() => setTimeline(null)} />}
      <style>{`@media(max-width:640px){.family-start{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
