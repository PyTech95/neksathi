import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Siren, ParkingCircle, Lock, Flame, Truck, Gauge, Video, MapPin, Phone, Loader2 } from "lucide-react";
import api from "@/lib/api";

// All of the user's notifications live behind this one bell. We load just 6 at a
// time and let the user tap "View more" to pull the next 6, so a user with
// thousands of alerts never loads them all at once (which used to crash / hang).
const PAGE = 6;
const SEEN_KEY = "nk_notif_seen_at";

const META = {
  emergency: { icon: <Siren size={16} />, color: "#ff3b5c", label: "Emergency" },
  wrong_parking: { icon: <ParkingCircle size={16} />, color: "#f5a524", label: "Wrong parking" },
  theft: { icon: <Lock size={16} />, color: "#ff4d67", label: "Theft" },
  fire: { icon: <Flame size={16} />, color: "#f97316", label: "Fire" },
  towing: { icon: <Truck size={16} />, color: "#e92546", label: "Towing" },
  speed_alert: { icon: <Gauge size={16} />, color: "#f5a524", label: "Overspeed" },
  sos: { icon: <Siren size={16} />, color: "#ff3b5c", label: "SOS" },
  sos_video: { icon: <Video size={16} />, color: "#ff3b5c", label: "SOS video" },
  geofence: { icon: <MapPin size={16} />, color: "#2fcf7a", label: "Safe zone" },
};

const fmt = (d) => {
  try {
    return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (_) { return ""; }
};

const getSeen = () => { try { return localStorage.getItem(SEEN_KEY) || ""; } catch (_) { return ""; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch (_) {} };

export default function NotificationBell() {
  const nav = useNavigate();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);

  // Badge: how many alerts arrived since the user last opened the bell.
  const refreshBadge = useCallback(async () => {
    try {
      const r = await api.get("/alerts/count", { params: { since: getSeen() || undefined } });
      setTotal(r.data.total || 0);
      setUnread(r.data.unread || 0);
    } catch (_) {}
  }, []);

  useEffect(() => {
    refreshBadge();
    const t = setInterval(refreshBadge, 60000); // keep the badge fresh
    return () => clearInterval(t);
  }, [refreshBadge]);

  const loadPage = useCallback(async (nextSkip) => {
    setLoading(true);
    try {
      const r = await api.get("/alerts", { params: { skip: nextSkip, limit: PAGE } });
      const page = Array.isArray(r.data) ? r.data : [];
      setItems((prev) => (nextSkip === 0 ? page : [...prev, ...page]));
      setSkip(nextSkip);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await Promise.all([loadPage(0), refreshBadge()]);
      markSeen();
      setUnread(0);
    }
  };

  // Close when tapping outside the bell.
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);

  const hasMore = items.length < total;
  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <div ref={wrapRef} className="nk-bell" style={{ position: "relative" }} data-testid="notif-bell">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        data-testid="notif-bell-btn"
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: "var(--text)", display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 12 }}
      >
        <Bell size={21} />
        {unread > 0 && (
          <span
            data-testid="notif-bell-badge"
            style={{ position: "absolute", top: 4, right: 3, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999, background: "#ff3b5c", color: "#fff", fontSize: 10.5, fontWeight: 800, lineHeight: "17px", textAlign: "center", boxShadow: "0 0 0 2px var(--bg)" }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notif-panel"
          style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxWidth: "calc(100vw - 24px)", zIndex: 1000, borderRadius: 16, overflow: "hidden",
            background: "var(--bg-2)", border: "1px solid var(--panel-brd)", boxShadow: "0 24px 60px rgba(0,0,0,.55)" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--panel-brd)" }}>
            <b style={{ fontSize: 15, display: "inline-flex", alignItems: "center", gap: 7 }}><Bell size={16} /> Notifications</b>
            {total > 0 && <span className="muted" style={{ fontSize: 12 }}>{total} total</span>}
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }} data-testid="notif-list">
            {items.length === 0 && !loading ? (
              <div className="center" style={{ padding: "34px 16px" }} data-testid="notif-empty">
                <Bell size={30} color="var(--muted)" />
                <p className="muted" style={{ fontSize: 13.5, margin: "10px 0 0" }}>No notifications yet. When someone scans your QR, it shows up here.</p>
              </div>
            ) : (
              items.map((a) => {
                const m = META[a.type] || { icon: <Bell size={16} />, color: "#ff4d67", label: a.type };
                return (
                  <div key={a.id} data-testid={`notif-item-${a.id}`} style={{ display: "flex", gap: 11, padding: "11px 14px", borderBottom: "1px solid var(--panel-brd)" }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", background: `${m.color}22`, color: m.color }}>{m.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}{a.number_plate ? ` · ${a.number_plate}` : ""}</span>
                        <span className="muted" style={{ fontSize: 11, flexShrink: 0 }}>{fmt(a.created_at)}</span>
                      </div>
                      {a.scanner_note && <p className="muted" style={{ fontSize: 12.5, margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.scanner_note}</p>}
                      <div style={{ display: "flex", gap: 12, marginTop: 5, flexWrap: "wrap" }}>
                        {a.scanner_phone && (
                          <a href={`tel:${a.scanner_phone}`} className="neon" style={{ fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}><Phone size={12} /> {a.scanner_phone}</a>
                        )}
                        {a.scanner_lat != null && a.scanner_lng != null && (
                          <a href={`https://www.openstreetmap.org/?mlat=${a.scanner_lat}&mlon=${a.scanner_lng}#map=17/${a.scanner_lat}/${a.scanner_lng}`} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3 }}><MapPin size={12} /> Map</a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {hasMore && (
              <button
                type="button"
                onClick={() => loadPage(skip + PAGE)}
                disabled={loading}
                data-testid="notif-view-more"
                style={{ width: "100%", padding: "12px 14px", background: "none", border: "none", borderTop: "1px solid var(--panel-brd)", color: "var(--accent)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}
              >
                {loading ? <><Loader2 size={15} className="spin" /> Loading…</> : `View more (${total - items.length} left)`}
              </button>
            )}
            {loading && items.length === 0 && <div className="center" style={{ padding: 24 }}><Loader2 size={18} className="spin" /></div>}
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); nav("/alerts"); }}
            data-testid="notif-view-all"
            style={{ width: "100%", padding: "11px 14px", background: "rgba(233,37,70,.08)", border: "none", borderTop: "1px solid var(--panel-brd)", color: "var(--text)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Open full alert feed
          </button>
        </div>
      )}
    </div>
  );
}
