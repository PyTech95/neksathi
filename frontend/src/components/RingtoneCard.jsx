import { useEffect, useState } from "react";
import { BellRing, Siren, Music, Check } from "lucide-react";
import { isNativeApp, getRingtone, setRingtone, pickCustomRingtone } from "@/lib/ringtone";

// Lets the user choose the incoming-call ringtone (pt 12): the phone's default,
// the Nek Sathi siren, or any custom tone on the phone. Native app only.
export default function RingtoneCard() {
  const [st, setSt] = useState(null);
  const load = async () => { try { setSt(await getRingtone()); } catch (_) {} };
  useEffect(() => { if (isNativeApp()) load(); }, []);
  if (!isNativeApp() || !st) return null;

  const mode = st.mode || "default";
  const choose = async (m) => {
    if (m === "custom") {
      const r = await pickCustomRingtone();
      if (r && !r.cancelled) setSt(r);
      else load();
      return;
    }
    await setRingtone(m);
    load();
  };

  const opts = [
    ["default", <BellRing size={18} />, "Default ringtone", "Your phone's normal ringtone"],
    ["siren", <Siren size={18} />, "Nek Sathi siren", "Loud wailing siren + vibration"],
    ["custom", <Music size={18} />, "Custom ringtone", mode === "custom" && st.title ? st.title : "Pick any tone on your phone"],
  ];

  return (
    <div className="glass card-pad" data-testid="ringtone-card" style={{ padding: 22, borderRadius: 18, marginTop: 18 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <BellRing size={18} /> Call ringtone
      </h2>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>Choose what plays for an incoming Nek Sathi call.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {opts.map(([id, icon, label, hint]) => (
          <button
            key={id}
            type="button"
            onClick={() => choose(id)}
            data-testid={`ringtone-${id}`}
            className="glass"
            style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: "pointer", border: mode === id ? "1px solid var(--accent)" : "1px solid var(--panel-brd)", color: "var(--text)" }}
          >
            <div style={{ flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
              <div className="muted" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</div>
            </div>
            {mode === id && <Check size={18} style={{ color: "#2fcf7a", flexShrink: 0 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
