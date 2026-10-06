import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { API } from "@/lib/api";
import { loadLeaflet } from "@/lib/leaflet";
import { MapPin, Loader2, ShieldAlert, RadioTower } from "lucide-react";

export default function LiveView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapEl = useRef(null);
  const mapObj = useRef(null);
  const marker = useRef(null);

  const fetchData = async () => {
    try {
      const r = await fetch(`${API}/public/live/${token}`);
      if (!r.ok) { setData({ error: r.status === 404 ? "This live-location link is invalid." : "Could not load location." }); return; }
      setData(await r.json());
    } catch (_) { setData({ error: "Network error." }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!data?.last) return;
    loadLeaflet().then((L) => {
      if (!mapEl.current) return;
      const { latitude, longitude } = data.last;
      if (!mapObj.current) {
        const map = L.map(mapEl.current, { zoomControl: true }).setView([latitude, longitude], 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
        marker.current = L.circleMarker([latitude, longitude], { radius: 10, color: "#22d3ee", fillColor: "#7c3aed", fillOpacity: 0.9, weight: 3 }).addTo(map);
        mapObj.current = map;
      } else {
        marker.current.setLatLng([latitude, longitude]);
        mapObj.current.panTo([latitude, longitude]);
      }
    });
  }, [data]);

  return (
    <div className="page" data-testid="live-view-page" style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <RadioTower size={22} className="neon" />
        <h1 style={{ margin: 0, fontSize: 24 }}>Live Location</h1>
      </div>

      {loading ? (
        <div className="spinner" data-testid="live-loading" />
      ) : data?.error ? (
        <div className="glass" style={{ padding: 24, borderRadius: 16, textAlign: "center", color: "#ff7591" }} data-testid="live-error">
          <ShieldAlert size={30} style={{ marginBottom: 8 }} /><div>{data.error}</div>
        </div>
      ) : !data.active ? (
        <div className="glass" style={{ padding: 24, borderRadius: 16, textAlign: "center" }} data-testid="live-ended">
          <MapPin size={30} style={{ marginBottom: 8, color: "#9a9ab5" }} />
          <div style={{ fontWeight: 700 }}>{data.expired ? "This live-location share has expired." : "This share is no longer active."}</div>
          <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>Ask {data.name} to start sharing again.</p>
        </div>
      ) : (
        <>
          <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }} data-testid="live-status">
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 0 4px rgba(52,211,153,.25)" }} />
            <div>
              <div style={{ fontWeight: 700 }}>{data.name} is sharing live location{data.label ? ` · ${data.label}` : ""}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{data.last ? `Last updated ${new Date(data.last.recorded_at).toLocaleTimeString()}` : "Waiting for first location…"}</div>
            </div>
          </div>
          {data.last ? (
            <div ref={mapEl} data-testid="live-map" style={{ height: 460, borderRadius: 16, overflow: "hidden", border: "1px solid var(--panel-brd)" }} />
          ) : (
            <div className="glass" style={{ padding: 40, borderRadius: 16, textAlign: "center" }} data-testid="live-waiting">
              <Loader2 className="spin" size={26} />
              <p className="muted" style={{ marginTop: 10 }}>Waiting for {data.name}'s device to report a location…</p>
            </div>
          )}
          {data.last && (
            <a className="btn btn-ghost btn-block" style={{ marginTop: 12 }} href={`https://maps.google.com/?q=${data.last.latitude},${data.last.longitude}`} target="_blank" rel="noreferrer" data-testid="live-open-maps">
              <MapPin size={16} /> Open in Google Maps
            </a>
          )}
        </>
      )}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
