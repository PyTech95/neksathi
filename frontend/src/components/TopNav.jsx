import { Link, useLocation, useNavigate } from "react-router-dom";
import { QrCode, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function TopNav() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isActive = (p) => loc.pathname === p;

  return (
    <nav className="topnav" data-testid="top-nav">
      <Link to="/" className="brand" data-testid="brand-link">
        <span className="brand-badge"><QrCode size={20} /></span>
        Nek<span className="neon">&nbsp;Sathi</span>
      </Link>
      <div className="nav-links">
        {user ? (
          <>
            <Link to="/dashboard" className={`nav-link ${isActive("/dashboard") ? "active" : ""}`} data-testid="nav-dashboard">Vehicles</Link>
            <Link to="/tags" className={`nav-link ${isActive("/tags") ? "active" : ""}`} data-testid="nav-tags">Tags</Link>
            <Link to="/cards" className={`nav-link ${isActive("/cards") ? "active" : ""}`} data-testid="nav-cards">Cards</Link>
            <Link to="/alerts" className={`nav-link ${isActive("/alerts") ? "active" : ""}`} data-testid="nav-alerts">Alerts</Link>
            <Link to="/incidents" className={`nav-link ${isActive("/incidents") ? "active" : ""}`} data-testid="nav-incidents">Incidents</Link>
            <Link to="/subscription" className={`nav-link ${isActive("/subscription") ? "active" : ""}`} data-testid="nav-plans">Plans</Link>
            {user.is_admin && (
              <Link to="/admin" className={`nav-link ${isActive("/admin") ? "active" : ""}`} data-testid="nav-admin">Admin</Link>
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
