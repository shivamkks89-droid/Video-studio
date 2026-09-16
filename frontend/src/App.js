import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./lib/auth";
import ProtectedRoute from "./lib/ProtectedRoute";
import ErrorBoundary from "./lib/ErrorBoundary";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import DashboardLayout from "./pages/DashboardLayout";
import DashboardHome from "./pages/DashboardHome";
import NewProject from "./pages/NewProject";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import ScriptStudio from "./pages/ScriptStudio";
import VoiceStudio from "./pages/VoiceStudio";
import SceneStudio from "./pages/SceneStudio";
import Templates from "./pages/Templates";
import BrandKit from "./pages/BrandKit";
import Assets from "./pages/Assets";
import Credits from "./pages/Credits";
import Pricing from "./pages/Pricing";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import SharePage from "./pages/SharePage";
import AdStudio from "./pages/AdStudio";
import Workspaces from "./pages/Workspaces";
import AvatarStudio from "./pages/AvatarStudio";
import PlayStoreAssets from "./pages/PlayStoreAssets";

function AppRouter() {
  const location = useLocation();
  // Process OAuth callback synchronously to avoid race conditions
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/signup" element={<Auth mode="signup" />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/share/:id" element={<SharePage />} />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}
      >
        <Route index element={<DashboardHome />} />
        <Route path="new" element={<NewProject />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="script" element={<ScriptStudio />} />
        <Route path="voice" element={<VoiceStudio />} />
        <Route path="scene" element={<SceneStudio />} />
        <Route path="avatars" element={<AvatarStudio />} />
        <Route path="playstore" element={<PlayStoreAssets />} />
        <Route path="ad-studio" element={<AdStudio />} />
        <Route path="workspaces" element={<Workspaces />} />
        <Route path="templates" element={<Templates />} />
        <Route path="brand-kit" element={<BrandKit />} />
        <Route path="assets" element={<Assets />} />
        <Route path="credits" element={<Credits />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route
        path="/admin"
        element={<ProtectedRoute admin><Admin /></ProtectedRoute>}
      />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" theme="dark" toastOptions={{
          style: { background: "#141416", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }
        }} />
        <ErrorBoundary>
          <AppRouter />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
