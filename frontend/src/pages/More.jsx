import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useT } from "@/lib/i18n";
import { QrCode, CreditCard, Lock, MapPin, Bell, Users, LifeBuoy, Settings as SettingsIcon, ShieldAlert, Car, Package, Receipt, Gift } from "lucide-react";

// `title` stays English (used for the data-testid); tkey/dkey drive the display.
const LINKS = [
  { to: "/dashboard", icon: Car, title: "Vehicles", tkey: "more.vehicles", dkey: "more.vehicles.sub" },
  { to: "/tags", icon: QrCode, title: "Tags", tkey: "more.tags", dkey: "more.tags.sub" },
  { to: "/cards", icon: CreditCard, title: "Cards", tkey: "more.cards", dkey: "more.cards.sub" },
  { to: "/theft-protection", icon: Lock, title: "Anti-Theft", tkey: "more.antitheft", dkey: "more.antitheft.sub" },
  { to: "/safe-zones", icon: MapPin, title: "Safe Zones", tkey: "more.zones", dkey: "more.zones.sub" },
  { to: "/alerts", icon: Bell, title: "Alerts", tkey: "more.alerts", dkey: "more.alerts.sub" },
  { to: "/community", icon: Users, title: "Community", tkey: "more.community", dkey: "more.community.sub" },
  { to: "/subscription", icon: QrCode, title: "Plans", tkey: "more.plans", dkey: "more.plans.sub" },
  { to: "/orders", icon: Package, title: "My orders", tkey: "more.orders", dkey: "more.orders.sub" },
  { to: "/transactions", icon: Receipt, title: "Transactions", tkey: "more.transactions", dkey: "more.transactions.sub" },
  { to: "/referral", icon: Gift, title: "Refer & earn", tkey: "more.referral", dkey: "more.referral.sub" },
  { to: "/support", icon: LifeBuoy, title: "Support", tkey: "more.support", dkey: "more.support.sub" },
  { to: "/settings", icon: SettingsIcon, title: "Settings", tkey: "more.settings", dkey: "more.settings.sub" },
];

export default function More() {
  const { user } = useAuth();
  const { t } = useT();
  return (
    <div className="page" data-testid="more-page" style={{ maxWidth: 900, margin: "0 auto", padding: "28px 18px 96px" }}>
      <span className="chip"><LayoutIconFallback /> {t("nav.more")}</span>
      <h1 style={{ fontSize: 30, marginTop: 12, marginBottom: 4 }}>{t("more.title")}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{t("more.sub")}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
        {LINKS.map(({ to, icon: Icon, title, tkey, dkey }) => (
          <Link key={to} to={to} className="glass glass-hover" data-testid={`more-${title.toLowerCase().replace(/\s/g, "-")}`}
            style={{ padding: 16, borderRadius: 16, textDecoration: "none", color: "var(--text)", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", border: "1px solid rgba(233,37,70,.4)", color: "#ff5a74" }}>
              <Icon size={20} />
            </span>
            <b style={{ fontSize: 14.5 }}>{t(tkey)}</b>
            <small className="muted" style={{ fontSize: 12 }}>{t(dkey)}</small>
          </Link>
        ))}
        {user?.is_admin && (
          <Link to="/admin" className="glass glass-hover" data-testid="more-admin" style={{ padding: 16, borderRadius: 16, textDecoration: "none", color: "var(--text)", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(233,37,70,.14)", border: "1px solid rgba(233,37,70,.4)", color: "#ff5a74" }}><ShieldAlert size={20} /></span>
            <b style={{ fontSize: 14.5 }}>{t("more.admin")}</b>
            <small className="muted" style={{ fontSize: 12 }}>{t("more.admin.sub")}</small>
          </Link>
        )}
      </div>

    </div>
  );
}

function LayoutIconFallback() {
  return <QrCode size={13} />;
}
