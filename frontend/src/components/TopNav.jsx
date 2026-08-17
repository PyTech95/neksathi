import { Link, useLocation, useNavigate } from "react-router-dom";
import { QrCode, LogOut, ChevronDown, School, HeartPulse, Briefcase } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import LiveAlarm from "@/components/LiveAlarm";

export default function TopNav() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isActive = (p) => loc.pathname === p;
  const [inboxTotal, setInboxTotal] = useState(0);
  const [solOpen, setSolOpen] = useState(false);

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
            <button className="btn btn-ghost btn-sm" data-testid="logout-btn" onClick={() => { logout(); nav("/"); }}>
              <LogOut size={15} /> Logout
            </button>
          </>
        ) : user && user.is_dealer ? (
          <>
            <Link to="/dealer" className="nav-link active" data-testid="nav-dealer">Dealer portal</Link>
            <button className="btn btn-ghost btn-sm" data-testid="logout-btn" onClick={() => { logout(); nav("/"); }}>
              <LogOut size={15} /> Logout
            </button>
          </>
        ) : user ? (
          <>
            <Link to="/dashboard" className={`nav-link ${isActive("/dashboard") ? "active" : ""}`} data-testid="nav-dashboard">Vehicles</Link>
            <Link to="/tags" className={`nav-link ${isActive("/tags") ? "active" : ""}`} data-testid="nav-tags">Tags</Link>
            <Link to="/cards" className={`nav-link ${isActive("/cards") ? "active" : ""}`} data-testid="nav-cards">Cards</Link>
            <Link to="/safety" className={`nav-link ${isActive("/safety") ? "active" : ""}`} data-testid="nav-safety" style={{ color: isActive("/safety") ? undefined : "#ff7591" }}>SOS</Link>
            <Link to="/community" className={`nav-link ${isActive("/community") ? "active" : ""}`} data-testid="nav-community">Community</Link>
            <Link to="/alerts" className={`nav-link ${isActive("/alerts") ? "active" : ""}`} data-testid="nav-alerts">Alerts</Link>
            <Link to="/incidents" className={`nav-link ${isActive("/incidents") ? "active" : ""}`} data-testid="nav-incidents">Incidents</Link>
            <Link to="/subscription" className={`nav-link ${isActive("/subscription") ? "active" : ""}`} data-testid="nav-plans">Plans</Link>
            <Link to="/support" className={`nav-link ${isActive("/support") ? "active" : ""}`} data-testid="nav-support">Support</Link>
            <Link to="/settings" className={`nav-link ${isActive("/settings") ? "active" : ""}`} data-testid="nav-settings" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span data-testid="nav-avatar" style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#22d3ee)", display: "grid", placeItems: "center", overflow: "hidden", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                {user.avatar_base64 ? <img src={user.avatar_base64} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (user.name?.[0] || "?")}
              </span>
              Settings
            </Link>
            <LiveAlarm />
            {user.is_admin && (
              <Link to="/admin" className={`nav-link ${isActive("/admin") ? "active" : ""}`} data-testid="nav-admin" style={{ display: "inline-flex", alignItems: "center" }}>
                Admin
                {inboxTotal > 0 && <span data-testid="nav-admin-badge" style={{ marginLeft: 6, background: "#ff3b5c", color: "#fff", borderRadius: 999, padding: "0 7px", fontSize: 11, fontWeight: 700, lineHeight: "18px" }}>{inboxTotal}</span>}
              </Link>
            )}
            <button className="btn btn-ghost btn-sm" data-testid="logout-btn" onClick={() => { logout(); nav("/"); }}>
              <LogOut size={15} /> Logout
            </button>
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
