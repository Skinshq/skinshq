import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";

const AuthCtx = createContext(null);

// Per-tab auth token so users can be logged in as different accounts in
// different tabs / windows simultaneously (needed for QA + multi-role testing).
// sessionStorage is scoped to the browsing context (tab), unlike localStorage
// which is shared across the whole origin.
const TOKEN_KEY = "cs2_token";
const LEGACY_TOKEN_KEY = "cs2_token"; // same key, previously in localStorage

function readToken() {
  // One-time migration: if a token exists in the (shared) localStorage from
  // a previous version, adopt it in this tab's sessionStorage and remove
  // it from localStorage so it stops leaking into other tabs.
  const sessionTok = sessionStorage.getItem(TOKEN_KEY);
  if (sessionTok) return sessionTok;
  try {
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      sessionStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      return legacy;
    }
  } catch { /* private mode etc. */ }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const token = readToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (token) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    // Explicitly ensure any legacy token in localStorage from previous
    // versions is removed so it can't override this tab's session.
    try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch { /* ignore */ }
    await refresh();
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch { /* ignore */ }
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

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, loginWithSteam, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
