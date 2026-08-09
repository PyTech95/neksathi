import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Car, Plus, Trash2, ShieldAlert, ChevronRight, X } from "lucide-react";

const VEHICLE_TYPES = ["car", "bike", "tractor", "commercial", "other"];

export default function Dashboard() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ number_plate: "", vehicle_type: "car", make_model: "", color: "", speed_limit_kmh: 80 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/vehicles");
      setVehicles(r.data);
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

        {loading ? (
          <div className="spinner" />
        ) : vehicles.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 50 }} data-testid="empty-vehicles">
            <Car size={44} color="#7c3aed" />
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
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  <Link to={`/vehicle/${v.id}`} className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} data-testid={`open-vehicle-${v.number_plate}`}>
                    Manage & QR <ChevronRight size={15} />
                  </Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(v.id)} data-testid={`delete-vehicle-${v.number_plate}`} style={{ padding: "8px 12px" }}>
                    <Trash2 size={15} color="#ff3b5c" />
                  </button>
                </div>
              </div>
            ))}
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
                <select className="input" value={form.vehicle_type} onChange={set("vehicle_type")} data-testid="vehicle-type">
                  {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
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
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, background: "rgba(3,3,8,.72)", backdropFilter: "blur(6px)",
  display: "grid", placeItems: "center", padding: 20, zIndex: 60,
};
