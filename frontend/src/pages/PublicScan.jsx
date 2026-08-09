import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { Car, Siren, ParkingCircle, Lock, Flame, Truck, CheckCircle2, MapPin } from "lucide-react";

const ACTIONS = [
  { type: "emergency", label: "Emergency", icon: <Siren size={30} />, bg: "linear-gradient(100deg,#e11d48,#ff3b5c)" },
  { type: "wrong_parking", label: "Wrong Parking", icon: <ParkingCircle size={30} />, bg: "linear-gradient(100deg,#f59e0b,#f5a524)" },
  { type: "theft", label: "Theft", icon: <Lock size={30} />, bg: "linear-gradient(100deg,#7c3aed,#8b5cf6)" },
  { type: "fire", label: "Fire", icon: <Flame size={30} />, bg: "linear-gradient(100deg,#ea580c,#f97316)" },
  { type: "towing", label: "Being Towed", icon: <Truck size={30} />, bg: "linear-gradient(100deg,#0891b2,#22d3ee)" },
];

export default function PublicScan() {
  const { qrId } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    api.get(`/public/qr/${qrId}`)
      .then((r) => setVehicle(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { timeout: 6000 }
      );
    }
  }, [qrId]);

  const sendAlert = async (type) => {
    setBusy(true);
    try {
      await api.post(`/public/qr/${qrId}/alert`, {
        type,
        scanner_note: note || null,
        scanner_phone: phone || null,
        scanner_lat: coords?.lat ?? null,
        scanner_lng: coords?.lng ?? null,
      });
      setSent(type);
    } catch (e) {
      alert(e?.response?.data?.detail || "Could not send alert");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (notFound) return (
    <div className="page container-nk center" data-testid="scan-not-found">
      <div className="glass card-pad" style={{ maxWidth: 460, margin: "40px auto", padding: 40 }}>
        <h1 style={{ fontSize: 28 }}>QR not found</h1>
        <p className="muted">This sticker is not registered or the vehicle was removed.</p>
      </div>
    </div>
  );

  if (sent) return (
    <div className="page container-nk center" data-testid="scan-success">
      <div className="glass card-pad" style={{ maxWidth: 460, margin: "40px auto", padding: 44 }}>
        <CheckCircle2 size={64} color="#22d3ee" />
        <h1 style={{ fontSize: 30, margin: "16px 0 8px" }}>Alert sent!</h1>
        <p className="muted" style={{ fontSize: 16 }}>
          The owner of <b style={{ color: "#fff" }}>{vehicle.number_plate}</b> has been notified{coords ? " with your location" : ""}. Thank you for being a Nek Saathi. 🙏
        </p>
      </div>
    </div>
  );

  return (
    <div className="page" data-testid="public-scan-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <div className="glass card-pad" style={{ padding: 26, marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div className="brand-badge" style={{ width: 52, height: 52, borderRadius: 14 }}><Car size={26} /></div>
            <div>
              <div className="chip" data-testid="scan-plate">{vehicle.number_plate}</div>
              <p className="muted" style={{ marginTop: 6, fontSize: 14, textTransform: "capitalize" }}>
                {vehicle.vehicle_type}{vehicle.make_model ? ` · ${vehicle.make_model}` : ""}{vehicle.color ? ` · ${vehicle.color}` : ""}
              </p>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 16, fontSize: 15, lineHeight: 1.5 }}>
            You're helping <b style={{ color: "#fff" }}>{vehicle.owner_first_name}</b>. Tap an alert below — their phone number stays private, they'll be notified instantly.
          </p>
          <div style={{ marginTop: 10, fontSize: 13 }} className="muted" data-testid="geo-status">
            <MapPin size={13} style={{ verticalAlign: "-2px" }} /> {coords ? "Location ready to attach" : "Location unavailable (optional)"}
          </div>
        </div>

        <div className="grid" style={{ gap: 12, marginBottom: 22 }}>
          {ACTIONS.map((a) => (
            <button key={a.type} className="big-action" style={{ background: a.bg }} disabled={busy} onClick={() => sendAlert(a.type)} data-testid={`alert-${a.type}`}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>

        <div className="glass card-pad" style={{ padding: 22 }}>
          <div className="field">
            <label>Add a note (optional)</label>
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Blocking the gate near Sector 5" data-testid="scan-note" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Your callback number (optional)</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" data-testid="scan-phone" />
          </div>
        </div>
        <p className="center muted" style={{ marginTop: 26, fontSize: 12 }}>Powered by Nek Saathi · No personal data of the owner is shown.</p>
      </div>
    </div>
  );
}
