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

function Protected({ children, adminOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner" data-testid="auth-loading" />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.is_admin) return <Navigate to="/dashboard" replace />;
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
          <Route path="/register" element={<Register />} />
          <Route path="/scan/:qrId" element={<PublicScan />} />
          <Route path="/t/:qrId" element={<PublicTag />} />
          <Route path="/c/:qrId" element={<PublicCard />} />
          <Route path="/invite/:token" element={<Invite />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/vehicle/:id" element={<Protected><VehicleDetail /></Protected>} />
          <Route path="/track/:id" element={<Protected><Track /></Protected>} />
          <Route path="/tags" element={<Protected><Tags /></Protected>} />
          <Route path="/tag/:id" element={<Protected><TagDetail /></Protected>} />
          <Route path="/cards" element={<Protected><Cards /></Protected>} />
          <Route path="/card/:id" element={<Protected><CardDetail /></Protected>} />
          <Route path="/subscription" element={<Protected><Subscription /></Protected>} />
          <Route path="/alerts" element={<Protected><Alerts /></Protected>} />
          <Route path="/admin" element={<Protected adminOnly><Admin /></Protected>} />
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
