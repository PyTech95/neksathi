import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { QrCode, CreditCard, Lock, MapPin, Bell, Clock, FileWarning, Users, LifeBuoy, Settings as SettingsIcon, ShieldAlert, Car, Package, Receipt, Gift } from "lucide-react";

const LINKS = [
  { to: "/dashboard", icon: Car, title: "Vehicles", desc: "QR stickers & tracking" },
  { to: "/tags", icon: QrCode, title: "Tags", desc: "Bags, pets & luggage" },
  { to: "/cards", icon: CreditCard, title: "Cards", desc: "Digital ICE cards" },
  { to: "/theft-protection", icon: Lock, title: "Anti-Theft", desc: "Lock, siren & intruder" },
  { to: "/safe-zones", icon: MapPin, title: "Safe Zones", desc: "Geo-fence alerts" },
  { to: "/alerts", icon: Bell, title: "Alerts", desc: "Your alert feed" },
  { to: "/circles", icon: Clock, title: "Temporary circles", desc: "Time-boxed sharing" },
  { to: "/incidents", icon: FileWarning, title: "Incidents", desc: "History & status" },
  { to: "/community", icon: Users, title: "Community", desc: "Local safety feed" },
  { to: "/subscription", icon: QrCode, title: "Plans", desc: "Upgrade your plan" },
  { to: "/orders", icon: Package, title: "My orders", desc: "QR orders & tracking" },
  { to: "/transactions", icon: Receipt, title: "Transactions", desc: "Payments & bills" },
  { to: "/referral", icon: Gift, title: "Refer & earn", desc: "Invite friends, get tokens" },
  { to: "/support", icon: LifeBuoy, title: "Support", desc: "Get help fast" },
  { to: "/settings", icon: SettingsIcon, title: "Settings", desc: "Account & preferences" },
];

export default function More() {
  const { user } = useAuth();
  return (
    <div className="page" data-testid="more-page" style={{ maxWidth: 900, margin: "0 auto", padding: "28px 18px 96px" }}>
      <span className="chip"><LayoutIconFallback /> More</span>
      <h1 style={{ fontSize: 30, marginTop: 12, marginBottom: 4 }}>All <span className="neon">tools</span></h1>
      <p className="muted" style={{ marginTop: 0 }}>Everything Nek Sathi can do, in one place.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
        {LINKS.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to} className="glass glass-hover" data-testid={`more-${title.toLowerCase().replace(/\s/g, "-")}`}
            style={{ padding: 16, borderRadius: 16, textDecoration: "none", color: "var(--text)", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", border: "1px solid rgba(233,37,70,.4)", color: "#ff5a74" }}>
              <Icon size={20} />
            </span>
            <b style={{ fontSize: 14.5 }}>{title}</b>
            <small className="muted" style={{ fontSize: 12 }}>{desc}</small>
          </Link>
        ))}
        {user?.is_admin && (
          <Link to="/admin" className="glass glass-hover" data-testid="more-admin" style={{ padding: 16, borderRadius: 16, textDecoration: "none", color: "var(--text)", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", border: "1px solid rgba(233,37,70,.4)", color: "#ff5a74" }}><ShieldAlert size={20} /></span>
            <b style={{ fontSize: 14.5 }}>Admin</b>
            <small className="muted" style={{ fontSize: 12 }}>Admin console</small>
          </Link>
        )}
      </div>

    </div>
  );
}

function LayoutIconFallback() {
  return <QrCode size={13} />;
}
