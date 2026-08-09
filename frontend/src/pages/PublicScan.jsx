import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Car, ParkingCircle, Siren, ShieldAlert, Phone, BellRing, CheckCircle2, Clock, MapPin, Loader2, ArrowLeft } from "lucide-react";

const geo = (setC) => {
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setC({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 6000 });
};

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
      });
      setIncident(r.data);
      setScreen("waiting");
      setSearchParams({ incident: r.data.id }, { replace: true });
      startPolling(r.data.id);
    } catch (e) { alert(e?.response?.data?.detail || "Could not send"); } finally { setBusy(false); }
  };

  const doCall = async () => {
    if (!incident) return;
    setBusy(true);
    try { setCall((await api.post(`/public/incident/${incident.id}/call`, { scanner_phone: phone || null })).data); }
    catch (e) { alert(e?.response?.data?.detail || "Call failed"); } finally { setBusy(false); }
  };

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

  const NoteFields = () => (
    <div className="glass card-pad" style={{ padding: 18, marginTop: 14 }}>
      <div className="field"><label>Note (optional)</label><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="scan-note" placeholder="e.g. Blocking the exit gate" /></div>
      <div className="field" style={{ marginBottom: 0 }}><label>Your callback number (optional)</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="scan-phone" placeholder="+91 …" /></div>
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
              <button className="big-action" style={{ background: "linear-gradient(100deg,#f59e0b,#f5a524)" }} onClick={() => setScreen("wrong_parking")} data-testid="choose-wrong_parking"><ParkingCircle size={28} /> Wrong Parking</button>
              <button className="big-action" style={{ background: "linear-gradient(100deg,#e11d48,#ff3b5c)" }} onClick={() => { setScreen("accident"); }} data-testid="choose-accident"><Siren size={28} /> Accident</button>
              <button className="big-action" style={{ background: "linear-gradient(100deg,#7c3aed,#8b5cf6)" }} onClick={() => setScreen("theft")} data-testid="choose-theft"><ShieldAlert size={28} /> Theft / Suspicious</button>
            </div>
          </div>
        )}

        {screen === "wrong_parking" && (
          <div data-testid="scan-wrong-parking">
            <button className="nav-link" style={{ display: "inline-flex", marginBottom: 8 }} onClick={() => setScreen("choose")}><ArrowLeft size={15} /> Back</button>
            <h2 style={{ fontSize: 22, marginBottom: 6 }}>Wrong parking</h2>
            <p className="muted" style={{ marginBottom: 4 }}>Alert the owner to move their vehicle. A 15-minute window starts once you alert them.</p>
            <NoteFields />
            <button className="big-action" style={{ background: "linear-gradient(100deg,#f59e0b,#f5a524)", marginTop: 14 }} disabled={busy} onClick={() => createIncident("wrong_parking")} data-testid="alert-owner-btn">
              {busy ? <Loader2 size={24} className="spin" /> : <BellRing size={26} />} Alarm / Alert Owner
            </button>
          </div>
        )}

        {screen === "accident" && (
          <div data-testid="scan-accident">
            <button className="nav-link" style={{ display: "inline-flex", marginBottom: 8 }} onClick={() => setScreen("choose")}><ArrowLeft size={15} /> Back</button>
            <div className="glass card-pad center" style={{ padding: 26, borderColor: "rgba(255,59,92,.5)" }}>
              <Siren size={48} color="#ff3b5c" />
              <h2 style={{ fontSize: 26, margin: "12px 0 6px", color: "#ff3b5c" }}>Accident Alert</h2>
              <p className="muted">Notify the owner & family immediately, then connect a private call.</p>
            </div>
            {!incident ? (
              <button className="big-action" style={{ background: "linear-gradient(100deg,#e11d48,#ff3b5c)", marginTop: 14 }} disabled={busy} onClick={() => createIncident("accident")} data-testid="accident-alert-btn">
                {busy ? <Loader2 size={24} className="spin" /> : <Siren size={26} />} Send accident alert
              </button>
            ) : null}
          </div>
        )}

        {screen === "theft" && (
          <div data-testid="scan-theft">
            <button className="nav-link" style={{ display: "inline-flex", marginBottom: 8 }} onClick={() => setScreen("choose")}><ArrowLeft size={15} /> Back</button>
            <div className="glass card-pad" style={{ padding: 22 }}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>Theft / suspicious activity</h2>
              <p className="muted">Confirm to alert the owner & family. You can then place a private call.</p>
            </div>
            <NoteFields />
            <button className="big-action" style={{ background: "linear-gradient(100deg,#7c3aed,#8b5cf6)", marginTop: 14 }} disabled={busy} onClick={() => createIncident("theft")} data-testid="theft-alert-btn">
              {busy ? <Loader2 size={24} className="spin" /> : <ShieldAlert size={26} />} Confirm & alert owner
            </button>
          </div>
        )}

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
                  {incident.type === "wrong_parking"
                    ? "We've notified the owner & family. Waiting for them to respond…"
                    : "The owner & family have been notified."}
                </p>
                {incident.type === "wrong_parking" && (
                  <div className="chip" style={{ marginTop: 14 }}><Clock size={13} /> {incident.minutes_left} min window · {incident.status === "no_response" ? "No response yet" : "Alert sent"}</div>
                )}
              </div>
            )}

            {call ? (
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
                    <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{call.note}</p>
                    <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" data-testid="call-phone-input" style={{ maxWidth: 240, margin: "0 auto 10px" }} />
                    <button className="btn btn-primary" disabled={busy || !phone} onClick={doCall} data-testid="call-retry-btn"><Phone size={15} /> Connect me</button>
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
                <button className="btn btn-danger btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={doCall} data-testid="call-owner-btn">
                  <Phone size={18} /> {busy ? "Connecting…" : "Call owner (private)"}
                </button>
              )
            )}
            <p className="center muted" style={{ marginTop: 18, fontSize: 12 }}>Your call is routed through Nek Sathi — the owner's number is never shown.</p>
          </div>
        )}

        <p className="center muted" style={{ marginTop: 26, fontSize: 12 }}>Powered by Nek Sathi · No owner personal data is exposed.</p>
      </div>
    </div>
  );
}
