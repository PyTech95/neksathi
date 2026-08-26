import { Link, useLocation, useNavigate } from "react-router-dom";
import { QrCode, LogOut, ChevronDown, School, HeartPulse, Briefcase, ShieldAlert, Users, Car, MoreHorizontal, Settings as SettingsIcon, Siren, Lock, MapPin, Bell, FileWarning, LifeBuoy, CreditCard, Menu, X, ScanLine, Clock, Building2, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import LiveAlarm from "@/components/LiveAlarm";
import FamilyAlarm from "@/components/FamilyAlarm";
import IncomingCall from "@/components/IncomingCall";

const dropItem = { display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10, fontSize: 14 };

const PRODUCT_SOLUTIONS = [
  { to: "/#personal-safety", icon: <LifeBuoy size={18} />, title: "Personal Safety", desc: "One-tap SOS, siren & live location", accent: "#22d3ee", tid: "sol-personal" },
  { to: "/#family-guardian", icon: <Users size={18} />, title: "Family Guardian", desc: "Live map, place & check-in alerts", accent: "#8b5cf6", tid: "sol-family" },
  { to: "/#anti-theft", icon: <Lock size={18} />, title: "Anti-Theft & Mobile Security", desc: "Lock, siren, intruder selfie, SIM alert", accent: "#ff3b5c", tid: "sol-antitheft" },
  { to: "/#smart-qr", icon: <QrCode size={18} />, title: "Smart QR", desc: "Scan-to-alert tags for cars, kids & bags", accent: "#2dd4bf", tid: "sol-smartqr" },
];
const ORG_SOLUTIONS = [
  { to: "/for/schools", icon: <School size={18} />, title: "For Schools", desc: "Smart student ID tags", tid: "sol-schools" },
  { to: "/for/hospitals", icon: <HeartPulse size={18} />, title: "For Hospitals & Care", desc: "ICE wristbands & tags", tid: "sol-hospitals" },
  { to: "/for/offices", icon: <Briefcase size={18} />, title: "For Offices", desc: "Recoverable staff assets", tid: "sol-offices" },
];
const ASSET_LINKS = [
  { to: "/dashboard", icon: <Car size={18} />, title: "Vehicles", desc: "QR stickers & tracking", accent: "#2dd4bf", tid: "nav-a-vehicles" },
  { to: "/tags", icon: <QrCode size={18} />, title: "Tags", desc: "Bags, pets & luggage", accent: "#22d3ee", tid: "nav-a-tags" },
  { to: "/cards", icon: <CreditCard size={18} />, title: "Cards", desc: "Digital ICE cards", accent: "#8b5cf6", tid: "nav-a-cards" },
  { to: "/theft-protection", icon: <Lock size={18} />, title: "Anti-Theft", desc: "Lock, siren & intruder", accent: "#ff3b5c", tid: "nav-a-theft" },
  { to: "/safe-zones", icon: <MapPin size={18} />, title: "Safe Zones", desc: "Geo-fence alerts", accent: "#22d3ee", tid: "nav-a-zones" },
];
const MORE_LINKS = [
  { to: "/alerts", icon: <Bell size={18} />, title: "Alerts", desc: "Your alert feed", accent: "#f5a524", tid: "nav-m-alerts" },
  { to: "/circles", icon: <Clock size={18} />, title: "Temporary circles", desc: "Time-boxed sharing", accent: "#8b5cf6", tid: "nav-m-circles" },
  { to: "/incidents", icon: <FileWarning size={18} />, title: "Incidents", desc: "History & status", accent: "#ff3b5c", tid: "nav-m-incidents" },
  { to: "/community", icon: <Users size={18} />, title: "Community", desc: "Local safety feed", accent: "#22d3ee", tid: "nav-m-community" },
  { to: "/subscription", icon: <QrCode size={18} />, title: "Plans", desc: "Upgrade your plan", accent: "#2dd4bf", tid: "nav-m-plans" },
  { to: "/support", icon: <LifeBuoy size={18} />, title: "Support", desc: "Get help fast", accent: "#8b5cf6", tid: "nav-m-support" },
];

export default function TopNav() {  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const isActive = (p) => loc.pathname === p;
  const [inboxTotal, setInboxTotal] = useState(0);
  const [menu, setMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    <nav className={`topnav${scrolled ? " scrolled" : ""}`} data-testid="top-nav">
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
              <button className={`nav-link ${menu === "assets" ? "active" : ""}`} onClick={() => setMenu((m) => m === "assets" ? null : "assets")} data-testid="nav-assets-btn" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer" }}>
                <Car size={15} /> Vehicle & QR <ChevronDown size={14} style={{ transition: "transform .25s ease", transform: menu === "assets" ? "rotate(180deg)" : "none" }} />
              </button>
              {menu === "assets" && (
                <div className="glass solutions-mega" data-testid="nav-assets-menu" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 280, padding: 12, zIndex: 90, borderRadius: 16 }}>
                  <div className="sol-group-title"><Car size={13} /> Vehicle & QR</div>
                  {ASSET_LINKS.map((s) => (
                    <Link key={s.tid} to={s.to} className="sol-item" data-testid={s.tid} onClick={() => setMenu(null)}>
                      <span className="sol-ico" style={{ color: s.accent, background: `${s.accent}22`, borderColor: `${s.accent}55` }}>{s.icon}</span>
                      <span className="sol-text"><b>{s.title}</b><small>{s.desc}</small></span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* More group */}
            <div className="nav-drop" style={{ position: "relative" }} data-testid="nav-more">
              <button className={`nav-link ${menu === "more" ? "active" : ""}`} onClick={() => setMenu((m) => m === "more" ? null : "more")} data-testid="nav-more-btn" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer" }}>
                <MoreHorizontal size={15} /> More <ChevronDown size={14} style={{ transition: "transform .25s ease", transform: menu === "more" ? "rotate(180deg)" : "none" }} />
              </button>
              {menu === "more" && (
                <div className="glass solutions-mega" data-testid="nav-more-menu" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 280, padding: 12, zIndex: 90, borderRadius: 16 }}>
                  <div className="sol-group-title"><MoreHorizontal size={13} /> More tools</div>
                  {MORE_LINKS.map((s) => (
                    <Link key={s.tid} to={s.to} className="sol-item" data-testid={s.tid} onClick={() => setMenu(null)}>
                      <span className="sol-ico" style={{ color: s.accent, background: `${s.accent}22`, borderColor: `${s.accent}55` }}>{s.icon}</span>
                      <span className="sol-text"><b>{s.title}</b><small>{s.desc}</small></span>
                    </Link>
                  ))}
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
            <div className="nav-drop" style={{ position: "relative" }} data-testid="nav-solutions">
              <button className={`nav-link ${menu === "solutions" ? "active" : ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }} onClick={() => setMenu((m) => m === "solutions" ? null : "solutions")} data-testid="nav-solutions-btn">
                Solutions <ChevronDown size={14} style={{ transition: "transform .25s ease", transform: menu === "solutions" ? "rotate(180deg)" : "none" }} />
              </button>
              {menu === "solutions" && (
                <div className="glass solutions-mega" data-testid="solutions-menu" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 560, padding: 16, zIndex: 80, borderRadius: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                  <div>
                    <div className="sol-group-title">By what you protect</div>
                    {PRODUCT_SOLUTIONS.map((s) => (
                      <a key={s.tid} href={s.to} className="sol-item" data-testid={`nav-${s.tid}`} onClick={() => setMenu(null)}>
                        <span className="sol-ico" style={{ color: s.accent, background: `${s.accent}22`, borderColor: `${s.accent}55` }}>{s.icon}</span>
                        <span className="sol-text"><b>{s.title}</b><small>{s.desc}</small></span>
                      </a>
                    ))}
                  </div>
                  <div style={{ borderLeft: "1px solid var(--panel-brd)", paddingLeft: 18 }}>
                    <div className="sol-group-title"><Building2 size={13} /> For organisations</div>
                    {ORG_SOLUTIONS.map((s) => (
                      <Link key={s.tid} to={s.to} className="sol-item" data-testid={`nav-${s.tid}`} onClick={() => setMenu(null)}>
                        <span className="sol-ico" style={{ color: "#c9b6ff", background: "rgba(124,58,237,.16)", borderColor: "rgba(124,58,237,.4)" }}>{s.icon}</span>
                        <span className="sol-text"><b>{s.title}</b><small>{s.desc}</small></span>
                      </Link>
                    ))}
                    <Link to="/contact" className="sol-cta" data-testid="nav-sol-contact" onClick={() => setMenu(null)}>
                      Talk to us about bulk orders <ArrowRight size={14} />
                    </Link>
                  </div>
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
      {mobileOpen && createPortal(
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
                  <div className="mobile-drawer-sep">Solutions</div>
                  <a href="/#personal-safety" data-testid="m-sol-personal" onClick={() => setMobileOpen(false)}><LifeBuoy size={18} /> Personal Safety</a>
                  <a href="/#family-guardian" data-testid="m-sol-family" onClick={() => setMobileOpen(false)}><Users size={18} /> Family Guardian</a>
                  <a href="/#anti-theft" data-testid="m-sol-antitheft" onClick={() => setMobileOpen(false)}><Lock size={18} /> Anti-Theft & Mobile Security</a>
                  <a href="/#smart-qr" data-testid="m-sol-smartqr" onClick={() => setMobileOpen(false)}><QrCode size={18} /> Smart QR</a>
                  <div className="mobile-drawer-sep">For organisations</div>
                  <Link to="/for/schools" data-testid="m-schools"><School size={18} /> For Schools</Link>
                  <Link to="/for/hospitals" data-testid="m-hospitals"><HeartPulse size={18} /> For Hospitals & Care</Link>
                  <Link to="/for/offices" data-testid="m-offices"><Briefcase size={18} /> For Offices</Link>
                  <Link to="/scan/45805f3a-f10a-4534-bc7d-29699029b2cf" data-testid="m-demo"><ScanLine size={18} /> Emergency? Try live demo</Link>
                  <Link to="/login" data-testid="m-login">Login</Link>
                  <Link to="/register" className="btn btn-primary" data-testid="m-register" style={{ justifyContent: "center", marginTop: 8, color: "#fff" }}><QrCode size={18} /> Launch Nek Sathi</Link>
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </nav>
  );
}
