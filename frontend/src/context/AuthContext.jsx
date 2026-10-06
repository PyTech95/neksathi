import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";
import { initPush } from "@/lib/push";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("nk_token");
    if (!t) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem("nk_token"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (user?.id) initPush(user.id); }, [user?.id]);

  const login = async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    localStorage.setItem("nk_token", r.data.access_token);
    setUser(r.data.user);
    return r.data.user;
  };

  const register = async (payload) => {
    const r = await api.post("/auth/register", payload);
    localStorage.setItem("nk_token", r.data.access_token);
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => {
    localStorage.removeItem("nk_token");
    setUser(null);
  };

  const loginWithToken = (token, u) => {
    localStorage.setItem("nk_token", token);
    setUser(u);
    return u;
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, loginWithToken, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
