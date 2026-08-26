import { useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Mail, Send, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api.post("/contact", {
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null,
        subject: form.subject.trim(), message: form.message.trim(),
      });
      setDone(true);
    } catch (e) { setErr(e?.response?.data?.detail || "Could not send your message. Please try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="page" data-testid="contact-page">
      <div className="container-nk" style={{ maxWidth: 560 }}>
        <Link to="/" className="nav-link" style={{ display: "inline-flex", marginBottom: 12 }}><ArrowLeft size={16} /> Home</Link>
        <div className="center" style={{ marginBottom: 18 }}>
          <span className="chip"><Mail size={13} /> Contact us</span>
          <h1 style={{ fontSize: 36, marginTop: 14 }}>Get in <span className="neon">touch</span></h1>
          <p className="muted" style={{ fontSize: 16 }}>Questions, partnerships or bulk QR orders — we'd love to hear from you.</p>
        </div>

        {done ? (
          <div className="glass card-pad center" style={{ padding: 44, borderColor: "rgba(34,211,238,.5)" }} data-testid="contact-success">
            <CheckCircle2 size={54} color="#22d3ee" />
            <h2 style={{ fontSize: 24, marginTop: 12 }}>Message sent!</h2>
            <p className="muted">Thanks for reaching out — our team will get back to you soon.</p>
            <Link to="/" className="btn btn-ghost" style={{ marginTop: 16 }}>Back to home</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="glass card-pad" style={{ padding: 28 }}>
            <div className="grid grid-2">
              <div className="field"><label>Your name</label><input className="input" value={form.name} onChange={set("name")} required maxLength={80} data-testid="contact-name" /></div>
              <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={set("email")} required data-testid="contact-email" /></div>
            </div>
            <div className="grid grid-2">
              <div className="field"><label>Phone (optional)</label><input className="input" value={form.phone} onChange={set("phone")} data-testid="contact-phone" placeholder="+91 …" /></div>
              <div className="field"><label>Subject</label><input className="input" value={form.subject} onChange={set("subject")} required maxLength={120} data-testid="contact-subject" /></div>
            </div>
            <div className="field"><label>Message</label><textarea className="input" rows={5} value={form.message} onChange={set("message")} required minLength={5} maxLength={2000} data-testid="contact-message" placeholder="How can we help?" /></div>
            {err && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }} data-testid="contact-error">{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy} data-testid="submit-contact">{busy ? <Loader2 size={16} className="spin" /> : <Send size={15} />} {busy ? "Sending…" : "Send message"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
