import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { QrCode, CheckCircle2, LogIn, Car, Ban, Tag as TagIcon } from "lucide-react";

const TYPES = ["car", "bike", "tractor", "commercial", "other"];
const TAG_TYPES = [
  { v: "kid", l: "School kid" }, { v: "patient", l: "Patient / Elderly" }, { v: "staff", l: "Office / Staff" },
  { v: "person", l: "Person" }, { v: "pet", l: "Pet" }, { v: "bag", l: "Bag" }, { v: "luggage", l: "Luggage" }, { v: "other", l: "Other" },
];
const TAG_PERSON = ["kid", "patient", "staff", "person"];

export default function Claim() {
  const { serial } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState("loading"); // loading | activate | blocked | error | done
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ number_plate: "", vehicle_type: "car", make_model: "", speed_limit_kmh: 80 });
  const [tagForm, setTagForm] = useState({ name: "", tag_type: "kid", description: "", blood_group: "", medical_notes: "", guardian_name: "", guardian_phone: "" });

  const isTag = preview?.intended_type === "tag";

  useEffect(() => {
    api.get(`/public/claim/${serial}`)
      .then((r) => {
        const d = r.data;
        if (d.status === "assigned" && d.qr_id) { nav(`/scan/${d.qr_id}`, { replace: true }); return; }
        if (d.status === "blocked") { setState("blocked"); return; }
        setPreview(d); setState("activate");
      })
      .catch((e) => { setErr(e?.response?.data?.detail || "Serial not found"); setState("error"); });
  }, [serial, nav]);

  const activate = async (e) => {
    e.preventDefault();
    if (!user) { nav(`/otp-login?next=${encodeURIComponent(`/claim/${serial}`)}`); return; }
    setErr(""); setBusy(true);
    try {
      const product_type = isTag ? "tag" : "vehicle";
      const payload = isTag ? { ...tagForm } : { ...form, speed_limit_kmh: Number(form.speed_limit_kmh) };
      const r = await api.post(`/qr/claim`, { serial_no: serial, product_type, payload });
      setState("done");
      setPreview((p) => ({ ...p, qr_id: r.data.qr_id, item_id: r.data.id }));
    } catch (e) { setErr(e?.response?.data?.detail || "Activation failed"); } finally { setBusy(false); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setT = (k) => (e) => setTagForm({ ...tagForm, [k]: e.target.value });
  const tagIsPerson = TAG_PERSON.includes(tagForm.tag_type);

  return (
    <div className="page" data-testid="claim-page">
      <div className="container-nk" style={{ maxWidth: 460 }}>
        <div className="glass card-pad fade-up" style={{ padding: 32, marginTop: 20 }}>
          {state === "loading" && <div className="spinner" />}

          {state === "error" && <div className="center" data-testid="claim-error"><h1 style={{ fontSize: 26 }}>QR not found</h1><p className="muted">{err}</p></div>}

          {state === "blocked" && (
            <div className="center" data-testid="claim-blocked"><Ban size={48} color="#ff3b5c" /><h1 style={{ fontSize: 24, marginTop: 12 }}>QR blocked</h1><p className="muted">This QR sticker has been blocked. Contact Nek Sathi support.</p></div>
          )}

          {state === "activate" && (
            <div data-testid="claim-activate">
              <div className="center"><div className="brand-badge" style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto" }}>{isTag ? <TagIcon size={26} /> : <QrCode size={26} />}</div></div>
              <h1 className="center" style={{ fontSize: 26, marginTop: 14 }}>Activate your <span className="neon">{isTag ? "ID tag" : "QR"}</span></h1>
              <p className="center muted" style={{ marginBottom: 6 }}>Serial <b style={{ color: "#fff" }}>{serial}</b>{preview?.org_name ? <> · <b style={{ color: "#d9c9ff" }}>{preview.org_name}</b></> : null}</p>
              {!user && <p className="center muted" style={{ fontSize: 13, marginBottom: 14 }}>Log in / register to become the owner of this {isTag ? "tag" : "QR"}.</p>}
              <form onSubmit={activate}>
                {isTag ? (
                  <>
                    <div className="field"><label>Name / label</label><input className="input" value={tagForm.name} onChange={setT("name")} required={!!user} data-testid="claim-tag-name" placeholder="e.g. Aarav (Class 4-B)" /></div>
                    <div className="field"><label>Type</label>
                      <select className="input" value={tagForm.tag_type} onChange={setT("tag_type")} data-testid="claim-tag-type">{TAG_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
                    </div>
                    {tagIsPerson && (
                      <>
                        <div className="grid grid-2">
                          <div className="field"><label>Blood group</label><input className="input" value={tagForm.blood_group} onChange={setT("blood_group")} data-testid="claim-tag-blood" placeholder="O+" /></div>
                          <div className="field"><label>Allergies / medical</label><input className="input" value={tagForm.medical_notes} onChange={setT("medical_notes")} data-testid="claim-tag-medical" placeholder="Asthma…" /></div>
                        </div>
                        <div className="grid grid-2">
                          <div className="field"><label>Guardian name</label><input className="input" value={tagForm.guardian_name} onChange={setT("guardian_name")} data-testid="claim-tag-guardian-name" placeholder="Parent / next of kin" /></div>
                          <div className="field"><label>Guardian phone</label><input className="input" value={tagForm.guardian_phone} onChange={setT("guardian_phone")} data-testid="claim-tag-guardian-phone" placeholder="+91 …" /></div>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="field"><label>Vehicle number plate</label><input className="input" value={form.number_plate} onChange={set("number_plate")} required={!!user} data-testid="claim-plate" placeholder="DL01 XX 1234" /></div>
                    <div className="field"><label>Vehicle type</label>
                      <select className="input" value={form.vehicle_type} onChange={set("vehicle_type")} data-testid="claim-type">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                    </div>
                    <div className="field"><label>Make & model</label><input className="input" value={form.make_model} onChange={set("make_model")} data-testid="claim-model" placeholder="Honda City" /></div>
                  </>
                )}
                {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 10 }} data-testid="claim-error-msg">{err}</p>}
                <button className="btn btn-primary btn-block" disabled={busy} data-testid="claim-submit">
                  {user ? <><CheckCircle2 size={17} /> {busy ? "Activating…" : `Activate & register ${isTag ? "tag" : "vehicle"}`}</> : <><LogIn size={17} /> Log in to activate</>}
                </button>
              </form>
            </div>
          )}

          {state === "done" && (
            <div className="center" data-testid="claim-done">
              <CheckCircle2 size={60} color="#22d3ee" />
              <h1 style={{ fontSize: 26, marginTop: 14 }}>{isTag ? "Tag" : "QR"} Activated! 🎉</h1>
              <p className="muted" style={{ marginTop: 6 }}>Your {isTag ? "ID tag" : "vehicle"} is now linked and this QR is <b style={{ color: "#fff" }}>Active</b>.</p>
              <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "center" }}>
                {isTag
                  ? <Link to={`/tag/${preview?.item_id}`} className="btn btn-primary" data-testid="go-tag"><TagIcon size={16} /> Manage tag</Link>
                  : <Link to={`/vehicle/${preview?.item_id}`} className="btn btn-primary" data-testid="go-vehicle"><Car size={16} /> Manage vehicle</Link>}
                <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
