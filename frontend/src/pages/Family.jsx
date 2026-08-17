import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { loadLeaflet } from "@/lib/leaflet";
import { Users, ShieldCheck, Copy, CheckCircle2, LogOut, UserMinus, MapPin, BatteryMedium, Activity, Loader2, Crown, Eye, EyeOff, LocateFixed, Clock, Smartphone, LogIn } from "lucide-react";

function fmtSecs(s) { if (!s) return "0m"; const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }

function MemberActivity({ memberId }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/family/members/${memberId}/activity`).then((r) => setD(r.data)).catch(() => setD({ shared: false, items: [] })); }, [memberId]);
  if (!d) return <div style={{ padding: 12 }}><Loader2 className="spin" size={16} /></div>;
  if (!d.shared) return <p className="muted" style={{ fontSize: 13, padding: "8px 0" }} data-testid="activity-not-shared">This member isn't sharing activity.</p>;
  const totals = Object.entries(d.today_totals || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div data-testid="member-activity" style={{ marginTop: 10 }}>
      {totals.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Today's screen time</div>
          {totals.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
              <span>{k}</span><span style={{ fontWeight: 700 }}>{fmtSecs(v)}</span>
            </div>
          ))}
        </div>
      )}
      {d.items.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>No activity reported yet (the mobile app sends this).</p> : (
        <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {d.items.slice(0, 20).map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span>{a.type === "app_usage" ? `📱 ${a.app_name || "App"}` : a.type === "screen_time" ? "⏱ Screen time" : a.type === "checkin" ? `📍 ${a.note || "Check-in"}` : a.type === "battery" ? `🔋 ${a.battery}%` : a.type}{a.seconds ? ` · ${fmtSecs(a.seconds)}` : ""}</span>
              <span className="muted">{new Date(a.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Family() {
  const [data, setData] = useState(null);
  const [placeEvents, setPlaceEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openMember, setOpenMember] = useState(null);
  const mapEl = useRef(null); const mapObj = useRef(null); const layer = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = (await api.get("/family")).data;
      setData(d);
      if (d.in_family) { try { setPlaceEvents((await api.get("/family/place-events")).data.items || []); } catch (_) {} }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!data?.in_family) return;
    const pts = data.members.filter((m) => m.latitude != null);
    if (!pts.length) return;
    loadLeaflet().then((L) => {
      if (!mapEl.current) return;
      if (!mapObj.current) {
        mapObj.current = L.map(mapEl.current, { zoomControl: true }).setView([pts[0].latitude, pts[0].longitude], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapObj.current);
      }
      if (layer.current) layer.current.remove();
      layer.current = L.layerGroup().addTo(mapObj.current);
      pts.forEach((m) => L.marker([m.latitude, m.longitude]).addTo(layer.current).bindPopup(`<b>${m.name}</b>${m.battery != null ? `<br/>🔋 ${m.battery}%` : ""}`));
      if (pts.length > 1) mapObj.current.fitBounds(pts.map((m) => [m.latitude, m.longitude]), { padding: [40, 40] });
    });
  }, [data]);

  const create = async () => { setBusy(true); setErr(""); try { await api.post("/family", { name }); await load(); } catch (e) { setErr(e?.response?.data?.detail || "Could not create."); } finally { setBusy(false); } };
  const join = async () => { setBusy(true); setErr(""); try { await api.post("/family/join", { invite_code: code }); await load(); } catch (e) { setErr(e?.response?.data?.detail || "Could not join."); } finally { setBusy(false); } };
  const leave = async () => { if (!window.confirm(data.is_guardian ? "Leaving dissolves the whole circle. Continue?" : "Leave the family circle?")) return; await api.post("/family/leave"); load(); };
  const removeMember = async (id) => { if (!window.confirm("Remove this member?")) return; await api.delete(`/family/members/${id}`); load(); };
  const copyCode = () => { navigator.clipboard.writeText(data.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const setSharing = async (key, val) => { await api.put("/family/my-sharing", { share_location: key === "loc" ? val : me.share_location, share_activity: key === "act" ? val : me.share_activity }); load(); };
  const shareStatus = async () => {
    let batt = null;
    try { if (navigator.getBattery) { const b = await navigator.getBattery(); batt = Math.round(b.level * 100); } } catch (_) {}
    navigator.geolocation.getCurrentPosition(async (p) => { await api.post("/me/status", { latitude: p.coords.latitude, longitude: p.coords.longitude, battery: batt }); load(); }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
  };

  if (loading) return <div className="page" style={{ padding: 40 }}><div className="spinner" data-testid="family-loading" /></div>;
  const me = data.in_family ? data.members.find((m) => m.is_me) : null;

  return (
    <div className="page" data-testid="family-page" style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 80px" }}>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <Users size={26} className="neon" /><h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Family Guardian</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>A guardian keeps up to {data.max_members || 5} members safe — live location, battery and day-to-day activity in one circle.</p>

      {!data.in_family ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="family-start">
          <div className="glass card-pad" style={{ padding: 24 }} data-testid="family-create-card">
            <Crown size={22} style={{ color: "#f5a524" }} /><h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>Create a circle</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>You'll be the guardian and can invite family members.</p>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Family name e.g. Sharma Family" data-testid="family-name-input" style={{ marginBottom: 10 }} />
            <button className="btn btn-primary btn-block" onClick={create} disabled={busy || !name.trim()} data-testid="family-create-btn">{busy ? <Loader2 className="spin" size={16} /> : "Create circle"}</button>
          </div>
          <div className="glass card-pad" style={{ padding: 24 }} data-testid="family-join-card">
            <Users size={22} className="neon" /><h2 style={{ fontSize: 18, margin: "8px 0 4px" }}>Join a circle</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Enter the invite code your guardian shared.</p>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Invite code" data-testid="family-code-input" style={{ marginBottom: 10 }} />
            <button className="btn btn-primary btn-block" onClick={join} disabled={busy || !code.trim()} data-testid="family-join-btn">{busy ? <Loader2 className="spin" size={16} /> : "Join circle"}</button>
          </div>
          {err && <p style={{ color: "#ff7591", fontSize: 13, gridColumn: "1/-1" }} data-testid="family-error">{err}</p>}
        </div>
      ) : (
        <>
          <div className="glass" style={{ padding: "14px 18px", borderRadius: 14, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div><div style={{ fontWeight: 800, fontSize: 18 }}>{data.name}</div><div className="muted" style={{ fontSize: 12.5 }}>{data.members.length}/{data.max_members} members{data.is_guardian ? " · You are the guardian" : ""}</div></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {data.is_guardian && data.invite_code && (
                <button className="btn btn-ghost btn-sm" onClick={copyCode} data-testid="family-invite-copy">{copied ? <><CheckCircle2 size={14} /> Copied</> : <><Copy size={14} /> Invite code: {data.invite_code}</>}</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={shareStatus} data-testid="family-share-status"><LocateFixed size={14} /> Share my status</button>
              <button className="btn btn-danger btn-sm" onClick={leave} data-testid="family-leave-btn"><LogOut size={14} /> Leave</button>
            </div>
          </div>

          {data.members.some((m) => m.latitude != null) && (
            <div ref={mapEl} data-testid="family-map" style={{ height: 300, borderRadius: 14, overflow: "hidden", border: "1px solid var(--panel-brd)", marginBottom: 16 }} />
          )}

          {me && (
            <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, marginBottom: 16, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }} data-testid="family-privacy">
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>My privacy:</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }} onClick={() => setSharing("loc", !me.share_location)} data-testid="toggle-share-location">{me.share_location ? <Eye size={15} className="neon" /> : <EyeOff size={15} className="muted" />} Share location</label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }} onClick={() => setSharing("act", !me.share_activity)} data-testid="toggle-share-activity">{me.share_activity ? <Eye size={15} className="neon" /> : <EyeOff size={15} className="muted" />} Share activity</label>
            </div>
          )}

          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Members</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {data.members.map((m) => (
              <div key={m.member_id} data-testid={`member-${m.member_id}`} className="glass" style={{ padding: 14, borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#22d3ee)", display: "grid", placeItems: "center", fontWeight: 800, color: "#fff" }}>{m.name?.[0]?.toUpperCase() || "?"}</span>
                    <div>
                      <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>{m.name} {m.role === "guardian" && <Crown size={14} style={{ color: "#f5a524" }} />}{m.is_me && <span className="muted" style={{ fontSize: 12 }}>(you)</span>}</div>
                      <div className="muted" style={{ fontSize: 12.5, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {m.battery != null && <span><BatteryMedium size={12} style={{ verticalAlign: "-2px" }} /> {m.battery}%</span>}
                        {m.last_seen && <span><Clock size={12} style={{ verticalAlign: "-2px" }} /> {new Date(m.last_seen).toLocaleTimeString()}</span>}
                        {m.latitude == null && <span>No location shared</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {m.latitude != null && <a className="btn btn-ghost btn-sm" href={`https://maps.google.com/?q=${m.latitude},${m.longitude}`} target="_blank" rel="noreferrer" data-testid={`member-map-${m.member_id}`}><MapPin size={14} /></a>}
                    {(data.is_guardian || m.is_me) && <button className="btn btn-ghost btn-sm" onClick={() => setOpenMember(openMember === m.member_id ? null : m.member_id)} data-testid={`member-activity-btn-${m.member_id}`}><Activity size={14} /> Activity</button>}
                    {data.is_guardian && m.role !== "guardian" && <button className="btn btn-ghost btn-sm" onClick={() => removeMember(m.member_id)} data-testid={`member-remove-${m.member_id}`}><UserMinus size={14} /></button>}
                  </div>
                </div>
                {openMember === m.member_id && <MemberActivity memberId={m.member_id} />}
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 18, margin: "26px 0 12px", display: "flex", alignItems: "center", gap: 8 }}><MapPin size={17} className="neon" /> Place alerts</h2>
          {placeEvents.length === 0 ? (
            <p className="muted" data-testid="place-events-empty" style={{ textAlign: "center", padding: "14px 0", fontSize: 13.5 }}>No place activity yet. When a member enters or leaves a safe zone, it appears here.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }} data-testid="place-events-timeline">
              {placeEvents.map((e) => (
                <div key={e.id} data-testid={`place-event-${e.id}`} className="glass" style={{ padding: "11px 14px", borderRadius: 11, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", flexShrink: 0, background: e.type === "enter" ? "rgba(52,211,153,.14)" : "rgba(245,165,36,.14)", color: e.type === "enter" ? "#34d399" : "#f5a524" }}>{e.type === "enter" ? <LogIn size={16} /> : <LogOut size={16} />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}><b>{e.member_name}</b> {e.type === "enter" ? "arrived at" : "left"} <b>{e.zone_name}</b></div>
                    <div className="muted" style={{ fontSize: 12 }}>{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <style>{`@media(max-width:640px){.family-start{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
