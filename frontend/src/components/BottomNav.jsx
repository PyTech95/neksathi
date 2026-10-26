import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Shield, Users, QrCode, LayoutGrid, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { maybeAutoOpenCallSetup } from "@/lib/callsetup";

const TABS = [
  { to: "/dashboard", icon: Home, label: "Home" },
  { to: "/safety", icon: Shield, label: "Safety" },
  { to: "/family", icon: Users, label: "Family" },
  { to: "/scanner", icon: QrCode, label: "Smart QR" },
  { to: "/more", icon: LayoutGrid, label: "More" },
  { to: "/settings", icon: User, label: "Profile" },
];

// A dealer can only use the dealer portal, so they get just Home + Profile.
const DEALER_TABS = [
  { to: "/dealer", icon: Home, label: "Home" },
  { to: "/dealer/profile", icon: User, label: "Profile" },
];

// Fixed bottom tab bar for the mobile app (logged-in users).
export default function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const tabs = user?.is_dealer ? DEALER_TABS : TABS;
  // Reserve space at the bottom of pages so content isn't hidden behind the bar.
  useEffect(() => {
    document.body.classList.add("has-bottomnav");
    maybeAutoOpenCallSetup(); // one-time lock-screen-calls setup on the app
    return () => document.body.classList.remove("has-bottomnav");
  }, []);
  const isActive = (to) =>
    (to === "/dashboard" || to === "/dealer") ? pathname === to : pathname.startsWith(to);
  return (
    <nav className="bottom-nav" data-testid="bottom-nav">
      {tabs.map(({ to, icon: Icon, label }) => {
        const active = isActive(to);
        return (
          <Link
            key={to}
            to={to}
            className={`bn-item${active ? " active" : ""}`}
            data-testid={`bn-${label.toLowerCase().replace(/\s/g, "-")}`}
          >
            <Icon size={21} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
