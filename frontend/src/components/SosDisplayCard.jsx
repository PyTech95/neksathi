import { useEffect, useState } from "react";
import { ShieldAlert, ChevronRight, CheckCircle2 } from "lucide-react";
import { isNativeApp, sosDisplayStatus, openFullScreenSettings, openAppInfo, requestBatteryExempt } from "@/lib/sosdisplay";

// Helps the user make the family-SOS alert pop over the LOCK SCREEN (not just a
// notification + siren). Whether it shows full-screen is gated per-device by
// Android 14's full-screen-intent permission + OEM "show on lock screen" /
// background pop-up / battery settings — so this opens the right screens.
export default function SosDisplayCard() {
  const [st, setSt] = useState(null);
  const load = async () => { try { setSt(await sosDisplayStatus()); } catch (_) {} };
  useEffect(() => {
    if (!isNativeApp()) return;
    load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!isNativeApp() || !st || !st.supported) return null;

  const fsiOk = st.full_screen_intent !== false;
  const battOk = st.battery_unrestricted !== false;
  const allOk = fsiOk && battOk;
  const oem = (st.manufacturer || "").toLowerCase();
  const isPushyOem = ["xiaomi", "redmi", "poco", "oppo", "vivo", "realme", "oneplus", "iqoo"].some((m) => oem.includes(m));

  const Row = ({ label, hint, onClick, done, testid }) => (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="glass"
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: done ? "default" : "pointer", border: "1px solid var(--panel-brd)", color: "var(--text)" }}
    >
      <div style={{ flexShrink: 0 }}>{done ? <CheckCircle2 size={18} style={{ color: "#2fcf7a" }} /> : <ShieldAlert size={18} style={{ color: "var(--accent)" }} />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
        {hint && <div className="muted" style={{ fontSize: 12.5 }}>{hint}</div>}
      </div>
      {!done && <ChevronRight size={16} style={{ opacity: .6, flexShrink: 0 }} />}
    </button>
  );

  return (
    <div className="glass card-pad" data-testid="sos-display-card" style={{ padding: 22, borderRadius: 18, marginTop: 18, borderColor: allOk ? "rgba(47,207,122,.4)" : "rgba(255,59,92,.4)" }}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldAlert size={18} /> Show SOS on lock screen
      </h2>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 14px" }}>
        {allOk
          ? "All set — a family SOS will pop up full-screen on this phone's lock screen with the siren."
          : "On some phones the SOS only plays a siren + notification. Turn these on so it shows full-screen over the lock screen."}
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {st.sdk >= 34 && (
          <Row
            testid="sos-fsi-row"
            done={fsiOk}
            label={fsiOk ? "Full-screen alerts: allowed" : "Allow full-screen alerts"}
            hint={fsiOk ? undefined : "Android 14+: turn on “Full-screen notifications” for Nek Sathi"}
            onClick={fsiOk ? undefined : openFullScreenSettings}
          />
        )}
        <Row
          testid="sos-batt-row"
          done={battOk}
          label={battOk ? "Battery: unrestricted" : "Stop battery from killing alerts"}
          hint={battOk ? undefined : "Allow Nek Sathi to run without battery restriction"}
          onClick={battOk ? undefined : requestBatteryExempt}
        />
        <Row
          testid="sos-appinfo-row"
          done={false}
          label="Open app settings"
          hint={isPushyOem
            ? "Turn ON “Show on lock screen” + “Display pop-up in background” + Autostart"
            : "For “Show on lock screen” / background display toggles"}
          onClick={openAppInfo}
        />
      </div>
    </div>
  );
}
