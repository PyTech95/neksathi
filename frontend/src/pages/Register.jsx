import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { UserPlus } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await register({ ...form, email: form.email.trim() });
      nav("/dashboard");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" data-testid="register-page">
      <div className="container-nk" style={{ maxWidth: 460 }}>
        <div className="glass card-pad fade-up" style={{ padding: 32 }}>
          <h1 style={{ fontSize: 30, marginBottom: 6 }}>Create your <span className="neon">account</span></h1>
          <p className="muted" style={{ marginBottom: 22 }}>Start protecting your vehicles in minutes.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Full name</label>
              <input className="input" value={form.name} onChange={set("name")} required data-testid="register-name" placeholder="Aarav Sharma" />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={set("email")} required data-testid="register-email" placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input className="input" value={form.phone} onChange={set("phone")} required data-testid="register-phone" placeholder="+91 98765 43210" />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={form.password} onChange={set("password")} required minLength={6} data-testid="register-password" placeholder="At least 6 characters" />
            </div>
            {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="register-error">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy} data-testid="register-submit">
              <UserPlus size={17} /> {busy ? "Creating…" : "Create account"}
            </button>
          </form>
          <p className="muted center" style={{ marginTop: 18, fontSize: 14 }}>
            Already have an account? <Link to="/login" className="neon" style={{ fontWeight: 700 }}>Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
