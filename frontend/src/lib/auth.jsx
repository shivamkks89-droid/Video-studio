import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (_e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If returning from OAuth callback, skip the /me check (AuthCallback handles it)
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const login = (token, u) => {
    if (token) localStorage.setItem("cinereel_token", token);
    setUser(u);
  };
  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (_e) { /* ignore */ }
    localStorage.removeItem("cinereel_token");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
