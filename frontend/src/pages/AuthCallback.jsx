import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash;
      const m = hash.match(/session_id=([^&]+)/);
      if (!m) {
        navigate("/login", { replace: true });
        return;
      }
      const sessionId = m[1];
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sessionId });
        setUser(data.user);
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: data.user } });
      } catch (e) {
        console.error("Auth exchange failed", e);
        navigate("/login", { replace: true });
      }
    };
    run();
  }, [navigate, setUser]);

  return (
    <div data-testid="auth-callback" className="min-h-screen flex items-center justify-center bg-[#0A0A0B] text-white">
      <div className="label-mono text-[#E2FF3D]">Signing you in…</div>
    </div>
  );
}
