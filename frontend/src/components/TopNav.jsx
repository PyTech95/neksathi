import { Link, useLocation, useNavigate } from "react-router-dom";
import { QrCode, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";

export default function TopNav() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isActive = (p) => loc.pathname === p;
  const [inboxTotal, setInboxTotal] = useState(0);

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
        {user && user.is_dealer ? (
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
            <Link to="/alerts" className={`nav-link ${isActive("/alerts") ? "active" : ""}`} data-testid="nav-alerts">Alerts</Link>
            <Link to="/incidents" className={`nav-link ${isActive("/incidents") ? "active" : ""}`} data-testid="nav-incidents">Incidents</Link>
            <Link to="/subscription" className={`nav-link ${isActive("/subscription") ? "active" : ""}`} data-testid="nav-plans">Plans</Link>
            <Link to="/support" className={`nav-link ${isActive("/support") ? "active" : ""}`} data-testid="nav-support">Support</Link>
            <Link to="/settings" className={`nav-link ${isActive("/settings") ? "active" : ""}`} data-testid="nav-settings">Settings</Link>
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
            <Link to="/login" className="nav-link" data-testid="nav-login">Login</Link>
            <Link to="/register" className="btn btn-primary btn-sm" data-testid="nav-register">Get Started</Link>
          </>
        )}
      </div>
    </nav>
  );
}
