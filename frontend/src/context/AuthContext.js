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

  const login = (token) => {
    localStorage.setItem("cs2_token", token);
    refresh();
  };

  const logout = () => {
    localStorage.removeItem("cs2_token");
    setUser(null);
  };

  const loginWithSteam = () => {
    window.location.href = `${process.env.REACT_APP_BACKEND_URL}/api/auth/steam/login`;
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, loginWithSteam, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
