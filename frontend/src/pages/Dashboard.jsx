import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Car, Plus, Trash2, ShieldAlert, ShieldCheck, ChevronRight, ChevronDown, X, Phone, PhoneMissed, PhoneOff, PhoneOutgoing, Bike, Tractor, Truck, CircleHelp, Check, Siren, ScanLine, Users, MapPin, Lock, Radar, AlertTriangle } from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import VehicleFields, { tidyVehicle } from "@/components/VehicleFields";

// Top strip — the four things people reach for first. Each points at a real page.
const QUICK_ACTIONS = [
  { to: "/theft-protection", icon: Lock, label: "Anti-Theft" },
  { to: "/family", icon: MapPin, label: "Live Location" },
  { to: "/scanner", icon: ScanLine, label: "Scan QR" },
  { to: "/safety", icon: Siren, label: "SOS", primary: true },
];

// Clean services grid (like the "More" tiles) — every card opens its real page.
const SERVICES = [
  { to: "/safety", icon: AlertTriangle, title: "Accident Safety", desc: "Auto-alert on a crash" },
  { to: "/theft-protection", icon: Lock, title: "Anti-Theft", desc: "Lock, siren & intruder" },
  { to: "/safe-zones", icon: Radar, title: "Safe Zones", desc: "Geo-fence alerts" },
  { to: "/family", icon: Users, title: "Family", desc: "Live location & trail" },
  { to: "/tags", icon: ScanLine, title: "Smart QR / Tags", desc: "Bags, pets & luggage" },
  { to: "/helplines", icon: Phone, title: "Helplines", desc: "Police, ambulance, fire" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

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

// Small status pill for a vehicle card.
function vehicleStatus(v) {
  if (!v.qr_ordered) return { text: "Set up QR", cls: "pill-warn" };
  if (v.plan_status === "active") return { text: `Active · ${v.plan_days_left}d`, cls: "pill-ok" };
  if (v.plan_status === "grace") return { text: "Expired (grace)", cls: "pill-warn" };
  if (v.plan_status === "expired" || v.plan_status === "none") return { text: "Expired", cls: "pill-danger" };
  return { text: "Active", cls: "pill-ok" };
}

export default function Dashboard() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [shared, setShared] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ number_plate: "", vehicle_type: "car", brand: "", model: "", color: "", speed_limit_kmh: 80 });
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
      await api.post("/vehicles", {
        number_plate: form.number_plate,
        vehicle_type: form.vehicle_type,
        ...tidyVehicle(form),
        speed_limit_kmh: Number(form.speed_limit_kmh),
      });
      setShowAdd(false);
      setForm({ number_plate: "", vehicle_type: "car", brand: "", model: "", color: "", speed_limit_kmh: 80 });
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

  const isProtected = vehicles.some((v) => v.plan_status === "active");

  return (
    <div className="page" data-testid="dashboard-page">
      <div className="container-nk" style={{ paddingTop: 16 }}>
        <style>{`.vrow::-webkit-scrollbar{display:none}`}</style>

        {/* Greeting row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", overflow: "hidden", background: "linear-gradient(135deg,#b3122f,#e92546)", color: "#fff", fontWeight: 800, fontSize: 18 }}>
            {user?.avatar_base64 ? <img src={user.avatar_base64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (user?.name?.[0] || "?")}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 12.5 }}>{greeting()},</div>
            <h1 style={{ fontSize: 21, margin: "1px 0 0", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name?.split(" ")[0] || "there"}</h1>
          </div>
          <span data-testid="protection-status" className="pill" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, ...(isProtected ? { background: "rgba(52,211,153,.14)", borderColor: "rgba(52,211,153,.4)", color: "#34d399" } : { background: "rgba(245,165,36,.14)", borderColor: "rgba(245,165,36,.4)", color: "#f5a524" }) }}>
            {isProtected ? <><ShieldCheck size={13} /> Protected</> : <><ShieldAlert size={13} /> Set up</>}
          </span>
        </div>

        {/* Quick actions strip */}
        <div className="glass" data-testid="home-quick-actions" style={{ padding: "14px 8px", borderRadius: 18, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 18 }}>
          {QUICK_ACTIONS.map(({ to, icon: Icon, label, primary }) => (
            <Link key={label} to={to} data-testid={`quick-${label.toLowerCase().replace(/\s+/g, "-")}`}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, textDecoration: "none", color: "var(--text)", padding: "4px 2px" }}>
              <span style={{ width: 48, height: 48, borderRadius: 15, display: "grid", placeItems: "center",
                background: primary ? "linear-gradient(135deg,#b3122f,#e92546)" : "rgba(233,37,70,.12)",
                color: primary ? "#fff" : "#ff5a74",
                border: primary ? "none" : "1px solid rgba(233,37,70,.32)",
                boxShadow: primary ? "0 6px 16px rgba(233,37,70,.35)" : "none" }}>
                <Icon size={22} />
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, textAlign: "center", lineHeight: 1.15, color: primary ? "#ff5a74" : "var(--text)" }}>{label}</span>
            </Link>
          ))}
        </div>

        {/* Hero banner */}
        <Link to="/safety" data-testid="home-hero" style={{ textDecoration: "none", display: "block", marginBottom: 6 }}>
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, padding: "22px 20px", color: "#fff", background: "linear-gradient(120deg,#7a0f23 0%,#b3122f 45%,#e92546 100%)" }}>
            <div style={{ position: "absolute", right: -40, top: -30, width: 170, height: 170, borderRadius: "50%", background: "rgba(255,255,255,.12)" }} />
            <div style={{ position: "absolute", right: 14, bottom: -46, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,.09)" }} />
            <span style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", width: 72, height: 72, borderRadius: 18, background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.35)", display: "grid", placeItems: "center" }}>
              <ScanLine size={34} color="#fff" />
            </span>
            <h2 style={{ fontSize: 21, lineHeight: 1.15, fontWeight: 800, margin: 0, maxWidth: 240 }}>Every journey, protected.</h2>
            <p style={{ margin: "7px 0 0", fontSize: 13, opacity: 0.92, maxWidth: 230, lineHeight: 1.4 }}>A QR on your vehicle — the moment someone scans it, you get an instant alert with live location.</p>
            <span style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: "#b3122f", fontWeight: 700, fontSize: 13, padding: "9px 15px", borderRadius: 11 }}>Learn more <ChevronRight size={15} /></span>
          </div>
        </Link>

        {/* My Vehicles */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 2px 12px" }}>
          <h2 style={{ fontSize: 18, margin: 0, fontWeight: 800 }}>My Vehicles</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(true)} data-testid="add-vehicle-btn" style={{ color: "#ff5a74", fontWeight: 700 }}><Plus size={15} /> Add</button>
        </div>

        {user && !user.phone_verified && (
          <Link to="/settings" data-testid="dashboard-verify-banner" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="glass card-pad glass-hover" style={{ padding: 14, marginBottom: 14, borderColor: "rgba(245,165,36,.5)", display: "flex", alignItems: "center", gap: 12 }}>
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
          <div className="glass card-pad center" style={{ padding: 40 }} data-testid="empty-vehicles">
            <Car size={40} color="#e92546" />
            <h3 style={{ fontSize: 20, margin: "12px 0 6px" }}>No vehicles yet</h3>
            <p className="muted" style={{ marginBottom: 18 }}>Add your first vehicle to generate a QR safety sticker.</p>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)} data-testid="empty-add-btn"><Plus size={18} /> Add vehicle</button>
          </div>
        ) : (
          <div className="vrow" style={{ display: "flex", gap: 12, overflowX: "auto", padding: "2px 2px 6px", scrollbarWidth: "none" }}>
            {vehicles.map((v) => {
              const M = VEHICLE_TYPE_META[v.vehicle_type] || VEHICLE_TYPE_META.car;
              const VIcon = M.icon;
              const st = vehicleStatus(v);
              // Whole card is tappable → opens that vehicle (order page if no QR yet).
              const to = v.qr_ordered ? `/vehicle/${v.id}` : `/buy-qr/${v.id}`;
              return (
                <Link key={v.id} to={to} data-testid={`vehicle-card-${v.number_plate}`}
                  className="glass glass-hover" style={{ flex: "0 0 180px", padding: 15, borderRadius: 18, textDecoration: "none", color: "var(--text)", position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(233,37,70,.12)", border: "1px solid rgba(233,37,70,.32)", color: "#ff5a74" }}><VIcon size={21} /></span>
                    {v.lost_mode ? <span className="chip" style={{ background: "rgba(255,59,92,.16)", borderColor: "rgba(255,59,92,.4)", color: "#ffb3c0" }}><ShieldAlert size={12} /> Lost</span> : <ChevronRight size={18} className="muted" />}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: ".03em", margin: "13px 0 3px" }}>{v.number_plate}</div>
                  <div className="muted" style={{ fontSize: 12.5, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.vehicle_type}{v.make_model ? ` · ${v.make_model}` : ""}</div>
                  <span className={`pill ${st.cls}`} data-testid={`plan-pill-${v.number_plate}`} style={{ marginTop: 12, display: "inline-flex" }}>{st.text}</span>
                </Link>
              );
            })}
            {/* Add vehicle card */}
            <button onClick={() => setShowAdd(true)} data-testid="add-vehicle-card"
              style={{ flex: "0 0 128px", borderRadius: 18, border: "1.6px dashed var(--panel-brd)", background: "transparent", color: "#ff5a74", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 9, cursor: "pointer" }}>
              <span style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(233,37,70,.12)", display: "grid", placeItems: "center" }}><Plus size={20} /></span>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Add vehicle</span>
            </button>
          </div>
        )}

        {/* Safety services */}
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "26px 2px 12px" }}>Safety services</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {SERVICES.map(({ to, icon: Icon, title, desc }) => (
            <Link key={title} to={to} className="glass glass-hover" data-testid={`service-${title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`}
              style={{ padding: 15, borderRadius: 16, textDecoration: "none", color: "var(--text)", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(233,37,70,.12)", border: "1px solid rgba(233,37,70,.32)", color: "#ff5a74", marginBottom: 9 }}>
                <Icon size={21} />
              </span>
              <b style={{ fontSize: 14.5 }}>{title}</b>
              <small className="muted" style={{ fontSize: 11.5, lineHeight: 1.3 }}>{desc}</small>
            </Link>
          ))}
        </div>

        {shared.length > 0 && (
          <div style={{ marginTop: 34 }} data-testid="shared-section">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Shared with me</h2>
            <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>Vehicles family members invited you to follow.</p>
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
          <div style={{ marginTop: 34 }} id="recent-calls" data-testid="recent-calls-section">
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
              <Phone size={18} className="neon" /> Recent calls
              {calls.filter((c) => c.status === "missed").length > 0 && (
                <span className="chip" data-testid="missed-count" style={{ background: "rgba(255,59,92,.16)", borderColor: "rgba(255,59,92,.4)", color: "#ffb3c0" }}>
                  {calls.filter((c) => c.status === "missed").length} missed
                </span>
              )}
            </h2>
            <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>People who scanned your vehicle QR and tried to call you in the app.</p>
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
              <VehicleFields
                value={{ brand: form.brand, model: form.model, color: form.color }}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                idPrefix="vehicle"
              />
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
