import { Link, useLocation, useNavigate } from "react-router-dom";
import { QrCode, LogOut, ChevronDown, School, HeartPulse, Briefcase, ShieldAlert, Users, Car, MoreHorizontal, Settings as SettingsIcon, Siren, Lock, MapPin, Bell, FileWarning, LifeBuoy, CreditCard, Menu, X, ScanLine, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import LiveAlarm from "@/components/LiveAlarm";
import FamilyAlarm from "@/components/FamilyAlarm";
import IncomingCall from "@/components/IncomingCall";

const dropItem = { display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10, fontSize: 14 };

export default function TopNav() {  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isActive = (p) => loc.pathname === p;
  const [inboxTotal, setInboxTotal] = useState(0);
  const [solOpen, setSolOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

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
      <div className="nav-links nav-desktop">
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
                  <Link to="/circles" className="nav-link" data-testid="nav-m-circles" style={dropItem} onClick={() => setMenu(null)}><Clock size={16} /> Temporary circles</Link>
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
            <IncomingCall />
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

      {/* Mobile hamburger */}
      <button className="nav-hamburger" data-testid="mobile-menu-btn" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
        <Menu size={22} />
      </button>
      {mobileOpen && (
        <>
          <div className="mobile-overlay" data-testid="mobile-overlay" onClick={() => setMobileOpen(false)} />
          <div className="mobile-drawer" data-testid="mobile-drawer">
            <div className="mobile-drawer-head">
              <span className="brand" style={{ fontSize: 18 }}><span className="brand-badge"><QrCode size={18} /></span>Nek<span className="neon">&nbsp;Sathi</span></span>
              <button aria-label="Close menu" data-testid="mobile-close-btn" onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer" }}><X size={22} /></button>
            </div>
            <div className="mobile-drawer-body">
              {user && user.is_org ? (
                <>
                  <Link to="/org" data-testid="m-org">Organization portal</Link>
                  <button data-testid="m-logout" onClick={() => { setMobileOpen(false); logout(); nav("/"); }}><LogOut size={18} /> Logout</button>
                </>
              ) : user && user.is_dealer ? (
                <>
                  <Link to="/dealer" data-testid="m-dealer">Dealer portal</Link>
                  <button data-testid="m-logout" onClick={() => { setMobileOpen(false); logout(); nav("/"); }}><LogOut size={18} /> Logout</button>
                </>
              ) : user ? (
                <>
                  <Link to="/dashboard" data-testid="m-home">Home</Link>
                  <Link to="/safety" data-testid="m-safety" style={{ color: "#ff7591" }}><Siren size={18} /> SOS</Link>
                  <Link to="/family" data-testid="m-family"><Users size={18} /> Family</Link>
                  <div className="mobile-drawer-sep">Vehicle & QR</div>
                  <Link to="/tags" data-testid="m-tags"><QrCode size={18} /> Tags</Link>
                  <Link to="/cards" data-testid="m-cards"><CreditCard size={18} /> Cards</Link>
                  <Link to="/theft-protection" data-testid="m-theft"><Lock size={18} /> Anti-Theft</Link>
                  <Link to="/safe-zones" data-testid="m-zones"><MapPin size={18} /> Safe Zones</Link>
                  <div className="mobile-drawer-sep">More</div>
                  <Link to="/alerts" data-testid="m-alerts"><Bell size={18} /> Alerts</Link>
                  <Link to="/circles" data-testid="m-circles"><Clock size={18} /> Temporary circles</Link>
                  <Link to="/incidents" data-testid="m-incidents"><FileWarning size={18} /> Incidents</Link>
                  <Link to="/community" data-testid="m-community"><Users size={18} /> Community</Link>
                  <Link to="/subscription" data-testid="m-plans"><QrCode size={18} /> Plans</Link>
                  <Link to="/support" data-testid="m-support"><LifeBuoy size={18} /> Support</Link>
                  <Link to="/settings" data-testid="m-settings"><SettingsIcon size={18} /> Settings</Link>
                  {user.is_admin && <Link to="/admin" data-testid="m-admin"><ShieldAlert size={18} /> Admin{inboxTotal > 0 ? ` (${inboxTotal})` : ""}</Link>}
                  <button data-testid="m-logout" style={{ color: "#ff7591" }} onClick={() => { setMobileOpen(false); logout(); nav("/"); }}><LogOut size={18} /> Logout</button>
                </>
              ) : (
                <>
                  <Link to="/for/schools" data-testid="m-schools"><School size={18} /> For Schools</Link>
                  <Link to="/for/hospitals" data-testid="m-hospitals"><HeartPulse size={18} /> For Hospitals</Link>
                  <Link to="/for/offices" data-testid="m-offices"><Briefcase size={18} /> For Offices</Link>
                  <Link to="/scan/45805f3a-f10a-4534-bc7d-29699029b2cf" data-testid="m-demo"><ScanLine size={18} /> Emergency? Try live demo</Link>
                  <Link to="/login" data-testid="m-login">Login</Link>
                  <Link to="/register" className="btn btn-primary" data-testid="m-register" style={{ justifyContent: "center", marginTop: 8, color: "#fff" }}><QrCode size={18} /> Launch Nek Sathi</Link>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
