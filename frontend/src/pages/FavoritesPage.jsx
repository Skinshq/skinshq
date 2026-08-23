import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useFavorites } from "../context/FavoritesContext";
import { timeAgo } from "../lib/utils";

const rarityLabel = {
  consumer: "Consumer", industrial: "Industrial", milspec: "Mil-Spec",
  restricted: "Restricted", classified: "Classified", covert: "Covert",
  contraband: "★ Extraordinary",
};

function StatusPill({ f }) {
  if (f.target_type !== "listing") return null;
  const s = f.listing_status;
  if (s === "active")
    return <span className="text-[10px] uppercase tracking-widest font-mono text-[#2ECC71]">● Available</span>;
  if (s === "sold")
    return <span className="text-[10px] uppercase tracking-widest font-mono text-[#EB4B4B]">● Sold</span>;
  return <span className="text-[10px] uppercase tracking-widest font-mono text-[#555]">● Unavailable</span>;
}

export default function FavoritesPage() {
  const { user, loginWithSteam } = useAuth();
  const { format } = useCurrency();
  const { refreshLikes } = useFavorites();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/favorites");
      setItems(data.items || []);
    } catch (e) {
      toast.error("Failed to load favourites");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (user) load(); else setLoading(false); }, [user]);

  const remove = async (f) => {
    try {
      await api.delete("/favorites", { params: { target_type: f.target_type, target_id: f.target_id } });
      setItems((prev) => prev.filter((x) => x.id !== f.id));
      refreshLikes();
      toast.success("Removed from favourites");
    } catch { toast.error("Failed to remove"); }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <Heart className="w-10 h-10 text-[#E4AE39]/40 mx-auto mb-4" />
        <h1 className="font-display font-black text-3xl tracking-tight mb-2">Your favourites</h1>
        <p className="text-sm text-[#8A8A8A] mb-6">Sign in with Steam to save items and get notified when they sell.</p>
        <button onClick={loginWithSteam} data-testid="favs-signin"
          className="bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-3 rounded-sm uppercase tracking-widest text-xs">
          Sign in with Steam
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10" data-testid="favorites-page">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">Your list</div>
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight flex items-center gap-3">
          <Heart className="w-7 h-7 text-[#EB4B4B] fill-current" /> Favourites
        </h1>
        <p className="text-sm text-[#8A8A8A] mt-2">
          Every item you've saved. You'll be notified in-app the moment a favourited listing sells or a new listing appears for a favourite skin.
          <span className="ml-2 text-[#E4AE39] font-mono">{items.length} saved</span>
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#121212] aspect-[3/4] animate-pulse rounded-sm" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-white/10 rounded-sm text-[#8A8A8A]">
          <Heart className="w-8 h-8 mx-auto mb-3 text-[#EB4B4B]/40" />
          You haven't saved anything yet.
          <div className="mt-3 text-xs">
            Tap the heart on any skin or listing in the{" "}
            <Link to="/market" className="text-[#E4AE39] underline">marketplace</Link> to save it here.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((f) => {
            const s = f.snapshot || {};
            const rarity = s.rarity || "consumer";
            const href = f.target_type === "skin"
              ? `/skin/${encodeURIComponent(f.target_id)}`
              : (s.master_id ? `/skin/${encodeURIComponent(s.master_id)}` : "/live");
            const priceSource = f.target_type === "listing"
              ? (f.current_price_usd ?? s.price_usd)
              : s.price_usd;
            return (
              <div key={f.id} className={`bg-[#121212] rounded-sm overflow-hidden rarity-border-${rarity} flex flex-col`}
                data-testid={`fav-${f.id}`}>
                <Link to={href} className="relative aspect-[4/3] bg-gradient-to-br from-[#0A0A0A] via-[#121212] to-[#050505] overflow-hidden">
                  <div className={`absolute inset-0 opacity-30 rarity-bg-${rarity}`} />
                  {s.image && (
                    <img src={s.image} alt="" loading="lazy"
                      className="absolute inset-0 w-full h-full object-contain p-4" />
                  )}
                  <div className={`absolute top-2 left-2 text-[10px] uppercase tracking-[0.2em] font-bold rarity-text-${rarity} bg-black/60 px-2 py-0.5 rounded-sm backdrop-blur-sm`}>
                    {rarityLabel[rarity] || rarity}
                  </div>
                  <button onClick={(e) => { e.preventDefault(); remove(f); }}
                    data-testid={`fav-remove-${f.id}`}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-black/60 border border-white/10 hover:border-[#EB4B4B]/50 hover:text-[#EB4B4B] rounded-sm backdrop-blur-sm text-white/80">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Link>
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono">
                      {f.target_type === "listing" ? "Listing" : "Skin"}
                    </div>
                    <StatusPill f={f} />
                  </div>
                  <div className="text-sm font-medium text-[#E0E0E0] leading-tight line-clamp-2 min-h-[2.5rem]">
                    {s.skin_name || "Unknown item"}
                  </div>
                  {s.wear && (
                    <div className="text-[10px] text-[#8A8A8A] font-mono">{s.wear}</div>
                  )}
                  <div className="mt-auto pt-2 border-t border-white/5 flex items-end justify-between">
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-[#555]">Saved</div>
                      <div className="text-[10px] text-[#8A8A8A] font-mono">{timeAgo(f.created_at)}</div>
                    </div>
                    {priceSource != null && (
                      <div className="font-mono text-sm font-bold text-[#E4AE39]">{format(priceSource)}</div>
                    )}
                  </div>
                  <Link to={href} className="mt-2 flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest bg-white/5 hover:bg-white/10 py-2 rounded-sm">
                    <ExternalLink className="w-3 h-3" /> View
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
