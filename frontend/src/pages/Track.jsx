import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "@/lib/api";
import { loadLeaflet } from "@/lib/leaflet";
import { ArrowLeft, Navigation, Gauge, PlayCircle, MapPin, Loader2 } from "lucide-react";

const BASE = { lat: 19.0760, lng: 72.8777 }; // Mumbai

export default function Track() {
  const { id } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [track, setTrack] = useState([]);
  const [speedAlerts, setSpeedAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simBusy, setSimBusy] = useState(false);
  const mapEl = useRef(null);
  const mapObj = useRef(null);
  const layer = useRef(null);

  const loadData = useCallback(async () => {
    const [rv, rt, ra] = await Promise.all([
      api.get(`/vehicles/${id}`),
      api.get(`/vehicles/${id}/track?limit=100`),
      api.get(`/alerts`),
    ]);
    setVehicle(rv.data);
    setTrack([...rt.data].reverse()); // chronological
    setSpeedAlerts(ra.data.filter((a) => a.type === "speed_alert" && a.vehicle_id === id));
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // init map once
  useEffect(() => {
    let disposed = false;
    loadLeaflet().then((L) => {
      if (disposed || !mapEl.current || mapObj.current) return;
      const map = L.map(mapEl.current, { zoomControl: true }).setView([BASE.lat, BASE.lng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      mapObj.current = { L, map };
      draw();
    });
    return () => { disposed = true; if (mapObj.current?.map) { mapObj.current.map.remove(); mapObj.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // redraw when track changes
  useEffect(() => { draw(); /* eslint-disable-next-line */ }, [track]);

  const draw = () => {
    if (!mapObj.current) return;
    const { L, map } = mapObj.current;
    if (layer.current) { map.removeLayer(layer.current); layer.current = null; }
    if (!track.length) return;
    const pts = track.map((p) => [p.latitude, p.longitude]);
    const grp = L.layerGroup();
    L.polyline(pts, { color: "#22d3ee", weight: 4, opacity: 0.9 }).addTo(grp);
    // start
    L.circleMarker(pts[0], { radius: 7, color: "#10b981", fillColor: "#10b981", fillOpacity: 1 }).bindPopup("Start").addTo(grp);
    // end (current)
    const last = track[track.length - 1];
    L.circleMarker(pts[pts.length - 1], { radius: 9, color: "#7c3aed", fillColor: "#8b5cf6", fillOpacity: 1 })
      .bindPopup(`Now · ${Math.round(last.speed_kmh)} km/h`).addTo(grp);
    grp.addTo(map);
    layer.current = grp;
    map.fitBounds(L.latLngBounds(pts).pad(0.3));
  };

  const simulate = async () => {
    if (!vehicle) return;
    setSimBusy(true);
    const limit = vehicle.speed_limit_kmh || 80;
    const speeds = [30, 45, 60, limit - 5, limit + 12, limit + 25, limit - 10, 40];
    try {
      for (let i = 0; i < speeds.length; i++) {
        await api.post(`/vehicles/${id}/location`, {
          latitude: BASE.lat + i * 0.0016 + (Math.random() - 0.5) * 0.0004,
          longitude: BASE.lng + i * 0.0021 + (Math.random() - 0.5) * 0.0004,
          speed_kmh: speeds[i],
          heading: 45,
        });
      }
      await loadData();
    } finally { setSimBusy(false); }
  };

  const latest = track[track.length - 1];
  const limit = vehicle?.speed_limit_kmh || 80;

  return (
    <div className="page" data-testid="track-page">
      <div className="container-nk" style={{ maxWidth: 900 }}>
        <Link to={`/vehicle/${id}`} className="nav-link" style={{ display: "inline-flex", marginBottom: 18 }}><ArrowLeft size={16} /> Back to vehicle</Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div>
            <span className="chip"><Navigation size={13} /> Live tracking</span>
            <h1 style={{ fontSize: 32, marginTop: 12 }}>{vehicle?.number_plate || "Vehicle"}</h1>
          </div>
          <button className="btn btn-primary" onClick={simulate} disabled={simBusy} data-testid="simulate-drive-btn">
            {simBusy ? <><Loader2 size={16} className="spin" /> Driving…</> : <><PlayCircle size={17} /> Simulate a drive</>}
          </button>
        </div>

        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <div className="glass card-pad" data-testid="stat-current-speed">
            <div style={{ color: "#22d3ee" }}><Gauge size={20} /></div>
            <div className="stat-num" style={{ color: latest && latest.speed_kmh > limit ? "#ff3b5c" : undefined }}>{latest ? Math.round(latest.speed_kmh) : "—"}<span style={{ fontSize: 14 }} className="muted"> km/h</span></div>
            <div className="muted" style={{ fontSize: 13 }}>Current speed</div>
          </div>
          <div className="glass card-pad">
            <div style={{ color: "#8b5cf6" }}><Gauge size={20} /></div>
            <div className="stat-num">{limit}<span style={{ fontSize: 14 }} className="muted"> km/h</span></div>
            <div className="muted" style={{ fontSize: 13 }}>Speed limit</div>
          </div>
          <div className="glass card-pad">
            <div style={{ color: "#f5a524" }}><MapPin size={20} /></div>
            <div className="stat-num">{track.length}</div>
            <div className="muted" style={{ fontSize: 13 }}>GPS pings</div>
          </div>
        </div>

        <div className="glass" style={{ overflow: "hidden", marginBottom: 16 }}>
          <div ref={mapEl} data-testid="track-map" style={{ height: 380, width: "100%", background: "#0d0d1a" }} />
          {loading && <div className="spinner" />}
          {!loading && track.length === 0 && (
            <p className="center muted" style={{ padding: 20 }} data-testid="track-empty">No GPS pings yet. Tap "Simulate a drive" to see the live trail and speed alerts.</p>
          )}
        </div>

        <div className="glass card-pad" style={{ padding: 22 }}>
          <h3 style={{ fontSize: 19, marginBottom: 10 }}>Speed alerts <span className="muted" style={{ fontSize: 14 }}>({speedAlerts.length})</span></h3>
          {speedAlerts.length === 0 ? (
            <p className="muted" data-testid="no-speed-alerts">No overspeed events recorded.</p>
          ) : (
            speedAlerts.slice(0, 8).map((a) => (
              <div key={a.id} className="alert-row" style={{ padding: "10px 0" }} data-testid={`speed-alert-${a.id}`}>
                <div className="alert-ico" style={{ background: "rgba(245,165,36,.16)", color: "#f5a524" }}><Gauge size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{a.scanner_note || "Overspeed"}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
