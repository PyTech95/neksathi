import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import TopNav from "@/components/TopNav";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import VehicleDetail from "@/pages/VehicleDetail";
import Alerts from "@/pages/Alerts";
import Admin from "@/pages/Admin";
import PublicScan from "@/pages/PublicScan";
import Tags from "@/pages/Tags";
import TagDetail from "@/pages/TagDetail";
import PublicTag from "@/pages/PublicTag";
import Cards from "@/pages/Cards";
import CardDetail from "@/pages/CardDetail";
import PublicCard from "@/pages/PublicCard";
import Subscription from "@/pages/Subscription";
import Track from "@/pages/Track";
import Invite from "@/pages/Invite";
import Claim from "@/pages/Claim";
import Incidents from "@/pages/Incidents";
import AdminQR from "@/pages/AdminQR";
import AdminDealers from "@/pages/AdminDealers";
import AdminIncidents from "@/pages/AdminIncidents";
import OtpLogin from "@/pages/OtpLogin";
import ForgotPassword from "@/pages/ForgotPassword";
import AdminOtpSettings from "@/pages/AdminOtpSettings";
import DealerDashboard from "@/pages/DealerDashboard";
import DealerCustomers from "@/pages/DealerCustomers";
import Support from "@/pages/Support";
import AdminPlans from "@/pages/AdminPlans";
import AdminSupport from "@/pages/AdminSupport";
import Contact from "@/pages/Contact";
import AdminContacts from "@/pages/AdminContacts";
import AdminCalls from "@/pages/AdminCalls";
import Settings from "@/pages/Settings";
import Safety from "@/pages/Safety";
import Scanner from "@/pages/Scanner";
import LiveView from "@/pages/LiveView";
import Community from "@/pages/Community";
import StolenPhone from "@/pages/StolenPhone";
import SafeZones from "@/pages/SafeZones";
import TheftProtection from "@/pages/TheftProtection";
import IntruderView from "@/pages/IntruderView";
import Family from "@/pages/Family";
import TemporaryCircles from "@/pages/TemporaryCircles";
import AdminComms from "@/pages/AdminComms";
import AdminIntegrations from "@/pages/AdminIntegrations";
import AdminIntruder from "@/pages/AdminIntruder";
import PersonaLanding from "@/pages/PersonaLanding";
import OrgDashboard from "@/pages/OrgDashboard";
import AdminOrgs from "@/pages/AdminOrgs";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DeleteAccount from "./pages/DeleteAccount";
import { SiteHeader, WebsiteEffects, isWebsitePath, SolutionsPage, SolutionPage,
  AboutPage, HowItWorksPage, HelpPage, DownloadPage, LegalPage } from "./website/Website";
import LiveAlarm from "./components/LiveAlarm";
import FamilyAlarm from "./components/FamilyAlarm";
import IncomingCall from "./components/IncomingCall";
import BottomNav from "@/components/BottomNav";
import More from "@/pages/More";
import BuyQR from "@/pages/BuyQR";
import BuyTagQR from "@/pages/BuyTagQR";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import AdminOrders from "@/pages/AdminOrders";
import AdminTagPlans from "@/pages/AdminTagPlans";
import DealerAssign from "@/pages/DealerAssign";
import AdminVendorView from "@/pages/AdminVendorView";
import Transactions from "@/pages/Transactions";
import Referral from "@/pages/Referral";
import { Capacitor } from "@capacitor/core";

function Navigation() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  // In the installed app, never show the marketing website header — always the
  // app's own top bar (logo + notifications only).
  if (Capacitor.isNativePlatform() || !isWebsitePath(pathname)) {
    return <><div className="nk-bg" /><div className="nk-grain" /><TopNav /></>;
  }
  return <><SiteHeader />{user && <><FamilyAlarm /><IncomingCall /></>}</>;
}

// Marketing/website-only pages: hidden in the installed app (redirect to the
// app home) so a user never lands on them. They still work on the website.
function WebOnly({ children }) {
  return Capacitor.isNativePlatform() ? <Navigate to="/" replace /> : children;
}

// On the installed app, opening it sends you to Login (or Home if already signed
// in) instead of the marketing site. On the web it still shows the landing page.
function Home() {
  const { user, loading } = useAuth();
  if (Capacitor.isNativePlatform()) {
    if (loading) return <div className="spinner" data-testid="home-loading" />;
    return <Navigate to={user ? "/dashboard" : "/login"} replace />;
  }
  return <Landing />;
}

// Bottom tab bar — shown for signed-in users inside the app (not on marketing pages).
function AppChrome() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  if (user && !isWebsitePath(pathname)) return <BottomNav />;
  return null;
}

function Protected({ children, adminOnly, dealerOnly, orgOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner" data-testid="auth-loading" />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.is_admin) return <Navigate to="/dashboard" replace />;
  if (dealerOnly && !user.is_dealer) return <Navigate to="/dashboard" replace />;
  if (orgOnly && !user.is_org) return <Navigate to="/dashboard" replace />;
  if (user.is_dealer && !dealerOnly) return <Navigate to="/dealer" replace />;
  if (user.is_org && !orgOnly) return <Navigate to="/org" replace />;
  return children;
}

function Shell() {
  return (
    <>
      <BrowserRouter>
        <WebsiteEffects />
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/solutions" element={<WebOnly><SolutionsPage /></WebOnly>} />
          <Route path="/solutions/:slug" element={<WebOnly><SolutionPage /></WebOnly>} />
          <Route path="/about" element={<WebOnly><AboutPage /></WebOnly>} />
          <Route path="/how-it-works" element={<WebOnly><HowItWorksPage /></WebOnly>} />
          <Route path="/help" element={<WebOnly><HelpPage /></WebOnly>} />
          <Route path="/download" element={<WebOnly><DownloadPage /></WebOnly>} />
          <Route path="/login" element={<Login />} />
          <Route path="/otp-login" element={<OtpLogin />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/register" element={<Register />} />
          <Route path="/scan/:qrId" element={<PublicScan />} />
          <Route path="/contact" element={<WebOnly><Contact /></WebOnly>} />
          <Route path="/for/:persona" element={<WebOnly><PersonaLanding /></WebOnly>} />
          <Route path="/t/:qrId" element={<PublicTag />} />
          <Route path="/c/:qrId" element={<PublicCard />} />
          <Route path="/invite/:token" element={<Invite />} />
          <Route path="/claim/:serial" element={<Claim />} />
          <Route path="/live/:token" element={<LiveView />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/dealer" element={<Protected dealerOnly><DealerDashboard /></Protected>} />
          <Route path="/dealer/assign" element={<Protected dealerOnly><DealerAssign /></Protected>} />
          <Route path="/dealer/customers" element={<Protected dealerOnly><DealerCustomers /></Protected>} />
          <Route path="/org" element={<Protected orgOnly><OrgDashboard /></Protected>} />
          <Route path="/vehicle/:id" element={<Protected><VehicleDetail /></Protected>} />
          <Route path="/track/:id" element={<Protected><Track /></Protected>} />
          <Route path="/tags" element={<Protected><Tags /></Protected>} />
          <Route path="/tag/:id" element={<Protected><TagDetail /></Protected>} />
          <Route path="/cards" element={<Protected><Cards /></Protected>} />
          <Route path="/card/:id" element={<Protected><CardDetail /></Protected>} />
          <Route path="/subscription" element={<Protected><Subscription /></Protected>} />
          <Route path="/alerts" element={<Protected><Alerts /></Protected>} />
          <Route path="/incidents" element={<Protected><Incidents /></Protected>} />
          <Route path="/support" element={<Protected><Support /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="/more" element={<Protected><More /></Protected>} />
          <Route path="/buy-qr" element={<Protected><BuyQR /></Protected>} />
          <Route path="/buy-qr/:vehicleId" element={<Protected><BuyQR /></Protected>} />
          <Route path="/buy-tag" element={<Protected><BuyTagQR /></Protected>} />
          <Route path="/buy-tag/:tagId" element={<Protected><BuyTagQR /></Protected>} />
          <Route path="/orders" element={<Protected><Orders /></Protected>} />
          <Route path="/orders/:id" element={<Protected><OrderDetail /></Protected>} />
          <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
          <Route path="/referral" element={<Protected><Referral /></Protected>} />
          <Route path="/safety" element={<Protected><Safety /></Protected>} />
          <Route path="/privacy" element={<LegalPage title="Privacy policy"><PrivacyPolicy /></LegalPage>} />
          <Route path="/delete-account" element={<LegalPage title="Account deletion"><DeleteAccount /></LegalPage>} />
          <Route path="/scanner" element={<Protected><Scanner /></Protected>} />
          <Route path="/community" element={<Protected><Community /></Protected>} />
          <Route path="/stolen-phone" element={<Protected><StolenPhone /></Protected>} />
          <Route path="/safe-zones" element={<Protected><SafeZones /></Protected>} />
          <Route path="/theft-protection" element={<Protected><TheftProtection /></Protected>} />
          <Route path="/family" element={<Protected><Family /></Protected>} />
          <Route path="/circles" element={<Protected><TemporaryCircles /></Protected>} />
          <Route path="/intruder/:token" element={<IntruderView />} />
          <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
          <Route path="/admin/qr" element={<Protected adminOnly><AdminQR /></Protected>} />
          <Route path="/admin/dealers" element={<Protected adminOnly><AdminDealers /></Protected>} />
          <Route path="/admin/dealers/:id" element={<Protected adminOnly><AdminVendorView /></Protected>} />
          <Route path="/admin/orders" element={<Protected adminOnly><AdminOrders /></Protected>} />
          <Route path="/admin/incidents" element={<Protected adminOnly><AdminIncidents /></Protected>} />
          <Route path="/admin/plans" element={<Protected adminOnly><AdminPlans /></Protected>} />
          <Route path="/admin/tag-plans" element={<Protected adminOnly><AdminTagPlans /></Protected>} />
          <Route path="/admin/support" element={<Protected adminOnly><AdminSupport /></Protected>} />
          <Route path="/admin/contacts" element={<Protected adminOnly><AdminContacts /></Protected>} />
          <Route path="/admin/orgs" element={<Protected adminOnly><AdminOrgs /></Protected>} />
          <Route path="/admin/calls" element={<Protected adminOnly><AdminCalls /></Protected>} />
          <Route path="/admin/comms" element={<Protected adminOnly><AdminComms /></Protected>} />
          <Route path="/admin/integrations" element={<Protected adminOnly><AdminIntegrations /></Protected>} />
          <Route path="/admin/otp-settings" element={<Protected adminOnly><AdminOtpSettings /></Protected>} />
          <Route path="/admin/intruder" element={<Protected adminOnly><AdminIntruder /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <AppChrome />
      </BrowserRouter>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
