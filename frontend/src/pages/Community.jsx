import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Users, Send, Heart, Trash2, Image as ImageIcon, X, Loader2, ShieldCheck, LogOut } from "lucide-react";

export default function Community() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const load = async () => {
    try { setData((await api.get("/community")).data); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const join = async () => { setBusy(true); setErr(""); try { await api.post("/community/join"); await load(); } catch (e) { setErr(e?.response?.data?.detail || "Could not join."); } finally { setBusy(false); } };
  const leave = async () => { if (!window.confirm("Leave the community group?")) return; await api.post("/community/leave"); load(); };

  const pickPhoto = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2_500_000) { setErr("Photo too large (max ~2.5MB)."); return; }
    const r = new FileReader(); r.onload = () => setPhoto(r.result); r.readAsDataURL(f);
  };

  const post = async (e) => {
    e.preventDefault(); if (!text.trim()) return;
    setBusy(true); setErr("");
    try {
      await api.post("/community/posts", { text: text.trim(), photo_base64: photo });
      setText(""); setPhoto(null); if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) { setErr(e?.response?.data?.detail || "Could not post."); } finally { setBusy(false); }
  };
  const like = async (id) => {
    const r = await api.post(`/community/posts/${id}/like`);
    setData((d) => ({ ...d, posts: d.posts.map((p) => p.id === id ? { ...p, like_count: r.data.like_count, liked_by_me: r.data.liked_by_me } : p) }));
  };
  const remove = async (id) => { if (!window.confirm("Delete this post?")) return; await api.delete(`/community/posts/${id}`); load(); };

  if (loading) return <div className="page" style={{ padding: 40 }}><div className="spinner" data-testid="community-loading" /></div>;

  return (
    <div className="page" data-testid="community-page" style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 80px" }}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Users size={26} className="neon" />
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Community Safety</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Share and see local safety updates with your neighbours.</p>

      <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={18} className="neon" />
          <span style={{ fontWeight: 700 }} data-testid="community-count">{data.member_count} / {data.cap} members</span>
        </div>
        {data.is_member ? (
          <button className="btn btn-ghost btn-sm" onClick={leave} data-testid="community-leave-btn"><LogOut size={14} /> Leave</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={join} disabled={busy} data-testid="community-join-btn">{busy ? <Loader2 className="spin" size={14} /> : "Join group"}</button>
        )}
      </div>

      {err && <div style={{ color: "#ff7591", fontSize: 13, marginBottom: 10 }} data-testid="community-error">{err}</div>}

      {data.is_member ? (
        <>
          <form onSubmit={post} className="glass" style={{ padding: 16, borderRadius: 16, marginBottom: 18 }} data-testid="community-composer">
            <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Share a safety update with your neighbourhood…" data-testid="community-text-input" style={{ resize: "vertical" }} />
            {photo && (
              <div style={{ position: "relative", marginTop: 10, width: 120 }}>
                <img src={photo} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10 }} />
                <button type="button" onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ""; }} style={{ position: "absolute", top: -8, right: -8, background: "#e11d48", border: "none", borderRadius: "50%", width: 24, height: 24, color: "#fff", cursor: "pointer" }}><X size={14} /></button>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }} data-testid="community-photo-label">
                <ImageIcon size={15} /> Photo
                <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: "none" }} data-testid="community-photo-input" />
              </label>
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !text.trim()} data-testid="community-post-btn">{busy ? <Loader2 className="spin" size={15} /> : <><Send size={15} /> Post</>}</button>
            </div>
          </form>

          {data.posts.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", padding: "24px 0" }} data-testid="community-empty">No posts yet. Be the first to share a safety update.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {data.posts.map((p) => (
                <div key={p.id} data-testid={`community-post-${p.id}`} className="glass" style={{ padding: 16, borderRadius: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#22d3ee)", display: "grid", placeItems: "center", fontWeight: 800, color: "#fff", fontSize: 13 }}>{p.author_name?.[0]?.toUpperCase() || "?"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.author_name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{new Date(p.created_at).toLocaleString()}</div>
                    </div>
                    {p.mine && <button className="btn btn-ghost btn-sm" onClick={() => remove(p.id)} data-testid={`community-delete-${p.id}`}><Trash2 size={13} /></button>}
                  </div>
                  <div style={{ fontSize: 14.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{p.text}</div>
                  {p.photo_base64 && <img src={p.photo_base64} alt="" style={{ width: "100%", borderRadius: 10, marginTop: 10, maxHeight: 320, objectFit: "cover" }} />}
                  <button onClick={() => like(p.id)} data-testid={`community-like-${p.id}`} className="btn btn-ghost btn-sm" style={{ marginTop: 12, color: p.liked_by_me ? "#ff3b5c" : undefined }}>
                    <Heart size={15} fill={p.liked_by_me ? "#ff3b5c" : "none"} /> {p.like_count}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="glass" style={{ padding: 32, borderRadius: 16, textAlign: "center" }} data-testid="community-join-cta">
          <Users size={34} className="neon" style={{ marginBottom: 10 }} />
          <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>Join your neighbourhood group</h2>
          <p className="muted" style={{ marginTop: 0 }}>Connect with up to {data.cap} neighbours to share and receive local safety alerts.</p>
          <button className="btn btn-primary" onClick={join} disabled={busy} data-testid="community-join-btn-2">{busy ? <Loader2 className="spin" size={16} /> : "Join now"}</button>
        </div>
      )}
    </div>
  );
}
