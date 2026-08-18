import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import DealerDashboard from "@/pages/DealerDashboard";
import Support from "@/pages/Support";
import AdminPlans from "@/pages/AdminPlans";
import AdminSupport from "@/pages/AdminSupport";
import Contact from "@/pages/Contact";
import AdminContacts from "@/pages/AdminContacts";
import AdminCalls from "@/pages/AdminCalls";
import Settings from "@/pages/Settings";
import Safety from "@/pages/Safety";
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
      <div className="nk-bg" />
      <div className="nk-grain" />
      <BrowserRouter>
        <TopNav />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/otp-login" element={<OtpLogin />} />
          <Route path="/register" element={<Register />} />
          <Route path="/scan/:qrId" element={<PublicScan />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/for/:persona" element={<PersonaLanding />} />
          <Route path="/t/:qrId" element={<PublicTag />} />
          <Route path="/c/:qrId" element={<PublicCard />} />
          <Route path="/invite/:token" element={<Invite />} />
          <Route path="/claim/:serial" element={<Claim />} />
          <Route path="/live/:token" element={<LiveView />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/dealer" element={<Protected dealerOnly><DealerDashboard /></Protected>} />
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
          <Route path="/safety" element={<Protected><Safety /></Protected>} />
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
          <Route path="/admin/incidents" element={<Protected adminOnly><AdminIncidents /></Protected>} />
          <Route path="/admin/plans" element={<Protected adminOnly><AdminPlans /></Protected>} />
          <Route path="/admin/support" element={<Protected adminOnly><AdminSupport /></Protected>} />
          <Route path="/admin/contacts" element={<Protected adminOnly><AdminContacts /></Protected>} />
          <Route path="/admin/orgs" element={<Protected adminOnly><AdminOrgs /></Protected>} />
          <Route path="/admin/calls" element={<Protected adminOnly><AdminCalls /></Protected>} />
          <Route path="/admin/comms" element={<Protected adminOnly><AdminComms /></Protected>} />
          <Route path="/admin/integrations" element={<Protected adminOnly><AdminIntegrations /></Protected>} />
          <Route path="/admin/intruder" element={<Protected adminOnly><AdminIntruder /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
