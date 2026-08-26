import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Users, CheckCircle2, LogIn, Car } from "lucide-react";

export default function Invite() {
  const { token } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error | accepted
  const [errMsg, setErrMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/invites/${token}`)
      .then((r) => { setPreview(r.data); setState("ready"); })
      .catch((e) => { setErrMsg(e?.response?.data?.detail || "Invite not found or expired"); setState("error"); });
  }, [token]);

  const accept = async () => {
    if (!user) { nav(`/login?next=${encodeURIComponent(`/invite/${token}`)}`); return; }
    setBusy(true);
    try {
      await api.post(`/invites/${token}/accept`);
      setState("accepted");
    } catch (e) {
      setErrMsg(e?.response?.data?.detail || "Could not accept invite");
      setState("error");
    } finally { setBusy(false); }
  };

  return (
    <div className="page" data-testid="invite-page">
      <div className="container-nk" style={{ maxWidth: 460 }}>
        <div className="glass card-pad center fade-up" style={{ padding: 40, marginTop: 20 }}>
          {state === "loading" && <div className="spinner" />}

          {state === "error" && (
            <div data-testid="invite-error">
              <h1 style={{ fontSize: 26 }}>Invite unavailable</h1>
              <p className="muted" style={{ marginTop: 8 }}>{errMsg}</p>
              <Link to="/dashboard" className="btn btn-ghost" style={{ marginTop: 18 }}>Go to dashboard</Link>
            </div>
          )}

          {state === "ready" && preview && (
            <div data-testid="invite-ready">
              <div className="brand-badge" style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto" }}><Users size={26} /></div>
              <h1 style={{ fontSize: 26, marginTop: 16 }}>Family invite</h1>
              <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>
                <b style={{ color: "#fff" }}>{preview.invited_by_name}</b> invited you to follow vehicle
              </p>
              <div className="chip" style={{ marginTop: 12, fontSize: 15, padding: "8px 16px" }}><Car size={14} /> {preview.vehicle_number_plate}</div>
              <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>You'll be able to see this vehicle's safety alerts in your feed.</p>
              <button className="btn btn-primary btn-block" style={{ marginTop: 22 }} onClick={accept} disabled={busy} data-testid="accept-invite-btn">
                {user ? <><CheckCircle2 size={17} /> {busy ? "Accepting…" : "Accept invite"}</> : <><LogIn size={17} /> Log in to accept</>}
              </button>
            </div>
          )}

          {state === "accepted" && (
            <div data-testid="invite-accepted">
              <CheckCircle2 size={60} color="#22d3ee" />
              <h1 style={{ fontSize: 28, marginTop: 14 }}>You're in! 🎉</h1>
              <p className="muted" style={{ marginTop: 8 }}>You now receive alerts for <b style={{ color: "#fff" }}>{preview?.vehicle_number_plate}</b>.</p>
              <Link to="/alerts" className="btn btn-primary" style={{ marginTop: 20 }}>View alerts</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
