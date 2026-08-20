import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import CameraCapture from "@/components/CameraCapture";
import InAppCall from "@/components/InAppCall";
import { Car, ParkingCircle, Siren, ShieldAlert, Phone, BellRing, CheckCircle2, Clock, MapPin, Loader2, ArrowLeft, Camera, ImagePlus, X, Ban, Lightbulb, DoorOpen, AlertTriangle, MessageSquare } from "lucide-react";

const geo = (setC) => {
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setC({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 6000 });
};

// Masked-call routing is paused for now. The scan flow currently only alerts the
// owner. The call feature (web/portal -> owner via Vobiz, and later the internal
// web<->mobile-app call) is kept in code and can be re-enabled by flipping this flag.
const CALL_ENABLED = false;

const WINDOW_TYPES = ["wrong_parking", "vehicle_blocking"];
const REASONS = [
  { key: "wrong_parking", label: "Wrong Parking", icon: <ParkingCircle size={26} />, grad: "linear-gradient(100deg,#f59e0b,#f5a524)", desc: "Alert the owner to move their vehicle. A 15-minute window starts once you alert them." },
  { key: "vehicle_blocking", label: "Vehicle Blocking", icon: <Ban size={26} />, grad: "linear-gradient(100deg,#f97316,#fb923c)", desc: "This vehicle is blocking the way. Ask the owner to move it — a 15-minute window starts." },
  { key: "headlight_on", label: "Headlight ON", icon: <Lightbulb size={26} />, grad: "linear-gradient(100deg,#ca8a04,#eab308)", desc: "The headlights are left ON. Let the owner know before the battery drains." },
  { key: "door_open", label: "Door / Window Open", icon: <DoorOpen size={26} />, grad: "linear-gradient(100deg,#0891b2,#22d3ee)", desc: "A door or window is left open. Notify the owner to secure the vehicle." },
  { key: "emergency", label: "Emergency", icon: <Siren size={26} />, grad: "linear-gradient(100deg,#e11d48,#ff3b5c)", urgent: true, photoOptional: true, desc: "Urgent! Notify the owner & family immediately." },
  { key: "vehicle_damage", label: "Vehicle Damage", icon: <AlertTriangle size={26} />, grad: "linear-gradient(100deg,#dc2626,#f97316)", desc: "The vehicle appears damaged. Report it to the owner with a photo." },
  { key: "other", label: "Other", icon: <MessageSquare size={26} />, grad: "linear-gradient(100deg,#7c3aed,#8b5cf6)", desc: "Something else about this vehicle — leave a note for the owner." },
  { key: "theft", label: "Theft / Suspicious", icon: <ShieldAlert size={26} />, grad: "linear-gradient(100deg,#6d28d9,#8b5cf6)", desc: "Report suspicious activity or theft. The owner & family are alerted immediately." },
];

export default function PublicScan() {
  const { qrId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [screen, setScreen] = useState("choose"); // choose | wrong_parking | accident | theft | waiting
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [coords, setCoords] = useState(null);
  const [incident, setIncident] = useState(null);
  const [busy, setBusy] = useState(false);
  const [call, setCall] = useState(null);
  const [carPhoto, setCarPhoto] = useState(null);
  const [selfiePhoto, setSelfiePhoto] = useState(null);
  const [showCam, setShowCam] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const poll = useRef(null);

  useEffect(() => {
    api.get(`/public/qr/${qrId}`).then((r) => setVehicle(r.data)).catch(() => setNotFound(true)).finally(() => setLoading(false));
    geo(setCoords);
    const existing = searchParams.get("incident");
    if (existing) {
      api.get(`/public/incident/${existing}`).then((r) => {
        setIncident(r.data);
        setScreen("waiting");
        startPolling(existing);
      }).catch(() => {});
    }
    return () => { if (poll.current) clearInterval(poll.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrId]);

  const startPolling = (id) => {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try { setIncident((await api.get(`/public/incident/${id}`)).data); } catch { /* noop */ }
    }, 5000);
  };

  const createIncident = async (type) => {
    setBusy(true);
    try {
      const r = await api.post(`/public/qr/${qrId}/incident`, {
        type, scanner_note: note || null, scanner_phone: phone || null,
        scanner_lat: coords?.lat ?? null, scanner_lng: coords?.lng ?? null,
        evidence_photo_base64: carPhoto || null, reporter_photo_base64: selfiePhoto || null,
      });
      setIncident(r.data);
      setScreen("waiting");
      setSearchParams({ incident: r.data.id }, { replace: true });
      startPolling(r.data.id);
    } catch (e) { alert(e?.response?.data?.detail || "Could not send"); } finally { setBusy(false); }
  };

  const goChoose = () => { setScreen("choose"); setCarPhoto(null); setSelfiePhoto(null); };

  const doCall = async () => {
    if (!incident) return;
    setBusy(true);
    try { setCall((await api.post(`/public/incident/${incident.id}/call`, { scanner_phone: phone || null })).data); }
    catch (e) { alert(e?.response?.data?.detail || "Call failed"); } finally { setBusy(false); }
  };

  const dialValid = phone.replace(/\D/g, "").length >= 10;
  const dialPad = () => (
    <>
      <div className="dial-display" data-testid="dial-display">{phone || <span style={{ opacity: 0.4 }}>Enter your mobile number</span>}</div>
      <div className="dial-grid">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "back"].map((k) => (
          <button
            key={k}
            className="dial-key"
            data-testid={`dial-key-${k}`}
            onClick={() => setPhone((p) => (k === "back" ? p.slice(0, -1) : (p + k).slice(0, 15)))}
          >
            {k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>
    </>
  );

  if (loading) return <div className="page"><div className="spinner" /></div>;
  if (notFound) return (
    <div className="page container-nk center"><div className="glass card-pad" style={{ maxWidth: 460, margin: "40px auto", padding: 40 }} data-testid="scan-not-found">
      <h1 style={{ fontSize: 28 }}>QR not found</h1><p className="muted">This sticker is not registered or the vehicle was removed.</p>
    </div></div>
  );

  const Header = () => (
    <div className="glass card-pad" style={{ padding: 22, marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div className="brand-badge" style={{ width: 50, height: 50, borderRadius: 14 }}><Car size={24} /></div>
        <div><div className="chip" data-testid="scan-plate">{vehicle.number_plate}</div>
          <p className="muted" style={{ marginTop: 6, fontSize: 13, textTransform: "capitalize" }}>{vehicle.vehicle_type}{vehicle.make_model ? ` · ${vehicle.make_model}` : ""}</p></div>
      </div>
      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {coords ? "Location ready" : "Location optional"} · Owner's number stays private</p>
    </div>
  );

  const photoBlock = (required) => (
    <div className="glass card-pad" style={{ padding: 18, marginTop: 14 }} data-testid="scan-photo-block">
      <label style={{ display: "block", marginBottom: 10, fontSize: 14, fontWeight: 700 }}>Add a photo of the vehicle {required && <span style={{ color: "#ff3b5c" }}>*</span>}</label>
      {carPhoto ? (
        <div className="photo-thumb" data-testid="scan-photo-preview">
          <img src={carPhoto} alt="Vehicle evidence" />
          <button className="cam-x" style={{ position: "absolute", top: 8, right: 8 }} onClick={() => { setCarPhoto(null); setSelfiePhoto(null); }} data-testid="scan-photo-remove"><X size={18} /></button>
        </div>
      ) : (
        <button className="btn btn-ghost btn-block" onClick={() => setShowCam(true)} data-testid="scan-photo-add" style={{ padding: 16, borderColor: required ? "rgba(255,59,92,.5)" : undefined }}>
          <Camera size={18} /> {required ? "Take a photo (required)" : "Take a photo (optional)"}
        </button>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}><ImagePlus size={12} style={{ verticalAlign: "-2px" }} /> {required ? "A photo is required to send this alert — stronger proof for the owner." : "A clear photo helps the owner act faster."}</p>
    </div>
  );

  return (
    <div className="page" data-testid="public-scan-page">
      <div className="container-nk" style={{ maxWidth: 540 }}>
        <Header />

        {screen === "choose" && (
          <div data-testid="scan-choose">
            <h2 className="center" style={{ fontSize: 24, marginBottom: 16 }}>How can we help?</h2>
            <div className="grid" style={{ gap: 12 }}>
              {REASONS.map((r) => (
                <button key={r.key} className="big-action" style={{ background: r.grad }} onClick={() => setScreen(r.key)} data-testid={`choose-${r.key}`}>
                  {r.icon} {r.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {(() => {
          const r = REASONS.find((x) => x.key === screen);
          if (!r) return null;
          const windowed = WINDOW_TYPES.includes(r.key);
          return (
            <div data-testid={`scan-${r.key}`}>
              <button className="nav-link" style={{ display: "inline-flex", marginBottom: 8 }} onClick={goChoose}><ArrowLeft size={15} /> Back</button>
              {r.urgent ? (
                <div className="glass card-pad center" style={{ padding: 26, borderColor: "rgba(255,59,92,.5)" }}>
                  <Siren size={48} color="#ff3b5c" />
                  <h2 style={{ fontSize: 26, margin: "12px 0 6px", color: "#ff3b5c" }}>{r.label}</h2>
                  <p className="muted">{r.desc}</p>
                </div>
              ) : (
                <>
                  <h2 style={{ fontSize: 22, marginBottom: 6 }}>{r.label}</h2>
                  <p className="muted" style={{ marginBottom: 4 }}>{r.desc}</p>
                </>
              )}
              {photoBlock(true)}
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                <button className="big-action" style={{ background: r.grad, opacity: !carPhoto ? 0.55 : 1 }} disabled={busy || !carPhoto} onClick={() => createIncident(r.key)} data-testid={`alert-${r.key}-btn`}>
                  {busy ? <Loader2 size={24} className="spin" /> : (r.urgent ? <Siren size={26} /> : <BellRing size={26} />)}
                  {r.urgent ? " Send emergency alert" : windowed ? " Alert owner (15-min)" : " Alert owner"}
                </button>
                <button className="big-action" style={{ background: "linear-gradient(100deg,#0891b2,#22d3ee)" }} onClick={() => setShowCall(true)} data-testid={`call-${r.key}-btn`}>
                  <Phone size={24} /> Call owner (live)
                </button>
              </div>
              {!carPhoto && <p className="center muted" style={{ fontSize: 12, marginTop: 8 }}>Take a photo to alert the owner — you can call any time.</p>}
            </div>
          );
        })()}

        {screen === "waiting" && incident && (
          <div data-testid="scan-waiting">
            {incident.owner_response === "coming" ? (
              <div className="glass card-pad center" style={{ padding: 34, borderColor: "rgba(34,211,238,.5)" }} data-testid="owner-coming">
                <CheckCircle2 size={56} color="#22d3ee" />
                <h2 style={{ fontSize: 24, margin: "12px 0 8px" }}>Owner is coming!</h2>
                <p className="muted">The vehicle owner has been notified and is coming within 15 minutes. Please wait.</p>
              </div>
            ) : incident.status === "resolved" ? (
              <div className="glass card-pad center" style={{ padding: 34 }} data-testid="incident-resolved">
                <CheckCircle2 size={56} color="#22d3ee" /><h2 style={{ fontSize: 24, marginTop: 12 }}>Resolved</h2>
                <p className="muted">The owner marked this issue as resolved. Thank you!</p>
              </div>
            ) : (
              <div className="glass card-pad center" style={{ padding: 30 }} data-testid="alert-sent">
                <BellRing size={48} color="#f5a524" />
                <h2 style={{ fontSize: 23, margin: "12px 0 6px" }}>Owner alerted</h2>
                <p className="muted">
                  {WINDOW_TYPES.includes(incident.type)
                    ? "We've notified the owner & family. Waiting for them to respond…"
                    : "The owner & family have been notified."}
                </p>
                {WINDOW_TYPES.includes(incident.type) && (
                  <div className="chip" style={{ marginTop: 14 }}><Clock size={13} /> {incident.minutes_left} min window · {incident.status === "no_response" ? "No response yet" : "Alert sent"}</div>
                )}
              </div>
            )}

            {incident.status !== "resolved" && (
              <button className="big-action" style={{ background: "linear-gradient(100deg,#0891b2,#22d3ee)", marginTop: 14 }} onClick={() => setShowCall(true)} data-testid="waiting-call-owner-btn">
                <Phone size={24} /> Call owner now (live, private)
              </button>
            )}

            {CALL_ENABLED && (call ? (
              <div className="glass card-pad center" style={{ padding: 24, marginTop: 14 }} data-testid="call-connecting">
                {call.status === "calling" ? (
                  <>
                    <Phone size={40} color="#22d3ee" />
                    <h3 style={{ fontSize: 20, margin: "10px 0 6px" }}>Calling you now…</h3>
                    <p className="muted" style={{ fontSize: 14 }}>{call.note}</p>
                  </>
                ) : call.status === "need_phone" ? (
                  <>
                    <Phone size={40} color="#f5a524" />
                    <h3 style={{ fontSize: 19, margin: "10px 0 6px" }}>Enter your number</h3>
                    <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>We'll call you and connect you privately to the owner.</p>
                    {dialPad()}
                    <button className="btn btn-primary btn-block" disabled={busy || !dialValid} onClick={doCall} data-testid="call-retry-btn" style={{ marginTop: 12 }}><Phone size={15} /> Connect me</button>
                  </>
                ) : (
                  <>
                    <Phone size={40} color="#22d3ee" />
                    <h3 style={{ fontSize: 20, margin: "10px 0 6px" }}>Connect privately</h3>
                    <p className="muted" style={{ fontSize: 14 }}>{call.note}</p>
                    <a href={`tel:${(call.portal_number || "").replace(/\s/g, "")}`} className="btn btn-primary" style={{ marginTop: 12 }} data-testid="dial-portal"><Phone size={16} /> Dial Nek Sathi portal</a>
                  </>
                )}
              </div>
            ) : (
              (incident.status !== "resolved") && (
                <div className="glass card-pad" style={{ padding: 22, marginTop: 14 }} data-testid="call-dialpad">
                  <h3 style={{ fontSize: 18, marginBottom: 4, textAlign: "center" }}>Call the owner — privately</h3>
                  <p className="muted" style={{ fontSize: 12, textAlign: "center", marginBottom: 12 }}>Enter your number. We'll ring you and connect you to the owner & family. Your number stays hidden.</p>
                  {dialPad()}
                  <button className="btn btn-danger btn-block" style={{ marginTop: 14 }} disabled={busy || !dialValid} onClick={doCall} data-testid="call-owner-btn">
                    <Phone size={18} /> {busy ? "Connecting…" : "Call owner (private)"}
                  </button>
                </div>
              )
            ))}
          </div>
        )}

        <p className="center muted" style={{ marginTop: 26, fontSize: 12 }}>Powered by Nek Sathi · No owner personal data is exposed.</p>
      </div>
      {showCam && (
        <CameraCapture
          onDone={({ car, selfie }) => { if (car) setCarPhoto(car); if (selfie) setSelfiePhoto(selfie); setShowCam(false); }}
          onCancel={() => setShowCam(false)}
        />
      )}
      {showCall && <InAppCall qrId={qrId} onClose={() => setShowCall(false)} />}
    </div>
  );
}
