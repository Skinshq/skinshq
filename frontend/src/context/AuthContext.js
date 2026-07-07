import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const token = localStorage.getItem("cs2_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("cs2_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (token) => {
    localStorage.setItem("cs2_token", token);
    await refresh();
  };

  const logout = () => {
    localStorage.removeItem("cs2_token");
    setUser(null);
  };

  const loginWithSteam = () => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/auth/steam/login`;
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return;
      }
    } catch (_) {
      // Cross-origin iframe: open in a new tab so Steam can load
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = url;
  };

  // Sync auth across tabs — when Steam callback tab saves token, parent tab picks it up
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "cs2_token" && e.newValue) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, loginWithSteam, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
