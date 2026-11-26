import { useEffect, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import { BookOpen, Camera, Mic, Video, MapPin, Loader2, Play, Image as ImageIcon } from "lucide-react";

const META = {
  sos: { icon: <Camera size={18} />, color: "#ff3b5c", label: "SOS photo" },
  audio: { icon: <Mic size={18} />, color: "#f5a524", label: "Audio evidence" },
  video: { icon: <Video size={18} />, color: "#e92546", label: "SOS video" },
};

const fmt = (d) => { try { return new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (_) { return ""; } };
// SOS photos/audio/video are stored as base64; some are already data: URLs.
const asDataUrl = (b64, fallbackMime) => (b64 && b64.startsWith("data:") ? b64 : `data:${fallbackMime};base64,${b64}`);

export default function MyStory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null);   // { kind, src } being shown
  const [vbusy, setVbusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { setItems((await api.get("/me/story")).data.items || []); }
      finally { setLoading(false); }
    })();
  }, []);

  const open = async (it) => {
    if (!it.media_url) return;
    setVbusy(true); setView({ kind: it.kind, src: null });
    try {
      const d = (await api.get(it.media_url)).data;
      let src = null;
      if (it.kind === "sos") src = asDataUrl(d.photo_base64, "image/jpeg");
      else if (it.kind === "audio") src = asDataUrl(d.audio_base64, d.mime || "audio/webm");
      else if (it.kind === "video") src = asDataUrl(d.video_base64, "video/webm");
      setView({ kind: it.kind, src });
    } catch (_) {
      setView({ kind: it.kind, src: null, error: true });
    } finally { setVbusy(false); }
  };

  return (
    <div className="page" data-testid="my-story-page">
      <div className="container-nk" style={{ maxWidth: 620 }}>
        <span className="chip"><BookOpen size={13} /> My Story</span>
        <h1 style={{ fontSize: 30, marginTop: 12, marginBottom: 4 }}>My <span className="neon">story</span></h1>
        <p className="muted" style={{ marginBottom: 20 }}>Everything you've captured — SOS photos, audio and video — in one timeline.</p>

        {loading ? (
          <div className="spinner" />
        ) : items.length === 0 ? (
          <div className="glass card-pad center" style={{ padding: 44 }} data-testid="story-empty">
            <ImageIcon size={40} color="var(--muted)" />
            <h3 style={{ fontSize: 20, margin: "12px 0 6px" }}>Nothing captured yet</h3>
            <p className="muted">When an SOS captures a photo, or you record audio/video evidence, it shows up here.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((it) => {
              const m = META[it.kind] || META.sos;
              const hasMedia = !!it.media_url;
              return (
                <div key={`${it.kind}-${it.id}`} data-testid={`story-item-${it.id}`} className="glass" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 14 }}>
                  <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: "grid", placeItems: "center", background: `${m.color}1f`, color: m.color, border: `1px solid ${m.color}55` }}>{m.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{m.label}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{fmt(it.created_at)}</div>
                    {it.kind === "sos" && it.latitude != null && it.longitude != null && (
                      <a href={`https://maps.google.com/?q=${it.latitude},${it.longitude}`} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3, marginTop: 2 }}><MapPin size={12} /> Location</a>
                    )}
                  </div>
                  {hasMedia ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => open(it)} data-testid={`story-open-${it.id}`} style={{ flexShrink: 0 }}>
                      {it.kind === "sos" ? <><ImageIcon size={14} /> View</> : <><Play size={14} /> Play</>}
                    </button>
                  ) : (
                    <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>No media</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? (META[view.kind]?.label || "Media") : ""}>
        <div style={{ display: "grid", placeItems: "center", minHeight: 120 }}>
          {vbusy || (view && view.src === null && !view.error) ? (
            <Loader2 size={22} className="spin" />
          ) : view && view.error ? (
            <p className="muted" style={{ fontSize: 13 }}>Couldn't load this media.</p>
          ) : view && view.kind === "sos" ? (
            <img src={view.src} alt="SOS" style={{ maxWidth: "100%", borderRadius: 12 }} data-testid="story-image" />
          ) : view && view.kind === "audio" ? (
            <audio src={view.src} controls autoPlay style={{ width: "100%" }} data-testid="story-audio" />
          ) : view && view.kind === "video" ? (
            <video src={view.src} controls autoPlay playsInline style={{ maxWidth: "100%", borderRadius: 12 }} data-testid="story-video" />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
