import { Link, useLocation, useNavigate } from "react-router-dom";
import { QrCode, LogOut, ChevronDown, School, HeartPulse, Briefcase, ShieldAlert, Users, Car, MoreHorizontal, Settings as SettingsIcon, Siren, Lock, MapPin, Bell, FileWarning, LifeBuoy, CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import LiveAlarm from "@/components/LiveAlarm";
import FamilyAlarm from "@/components/FamilyAlarm";

const dropItem = { display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10, fontSize: 14 };

export default function TopNav() {  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isActive = (p) => loc.pathname === p;
  const [inboxTotal, setInboxTotal] = useState(0);
  const [solOpen, setSolOpen] = useState(false);
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    const h = (e) => { if (!e.target.closest(".nav-drop")) setMenu(null); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  useEffect(() => {
    if (user?.is_admin) {
      api.get("/admin/inbox/summary").then((r) => setInboxTotal(r.data.total || 0)).catch(() => {});
    } else {
      setInboxTotal(0);
    }
  }, [user, loc.pathname]);

  return (
    <nav className="topnav" data-testid="top-nav">
      <Link to="/" className="brand" data-testid="brand-link">
        <span className="brand-badge"><QrCode size={20} /></span>
        Nek<span className="neon">&nbsp;Sathi</span>
      </Link>
      <div className="nav-links">
        {user && user.is_org ? (
          <>
            <Link to="/org" className="nav-link active" data-testid="nav-org">Organization portal</Link>
            <button className="btn btn-ghost btn-sm" data-testid="logout-btn-org" onClick={() => { logout(); nav("/"); }}>
              <LogOut size={15} /> Logout
            </button>
          </>
        ) : user && user.is_dealer ? (
          <>
            <Link to="/dealer" className="nav-link active" data-testid="nav-dealer">Dealer portal</Link>
            <button className="btn btn-ghost btn-sm" data-testid="logout-btn-dealer" onClick={() => { logout(); nav("/"); }}>
              <LogOut size={15} /> Logout
            </button>
          </>
        ) : user ? (
          <>
            <Link to="/dashboard" className={`nav-link ${isActive("/dashboard") ? "active" : ""}`} data-testid="nav-dashboard">Home</Link>
            <Link to="/safety" className={`nav-link ${isActive("/safety") ? "active" : ""}`} data-testid="nav-safety" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#ff7591", fontWeight: 700 }}><Siren size={15} /> SOS</Link>
            <Link to="/family" className={`nav-link ${isActive("/family") ? "active" : ""}`} data-testid="nav-family" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Users size={15} /> Family</Link>

            {/* Vehicle & QR group */}
            <div className="nav-drop" style={{ position: "relative" }} data-testid="nav-assets">
              <button className="nav-link" onClick={() => setMenu((m) => m === "assets" ? null : "assets")} data-testid="nav-assets-btn" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer" }}>
                <Car size={15} /> Vehicle & QR <ChevronDown size={14} />
              </button>
              {menu === "assets" && (
                <div className="glass" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 220, padding: 8, zIndex: 90, borderRadius: 14 }}>
                  <Link to="/dashboard" className="nav-link" data-testid="nav-a-vehicles" style={dropItem} onClick={() => setMenu(null)}><Car size={16} /> Vehicles</Link>
                  <Link to="/tags" className="nav-link" data-testid="nav-a-tags" style={dropItem} onClick={() => setMenu(null)}><QrCode size={16} /> Tags</Link>
                  <Link to="/cards" className="nav-link" data-testid="nav-a-cards" style={dropItem} onClick={() => setMenu(null)}><CreditCard size={16} /> Cards</Link>
                  <Link to="/theft-protection" className="nav-link" data-testid="nav-a-theft" style={dropItem} onClick={() => setMenu(null)}><Lock size={16} /> Anti-Theft</Link>
                  <Link to="/safe-zones" className="nav-link" data-testid="nav-a-zones" style={dropItem} onClick={() => setMenu(null)}><MapPin size={16} /> Safe Zones</Link>
                </div>
              )}
            </div>

            {/* More group */}
            <div className="nav-drop" style={{ position: "relative" }} data-testid="nav-more">
              <button className="nav-link" onClick={() => setMenu((m) => m === "more" ? null : "more")} data-testid="nav-more-btn" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer" }}>
                <MoreHorizontal size={15} /> More <ChevronDown size={14} />
              </button>
              {menu === "more" && (
                <div className="glass" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 220, padding: 8, zIndex: 90, borderRadius: 14 }}>
                  <Link to="/alerts" className="nav-link" data-testid="nav-m-alerts" style={dropItem} onClick={() => setMenu(null)}><Bell size={16} /> Alerts</Link>
                  <Link to="/incidents" className="nav-link" data-testid="nav-m-incidents" style={dropItem} onClick={() => setMenu(null)}><FileWarning size={16} /> Incidents</Link>
                  <Link to="/community" className="nav-link" data-testid="nav-m-community" style={dropItem} onClick={() => setMenu(null)}><Users size={16} /> Community</Link>
                  <Link to="/subscription" className="nav-link" data-testid="nav-m-plans" style={dropItem} onClick={() => setMenu(null)}><QrCode size={16} /> Plans</Link>
                  <Link to="/support" className="nav-link" data-testid="nav-m-support" style={dropItem} onClick={() => setMenu(null)}><LifeBuoy size={16} /> Support</Link>
                </div>
              )}
            </div>

            {user.is_admin && (
              <Link to="/admin" className={`nav-link ${isActive("/admin") ? "active" : ""}`} data-testid="nav-admin" style={{ display: "inline-flex", alignItems: "center" }}>
                Admin
                {inboxTotal > 0 && <span data-testid="nav-admin-badge" style={{ marginLeft: 6, background: "#ff3b5c", color: "#fff", borderRadius: 999, padding: "0 7px", fontSize: 11, fontWeight: 700, lineHeight: "18px" }}>{inboxTotal}</span>}
              </Link>
            )}

            {/* Avatar → account menu */}
            <div className="nav-drop" style={{ position: "relative" }} data-testid="nav-account">
              <button className="nav-link" onClick={() => setMenu((m) => m === "account" ? null : "account")} data-testid="nav-account-btn" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer" }}>
                <span data-testid="nav-avatar" style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#22d3ee)", display: "grid", placeItems: "center", overflow: "hidden", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {user.avatar_base64 ? <img src={user.avatar_base64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (user.name?.[0] || "?")}
                </span>
                <ChevronDown size={14} />
              </button>
              {menu === "account" && (
                <div className="glass" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 200, padding: 8, zIndex: 90, borderRadius: 14 }}>
                  <div style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--muted)", borderBottom: "1px solid var(--panel-brd)", marginBottom: 4 }}>Signed in as <b style={{ color: "#d9c9ff" }}>{user.name || "you"}</b></div>
                  <Link to="/settings" className="nav-link" data-testid="nav-settings" style={dropItem} onClick={() => setMenu(null)}><SettingsIcon size={16} /> Settings</Link>
                  <button className="nav-link" data-testid="logout-btn" style={{ ...dropItem, width: "100%", background: "none", border: "none", cursor: "pointer", color: "#ff7591" }} onClick={() => { setMenu(null); logout(); nav("/"); }}><LogOut size={16} /> Logout</button>
                </div>
              )}
            </div>

            <LiveAlarm />
            <FamilyAlarm />
          </>
        ) : (
          <>
            <div style={{ position: "relative" }} onMouseEnter={() => setSolOpen(true)} onMouseLeave={() => setSolOpen(false)} data-testid="nav-solutions">
              <button className="nav-link" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }} onClick={() => setSolOpen((s) => !s)} data-testid="nav-solutions-btn">
                Solutions <ChevronDown size={14} />
              </button>
              {solOpen && (
                <div className="glass" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 240, padding: 8, zIndex: 80, borderRadius: 14 }}>
                  <Link to="/for/schools" className="nav-link" data-testid="nav-sol-schools" style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10 }} onClick={() => setSolOpen(false)}><School size={16} /> For Schools</Link>
                  <Link to="/for/hospitals" className="nav-link" data-testid="nav-sol-hospitals" style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10 }} onClick={() => setSolOpen(false)}><HeartPulse size={16} /> For Hospitals</Link>
                  <Link to="/for/offices" className="nav-link" data-testid="nav-sol-offices" style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10 }} onClick={() => setSolOpen(false)}><Briefcase size={16} /> For Offices</Link>
                </div>
              )}
            </div>
            <Link to="/login" className="nav-link" data-testid="nav-login">Login</Link>
            <Link to="/register" className="btn btn-primary btn-sm" data-testid="nav-register">Get Started</Link>
          </>
        )}
      </div>
    </nav>
  );
}
