import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Car, Plus, Trash2, ShieldAlert, ChevronRight, ChevronDown, X, Phone, PhoneMissed, PhoneOff, PhoneOutgoing, Bike, Tractor, Truck, CircleHelp, Check } from "lucide-react";
import BottomSheet from "@/components/BottomSheet";

const VEHICLE_TYPES = ["car", "bike", "tractor", "commercial", "other"];
const VEHICLE_TYPE_META = {
  car: { label: "Car", icon: Car },
  bike: { label: "Bike / Two-wheeler", icon: Bike },
  tractor: { label: "Tractor", icon: Tractor },
  commercial: { label: "Commercial / Truck", icon: Truck },
  other: { label: "Other", icon: CircleHelp },
};

function timeAgo(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const CALL_STATUS = {
  missed: { label: "Missed", color: "#ff3b5c", icon: <PhoneMissed size={16} /> },
  rejected: { label: "Declined", color: "#f5a524", icon: <PhoneOff size={16} /> },
  ended: { label: "Answered", color: "#34d399", icon: <PhoneOutgoing size={16} /> },
  accepted: { label: "Answered", color: "#34d399", icon: <Phone size={16} /> },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [shared, setShared] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ number_plate: "", vehicle_type: "car", make_model: "", color: "", speed_limit_kmh: 80 });
  const [typePicker, setTypePicker] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [rv, rs, rc] = await Promise.all([api.get("/vehicles"), api.get("/shared-vehicles"), api.get("/me/calls/recent")]);
      setVehicles(rv.data);
      setShared(rs.data);
      setCalls(rc.data.items || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const addVehicle = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.post("/vehicles", { ...form, speed_limit_kmh: Number(form.speed_limit_kmh) });
      setShowAdd(false);
      setForm({ number_plate: "", vehicle_type: "car", make_model: "", color: "", speed_limit_kmh: 80 });
      load();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Could not add vehicle");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this vehicle and all its data?")) return;
    await api.delete(`/vehicles/${id}`);
    load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page" data-testid="dashboard-page">
      <div className="container-nk">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 26, flexWrap: "wrap", gap: 12 }}>
          <div>
            <span className="chip">Owner dashboard</span>
            <h1 style={{ fontSize: 34, marginTop: 12 }}>Hi {user?.name?.split(" ")[0]}, your <span className="neon">garage</span></h1>
            <p className="muted">Manage vehicles and their safety QR stickers.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} data-testid="add-vehicle-btn"><Plus size={18} /> Add vehicle</button>
        </div>

        {user && !user.phone_verified && (
          <Link to="/settings" data-testid="dashboard-verify-banner" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="glass card-pad glass-hover" style={{ padding: 14, marginBottom: 20, borderColor: "rgba(245,165,36,.5)", display: "flex", alignItems: "center", gap: 12 }}>
              <ShieldAlert size={20} style={{ color: "#f5a524", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 14.5 }}>Verify your mobile number</b>
                <div className="muted" style={{ fontSize: 13 }}>Needed before ordering a QR, and keeps your login linked to your number. Tap to verify.</div>
              </div>
              <ChevronRight size={18} className="muted" />
            </div>
          </Link>
        )}

        {loading ? (
          <div className="spinner" />
        ) : vehicles.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-vehicles">
            <Car size={44} color="#b3122f" />
            <h3 style={{ fontSize: 22, margin: "14px 0 6px" }}>No vehicles yet</h3>
            <p className="muted" style={{ marginBottom: 20 }}>Add your first vehicle to generate a QR safety sticker.</p>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)} data-testid="empty-add-btn"><Plus size={18} /> Add vehicle</button>
          </div>
        ) : (
          <div className="grid grid-3">
            {vehicles.map((v) => (
              <div key={v.id} className="glass glass-hover card-pad" data-testid={`vehicle-card-${v.number_plate}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div className="brand-badge" style={{ borderRadius: 12 }}><Car size={18} /></div>
                  {v.lost_mode && <span className="chip" style={{ background: "rgba(255,59,92,.16)", borderColor: "rgba(255,59,92,.4)", color: "#ffb3c0" }}><ShieldAlert size={12} /> Lost</span>}
                </div>
                <h3 style={{ fontSize: 24, margin: "14px 0 4px", letterSpacing: ".02em" }}>{v.number_plate}</h3>
                <p className="muted" style={{ fontSize: 14, textTransform: "capitalize" }}>{v.vehicle_type}{v.make_model ? ` · ${v.make_model}` : ""}{v.color ? ` · ${v.color}` : ""}</p>
                {v.qr_ordered ? (
                  <>
                    {v.plan_status && v.plan_status !== "none" && (
                      <div style={{ marginTop: 14 }}>
                        <span className={`pill ${v.plan_status === "active" ? "pill-ok" : v.plan_status === "grace" ? "pill-warn" : "pill-danger"}`} data-testid={`plan-pill-${v.number_plate}`}>
                          {v.plan_status === "active" ? `Active · ${v.plan_days_left}d left` : v.plan_status === "grace" ? "Expired (grace)" : "Expired"}
                        </span>
                      </div>
                    )}
                    <Link to={`/vehicle/${v.id}`} className="btn btn-primary btn-sm btn-block" style={{ marginTop: 12 }} data-testid={`manage-vehicle-${v.number_plate}`}>
                      Manage <ChevronRight size={15} />
                    </Link>
                  </>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                    <Link to={`/buy-qr/${v.id}`} className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }} data-testid={`order-qr-${v.number_plate}`}>Order QR / Plan</Link>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(v.id)} data-testid={`delete-vehicle-${v.number_plate}`} style={{ padding: "8px 12px" }}>
                      <Trash2 size={15} color="#ff3b5c" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {shared.length > 0 && (
          <div style={{ marginTop: 40 }} data-testid="shared-section">
            <h2 style={{ fontSize: 24, marginBottom: 4 }}>Shared <span className="neon">with me</span></h2>
            <p className="muted" style={{ marginBottom: 16 }}>Vehicles family members invited you to follow.</p>
            <div className="grid grid-3">
              {shared.map((v) => (
                <div key={v.id} className="glass card-pad" data-testid={`shared-card-${v.number_plate}`}>
                  <div className="brand-badge" style={{ borderRadius: 12 }}><Car size={18} /></div>
                  <h3 style={{ fontSize: 22, margin: "14px 0 4px" }}>{v.number_plate}</h3>
                  <p className="muted" style={{ fontSize: 14, textTransform: "capitalize" }}>{v.vehicle_type}{v.make_model ? ` · ${v.make_model}` : ""}</p>
                  <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Owner: {v.owner_name || "—"} · role {v.role}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && calls.length > 0 && (
          <div style={{ marginTop: 40 }} id="recent-calls" data-testid="recent-calls-section">
            <h2 style={{ fontSize: 24, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
              <Phone size={20} className="neon" /> Recent <span className="neon">calls</span>
              {calls.filter((c) => c.status === "missed").length > 0 && (
                <span className="chip" data-testid="missed-count" style={{ background: "rgba(255,59,92,.16)", borderColor: "rgba(255,59,92,.4)", color: "#ffb3c0" }}>
                  {calls.filter((c) => c.status === "missed").length} missed
                </span>
              )}
            </h2>
            <p className="muted" style={{ marginBottom: 16 }}>People who scanned your vehicle QR and tried to call you in the app.</p>
            <div style={{ display: "grid", gap: 8 }}>
              {calls.map((c) => {
                const s = CALL_STATUS[c.status] || { label: c.status, color: "#9aa4b2", icon: <Phone size={16} /> };
                return (
                  <div key={c.id} data-testid={`call-row-${c.id}`} className="glass" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, borderLeft: `3px solid ${s.color}` }}>
                    <span style={{ color: s.color, flexShrink: 0 }}>{s.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.number_plate}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{timeAgo(c.created_at)}</div>
                    </div>
                    <span style={{ color: s.color, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <div style={overlay} onClick={() => setShowAdd(false)} data-testid="add-vehicle-modal">
          <div className="glass card-pad" style={{ width: "100%", maxWidth: 460, padding: 28 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 24 }}>Add vehicle</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)} data-testid="close-add-modal" style={{ padding: 8 }}><X size={16} /></button>
            </div>
            <form onSubmit={addVehicle}>
              <div className="field">
                <label>Number plate</label>
                <input className="input" value={form.number_plate} onChange={set("number_plate")} required data-testid="vehicle-plate" placeholder="MH12 AB 1234" />
              </div>
              <div className="field">
                <label>Vehicle type</label>
                <button
                  type="button"
                  className="input"
                  data-testid="vehicle-type"
                  onClick={() => setTypePicker(true)}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left", width: "100%" }}
                >
                  {(() => {
                    const M = VEHICLE_TYPE_META[form.vehicle_type] || VEHICLE_TYPE_META.car;
                    const I = M.icon;
                    return (<>
                      <I size={18} style={{ color: "#ff5a74", flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{M.label}</span>
                      <ChevronDown size={16} className="muted" style={{ flexShrink: 0 }} />
                    </>);
                  })()}
                </button>
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label>Make & model</label>
                  <input className="input" value={form.make_model} onChange={set("make_model")} data-testid="vehicle-model" placeholder="Honda City" />
                </div>
                <div className="field">
                  <label>Color</label>
                  <input className="input" value={form.color} onChange={set("color")} data-testid="vehicle-color" placeholder="White" />
                </div>
              </div>
              <div className="field">
                <label>Speed limit (km/h)</label>
                <input className="input" type="number" min={10} max={300} value={form.speed_limit_kmh} onChange={set("speed_limit_kmh")} data-testid="vehicle-speed" />
              </div>
              {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="add-vehicle-error">{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-vehicle"><Plus size={17} /> {busy ? "Adding…" : "Add vehicle"}</button>
            </form>
          </div>
        </div>
      )}

      <BottomSheet open={typePicker} onClose={() => setTypePicker(false)} title="Select vehicle type">
        <div style={{ display: "grid", gap: 8 }}>
          {VEHICLE_TYPES.map((t) => {
            const M = VEHICLE_TYPE_META[t];
            const I = M.icon;
            const active = form.vehicle_type === t;
            return (
              <button
                key={t}
                type="button"
                data-testid={`vtype-${t}`}
                onClick={() => { setForm((f) => ({ ...f, vehicle_type: t })); setTypePicker(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "13px 14px", borderRadius: 14, cursor: "pointer",
                  background: active ? "rgba(233,37,70,.16)" : "rgba(255,255,255,.04)",
                  border: active ? "1px solid rgba(233,37,70,.6)" : "1px solid rgba(255,255,255,.08)", color: "#fff",
                }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", color: "#ff5a74", flexShrink: 0 }}><I size={20} /></span>
                <span style={{ flex: 1, textAlign: "left", fontWeight: 600 }}>{M.label}</span>
                {active && <Check size={18} style={{ color: "#ff5a74", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)",
  display: "grid", placeItems: "center", padding: 20, zIndex: 60,
};
