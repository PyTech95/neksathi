import { useEffect, useState } from "react";
import { Siren, Ambulance, MapPin } from "lucide-react";
import api from "@/lib/api";

// The three emergency actions shown on every SOS card (family banner, Family
// page, and the sender's own Safety page): Call Police, Call Ambulance, See
// location — one per line, big enough to hit in a panic.
//
// Android does not let a third-party app auto-dial an emergency number, so
// `tel:` opens the dialer with the number filled in; the user taps the green
// button. Numbers come from GET /public/emergency-numbers (admin-configurable,
// defaults 112 / 108) and are cached for the session.

let cached = null;
let inflight = null;
export async function getEmergencyNumbers() {
  if (cached) return cached;
  if (!inflight) {
    inflight = api.get("/public/emergency-numbers").then((r) => {
      cached = { police: r.data?.police || "112", ambulance: r.data?.ambulance || "108" };
      return cached;
    }).catch(() => ({ police: "112", ambulance: "108" }));
  }
  return inflight;
}

export function useEmergencyNumbers() {
  const [n, setN] = useState(cached || { police: "112", ambulance: "108" });
  useEffect(() => { let m = true; getEmergencyNumbers().then((v) => m && setN(v)); return () => { m = false; }; }, []);
  return n;
}

const rowStyle = {
  display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", borderRadius: 12,
  fontWeight: 800, fontSize: 15, textDecoration: "none", color: "#fff", border: "none", cursor: "pointer",
};

export default function SosActions({ sos, compact = false, testPrefix = "sos" }) {
  const n = useEmergencyNumbers();
  const hasLoc = sos && sos.latitude != null && sos.longitude != null;
  const mapHref = hasLoc ? `https://maps.google.com/?q=${sos.latitude},${sos.longitude}` : null;
  const pad = compact ? "10px 12px" : rowStyle.padding;
  return (
    <div style={{ display: "grid", gap: 8, width: "100%" }} data-testid={`${testPrefix}-actions`}>
      <a href={`tel:${n.police}`} style={{ ...rowStyle, padding: pad, background: "linear-gradient(100deg,#1d4ed8,#2563eb)" }} data-testid={`${testPrefix}-call-police`}>
        <Siren size={20} /> <span style={{ flex: 1 }}>Call Police</span><span style={{ opacity: .9, fontWeight: 700 }}>{n.police}</span>
      </a>
      <a href={`tel:${n.ambulance}`} style={{ ...rowStyle, padding: pad, background: "linear-gradient(100deg,#b91c1c,#dc2626)" }} data-testid={`${testPrefix}-call-ambulance`}>
        <Ambulance size={20} /> <span style={{ flex: 1 }}>Call Ambulance</span><span style={{ opacity: .9, fontWeight: 700 }}>{n.ambulance}</span>
      </a>
      {mapHref ? (
        <a href={mapHref} target="_blank" rel="noreferrer" style={{ ...rowStyle, padding: pad, background: "linear-gradient(100deg,#047857,#059669)" }} data-testid={`${testPrefix}-location`}>
          <MapPin size={20} /> <span style={{ flex: 1 }}>See location</span><span style={{ opacity: .9, fontWeight: 600, fontSize: 12.5 }}>Google Maps</span>
        </a>
      ) : (
        <div style={{ ...rowStyle, padding: pad, background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.6)", cursor: "default" }} data-testid={`${testPrefix}-location-none`}>
          <MapPin size={20} /> <span style={{ flex: 1 }}>Location not shared</span>
        </div>
      )}
    </div>
  );
}
