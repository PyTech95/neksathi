import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { rupee } from "@/lib/pay";
import { ArrowLeft, QrCode, Smartphone, CheckCircle2, ShieldCheck } from "lucide-react";

const TYPES = ["car", "bike", "tractor", "commercial", "other"];

export default function DealerAssign() {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ serial_no: "", customer_mobile: "", number_plate: "", vehicle_type: "car", make_model: "", plan_id: "" });
  const [step, setStep] = useState("form");  // form | otp | done
  const [assign, setAssign] = useState(null);  // {assign_id, mobile, dev_code, channel, plan_name}
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api.get("/plans").then((r) => setPlans((r.data || []).filter((p) => p.active))).catch(() => {}); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const start = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api.post("/dealer/assign/start", { ...form });
      setAssign(r.data); setStep("otp");
    } catch (e) { setErr(e?.response?.data?.detail || "Could not start assignment"); }
    finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api.post("/dealer/assign/verify", { assign_id: assign.assign_id, code });
      setResult(r.data); setStep("done");
    } catch (e) { setErr(e?.response?.data?.detail || "OTP verification failed"); }
    finally { setBusy(false); }
  };

  const reset = () => { setForm({ serial_no: "", customer_mobile: "", number_plate: "", vehicle_type: "car", make_model: "", plan_id: "" }); setAssign(null); setCode(""); setResult(null); setErr(""); setStep("form"); };

  return (
    <div className="page" data-testid="dealer-assign-page">
      <div className="container-nk" style={{ maxWidth: 520 }}>
        <Link to="/dealer" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Dealer</Link>
        <span className="chip"><QrCode size={13} /> Scan & assign</span>
        <h1 style={{ fontSize: 28, margin: "12px 0 6px" }}>Assign a QR to a <span className="neon">customer</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>Scan the sticker (or type its serial), enter the customer's details & plan. They confirm with an OTP on their mobile.</p>

        {step === "form" && (
          <form className="glass card-pad" style={{ padding: 24 }} onSubmit={start} data-testid="assign-form">
            <div className="field"><label>QR serial number</label><input className="input" value={form.serial_no} onChange={set("serial_no")} required data-testid="assign-serial" placeholder="e.g. NS000123" /><small className="muted" style={{ fontSize: 11 }}>Printed under the QR. (Camera scan available in the mobile app.)</small></div>
            <div className="field"><label>Customer mobile ⭐</label><input className="input" value={form.customer_mobile} onChange={set("customer_mobile")} required data-testid="assign-mobile" placeholder="10-digit — this becomes the owner" /></div>
            <div className="field"><label>Vehicle number plate</label><input className="input" value={form.number_plate} onChange={set("number_plate")} required data-testid="assign-plate" placeholder="MH12 AB 1234" /></div>
            <div className="grid grid-2">
              <div className="field"><label>Type</label><select className="input" value={form.vehicle_type} onChange={set("vehicle_type")} data-testid="assign-type">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label>Make & model</label><input className="input" value={form.make_model} onChange={set("make_model")} data-testid="assign-model" placeholder="optional" /></div>
            </div>
            <div className="field"><label>Plan customer is taking</label>
              <select className="input" value={form.plan_id} onChange={set("plan_id")} required data-testid="assign-plan">
                <option value="">Choose plan…</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupee(p.price_cents)} · {p.validity_days} days</option>)}
              </select>
            </div>
            {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="assign-error">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy} data-testid="assign-start"><Smartphone size={16} /> {busy ? "Sending OTP…" : "Send OTP to customer"}</button>
          </form>
        )}

        {step === "otp" && (
          <form className="glass card-pad" style={{ padding: 24 }} onSubmit={verify} data-testid="assign-otp">
            <h2 style={{ fontSize: 20, marginBottom: 6 }}>Enter the OTP</h2>
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Sent to <b style={{ color: "#fff" }}>{assign?.mobile}</b> via {assign?.channel}. Ask the customer to read it out.</p>
            {assign?.dev_code && <div className="pill pill-warn" style={{ marginBottom: 14 }}>TEST mode OTP: {assign.dev_code}</div>}
            <div className="field"><label>OTP</label><input className="input" value={code} onChange={(e) => setCode(e.target.value)} required data-testid="assign-code" placeholder="6-digit" style={{ letterSpacing: 4, fontSize: 18 }} /></div>
            {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="assign-otp-error">{err}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={reset}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={busy} data-testid="assign-verify"><CheckCircle2 size={16} /> {busy ? "Verifying…" : "Verify & assign"}</button>
            </div>
          </form>
        )}

        {step === "done" && (
          <div className="glass card-pad center" style={{ padding: 34 }} data-testid="assign-done">
            <ShieldCheck size={56} color="#2fcf7a" />
            <h2 style={{ fontSize: 24, marginTop: 14 }}>QR assigned! ✅</h2>
            <p className="muted" style={{ marginTop: 6 }}>Registered to <b style={{ color: "#fff" }}>{assign?.mobile}</b> · plan <b style={{ color: "#fff" }}>{result?.plan_name}</b> active.</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Customer can log in with this mobile (OTP) to see their plan & QR.</p>
            <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={reset} data-testid="assign-another"><QrCode size={16} /> Assign another</button>
          </div>
        )}
      </div>
    </div>
  );
}
