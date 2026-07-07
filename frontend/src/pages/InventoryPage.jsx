import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info, AlertTriangle } from "lucide-react";
import api from "../lib/api";
import SkinCard from "../components/SkinCard";
import { useAuth } from "../context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

export default function InventoryPage() {
  const { user, loginWithSteam } = useAuth();
  const [items, setItems] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [price, setPrice] = useState("");
  const [listing, setListing] = useState(false);
  const [myListings, setMyListings] = useState([]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [inv, mine] = await Promise.all([
        api.get("/inventory/cs2"),
        api.get("/my/listings"),
      ]);
      setItems(inv.data.items || []);
      setIsDemo(!!inv.data.is_demo);
      setMessage(inv.data.message || "");
      setMyListings(mine.data.items || []);
    } catch (e) {
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const openList = (item) => {
    setSelected(item);
    setPrice("");
  };

  const submitListing = async () => {
    const p = parseFloat(price);
    if (!p || p <= 0) {
      toast.error("Enter a valid USD price");
      return;
    }
    setListing(true);
    try {
      const parts = (selected.market_name || "").split(" | ");
      const weapon = parts[0] || "";
      await api.post("/marketplace/listings", {
        skin_name: selected.market_name,
        weapon,
        type: guessType(weapon, selected.market_name),
        rarity: selected.rarity || "consumer",
        wear: selected.wear || null,
        price_usd: p,
        image: selected.image,
        asset_id: selected.asset_id,
      });
      toast.success("Listed on the marketplace");
      setSelected(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to list");
    } finally {
      setListing(false);
    }
  };

  const removeListing = async (id) => {
    try {
      await api.delete(`/marketplace/listings/${id}`);
      toast.success("Listing removed");
      load();
    } catch {
      toast.error("Failed to remove");
    }
  };

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-24 text-center">
        <h2 className="font-display font-black text-3xl mb-4">Sign in to see your inventory</h2>
        <button
          onClick={loginWithSteam}
          data-testid="inv-login-cta"
          className="bg-[#171A21] hover:bg-[#2A475E] border border-[#2A475E] px-6 py-3 rounded-sm"
        >
          Sign in with Steam
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">
          Your CS2 Inventory
        </div>
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">
          {user.display_name}'s vault
        </h1>
        <div className="text-sm text-[#8A8A8A] mt-2 font-mono">
          Steam ID: {user.steam_id}
        </div>
      </div>

      {isDemo && (
        <div className="mb-6 bg-[#E4AE39]/10 border border-[#E4AE39]/30 rounded-sm p-4 flex items-start gap-3" data-testid="demo-banner">
          <AlertTriangle className="w-5 h-5 text-[#E4AE39] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[#E0E0E0]">
            <strong>Demo inventory shown.</strong> {message} To fetch your real inventory, set your Steam profile & inventory to <em>Public</em> in your{" "}
            <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noreferrer" className="text-[#E4AE39] underline">
              Steam Privacy Settings
            </a>.
          </div>
        </div>
      )}

      {/* My active listings */}
      {myListings.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display font-bold text-xl mb-4 tracking-tight">My active listings</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {myListings.filter(l => l.status === "active").map((l) => (
              <div key={l.id} className="relative">
                <SkinCard item={l} testid={`my-listing-${l.id}`} />
                <button
                  onClick={() => removeListing(l.id)}
                  data-testid={`remove-listing-${l.id}`}
                  className="absolute top-2 right-2 bg-[#EB4B4B] hover:bg-[#F56060] text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-sm"
                >
                  Unlist
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Inventory */}
      <h2 className="font-display font-bold text-xl mb-4 tracking-tight">Available to sell</h2>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#121212] aspect-[3/4] animate-pulse rounded-sm" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-sm text-[#8A8A8A]">
          No CS2 items found in your inventory.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((item, i) => (
            <div key={item.asset_id} className="fade-up" style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}>
              <SkinCard
                item={item}
                onClick={() => openList(item)}
                actionLabel="List"
                testid={`inv-item-${item.asset_id}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Listing modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-[#121212] border border-white/10 max-w-md rounded-sm" data-testid="list-modal">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">List for sale</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {selected.image && (
                  <img src={selected.image} alt="" className="w-24 h-24 object-cover rounded-sm bg-black" />
                )}
                <div>
                  <div className={`text-[10px] uppercase tracking-widest font-bold rarity-text-${selected.rarity}`}>
                    {selected.rarity}
                  </div>
                  <div className="text-sm font-medium">{selected.market_name}</div>
                  {selected.wear && <div className="text-xs text-[#8A8A8A] mt-1">{selected.wear}</div>}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[#8A8A8A] mb-1 block">
                  Price in USD
                </label>
                <div className="flex items-center bg-[#0A0A0A] border border-white/10 focus-within:border-[#E4AE39] rounded-sm">
                  <span className="pl-3 text-[#E4AE39] font-mono">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    data-testid="list-price-input"
                    placeholder="0.00"
                    className="bg-transparent px-2 py-3 outline-none flex-1 font-mono"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setSelected(null)}
                  data-testid="cancel-list"
                  className="px-4 py-2 text-sm text-[#8A8A8A] hover:text-white rounded-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={submitListing}
                  disabled={listing}
                  data-testid="confirm-list"
                  className="bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-2 rounded-sm disabled:opacity-50"
                >
                  {listing ? "Listing…" : "Confirm listing"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function guessType(weapon, full) {
  const s = (full || "").toLowerCase();
  if (s.includes("★") || /knife|karambit|bayonet|butterfly/i.test(weapon)) return "Knife";
  if (/awp|ssg/i.test(weapon)) return "Sniper Rifle";
  if (/ak-47|m4a4|m4a1|famas|galil|aug|sg 553/i.test(weapon)) return "Rifle";
  if (/mp7|mp9|mac-10|p90|ump/i.test(weapon)) return "SMG";
  if (/nova|xm1014|mag-7|sawed/i.test(weapon)) return "Shotgun";
  return "Pistol";
}
