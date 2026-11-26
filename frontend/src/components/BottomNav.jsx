import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Shield, Users, QrCode, LayoutGrid, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useT } from "@/lib/i18n";
import { maybeAutoOpenCallSetup } from "@/lib/callsetup";

// `label` stays English (used for the data-testid); `tkey` is the display key.
const TABS = [
  { to: "/dashboard", icon: Home, label: "Home", tkey: "nav.home" },
  { to: "/safety", icon: Shield, label: "Safety", tkey: "nav.safety" },
  { to: "/family", icon: Users, label: "Family", tkey: "nav.family" },
  { to: "/scanner", icon: QrCode, label: "Smart QR", tkey: "nav.smartqr" },
  { to: "/more", icon: LayoutGrid, label: "More", tkey: "nav.more" },
  { to: "/settings", icon: User, label: "Profile", tkey: "nav.profile" },
];

// A dealer can only use the dealer portal, so they get just Home + Profile.
const DEALER_TABS = [
  { to: "/dealer", icon: Home, label: "Home", tkey: "nav.home" },
  { to: "/dealer/profile", icon: User, label: "Profile", tkey: "nav.profile" },
];

// An organization is likewise limited to its own portal.
const ORG_TABS = [
  { to: "/org", icon: Home, label: "Home", tkey: "nav.home" },
  { to: "/org/profile", icon: User, label: "Profile", tkey: "nav.profile" },
];

// Fixed bottom tab bar for the mobile app (logged-in users).
export default function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { t } = useT();
  const tabs = user?.is_dealer ? DEALER_TABS : user?.is_org ? ORG_TABS : TABS;
  // Reserve space at the bottom of pages so content isn't hidden behind the bar.
  useEffect(() => {
    document.body.classList.add("has-bottomnav");
    maybeAutoOpenCallSetup(); // one-time lock-screen-calls setup on the app
    return () => document.body.classList.remove("has-bottomnav");
  }, []);
  const isActive = (to) =>
    (to === "/dashboard" || to === "/dealer" || to === "/org") ? pathname === to : pathname.startsWith(to);
  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      {tabs.map(({ to, icon: Icon, label, tkey }) => {
        const active = isActive(to);
        return (
          <Link
            key={to}
            to={to}
            className={`bn-item${active ? " active" : ""}`}
            data-testid={`bn-${label.toLowerCase().replace(/\s/g, "-")}`}
          >
            <Icon size={21} />
            <span>{t(tkey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
