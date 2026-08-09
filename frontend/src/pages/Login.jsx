import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogIn } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav("/dashboard");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" data-testid="login-page">
      <div className="container-nk" style={{ maxWidth: 440 }}>
        <div className="glass card-pad fade-up" style={{ padding: 32 }}>
          <h1 style={{ fontSize: 30, marginBottom: 6 }}>Welcome <span className="neon">back</span></h1>
          <p className="muted" style={{ marginBottom: 22 }}>Log in to manage your safety QRs.</p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" placeholder="••••••••" />
            </div>
            {err && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }} data-testid="login-error">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy} data-testid="login-submit">
              <LogIn size={17} /> {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="muted center" style={{ marginTop: 18, fontSize: 14 }}>
            No account? <Link to="/register" className="neon" style={{ fontWeight: 700 }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
