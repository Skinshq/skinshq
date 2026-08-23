import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "./AuthContext";

const FavCtx = createContext(null);

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [likedListings, setLikedListings] = useState(new Set());
  const [likedSkins, setLikedSkins] = useState(new Set());
  const [unread, setUnread] = useState(0);

  const refreshLikes = useCallback(async () => {
    if (!user) { setLikedListings(new Set()); setLikedSkins(new Set()); return; }
    try {
      const { data } = await api.get("/favorites/check");
      setLikedListings(new Set(data.listings || []));
      setLikedSkins(new Set(data.skins || []));
    } catch { /* silent */ }
  }, [user]);

  const refreshUnread = useCallback(async () => {
    if (!user) { setUnread(0); return; }
    try {
      const { data } = await api.get("/notifications/unread-count");
      setUnread(data.count || 0);
    } catch { /* silent */ }
  }, [user]);

  useEffect(() => { refreshLikes(); refreshUnread(); }, [refreshLikes, refreshUnread]);

  // Poll unread count every 45s while logged in
  useEffect(() => {
    if (!user) return;
    const t = setInterval(refreshUnread, 45000);
    return () => clearInterval(t);
  }, [user, refreshUnread]);

  const isLiked = (target_type, target_id) => {
    if (target_type === "listing") return likedListings.has(target_id);
    return likedSkins.has(target_id);
  };

  const toggle = async (target_type, target_id, snapshot) => {
    if (!user) { toast.error("Sign in with Steam to save favourites"); return; }
    const currently = isLiked(target_type, target_id);
    // Optimistic update
    const setFn = target_type === "listing" ? setLikedListings : setLikedSkins;
    setFn((prev) => {
      const next = new Set(prev);
      if (currently) next.delete(target_id); else next.add(target_id);
      return next;
    });
    try {
      if (currently) {
        await api.delete("/favorites", { params: { target_type, target_id } });
      } else {
        await api.post("/favorites", { target_type, target_id, snapshot });
        toast.success("Saved to favourites");
      }
    } catch (e) {
      // Roll back on error
      setFn((prev) => {
        const next = new Set(prev);
        if (currently) next.add(target_id); else next.delete(target_id);
        return next;
      });
      toast.error(e?.response?.data?.detail || "Failed to update favourite");
    }
  };

  return (
    <FavCtx.Provider value={{ isLiked, toggle, unread, refreshUnread, refreshLikes }}>
      {children}
    </FavCtx.Provider>
  );
}

export const useFavorites = () => useContext(FavCtx);
