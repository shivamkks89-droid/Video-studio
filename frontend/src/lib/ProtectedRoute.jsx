import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export default function ProtectedRoute({ children, admin = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div data-testid="auth-loading" className="min-h-screen flex items-center justify-center bg-[#0A0A0B]">
        <div className="label-mono text-[#E2FF3D]">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (admin && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}
