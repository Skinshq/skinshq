import React, { useEffect, useState } from "react";
import { Search, X, Radio } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import SkinCard from "../components/SkinCard";
import { useAuth } from "../context/AuthContext";

const RARITIES = [
  { key: "consumer", label: "Consumer" },
  { key: "industrial", label: "Industrial" },
  { key: "milspec", label: "Mil-Spec" },
  { key: "restricted", label: "Restricted" },
  { key: "classified", label: "Classified" },
  { key: "covert", label: "Covert" },
  { key: "contraband", label: "★ Rare Special" },
];
const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

export default function LiveListingsPage() {
  const { user, loginWithSteam } = useAuth();
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get("skin") || "");
  const [rarity, setRarity] = useState("");
  const [wear, setWear] = useState("");
  const [sort, setSort] = useState("price_asc");
  const [buying, setBuying] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const p = { sort };
      if (q) p.search = q;
      if (rarity) p.rarity = rarity;
      if (wear) p.wear = wear;
      const { data } = await api.get("/marketplace/listings", { params: p });
      setListings(data.items || []);
    } catch { toast.error("Failed to load listings"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [rarity, wear, sort, q]);

  const buy = async (l) => {
    if (!user) { toast.error("Sign in with Steam first"); loginWithSteam(); return; }
    setBuying(l.id);
    try {
      const { data } = await api.post(`/checkout/${l.id}`);
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
      setBuying(null);
    }
  };

  const activeFilters = [rarity, wear].filter(Boolean).length + (q ? 1 : 0);

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-[#2ECC71] font-mono mb-2">
            <Radio className="w-3 h-3 animate-pulse" /> Live from sellers
          </div>
          <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">Live listings</h1>
          <div className="text-sm text-[#8A8A8A] mt-2">
            {loading ? "Loading…" : `${listings.length} skin${listings.length === 1 ? "" : "s"} listed by traders right now`}
          </div>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} data-testid="sort-select"
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="price_asc">Price: Low → High</option>
          <option value="price_desc">Price: High → Low</option>
          <option value="newest">Newest first</option>
        </select>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-8 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-[#121212] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2 flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#555]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="search-input"
            placeholder="Search live listings…"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]" />
          {q && <button type="button" onClick={() => setQ("")}><X className="w-4 h-4 text-[#555]" /></button>}
        </div>
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} data-testid="filter-rarity"
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="">Rarity: All</option>
          {RARITIES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <select value={wear} onChange={(e) => setWear(e.target.value)} data-testid="filter-wear"
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="">Wear: All</option>
          {WEARS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        {activeFilters > 0 && (
          <button type="button" onClick={() => { setRarity(""); setWear(""); setQ(""); }}
            data-testid="clear-filters"
            className="flex items-center gap-1 text-xs text-[#EB4B4B] hover:text-[#F56060] px-2 py-2">
            <X className="w-3 h-3" /> Clear ({activeFilters})
          </button>
        )}
      </form>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-[#121212] aspect-[3/4] animate-pulse rounded-sm" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-white/10 rounded-sm">
          <div className="text-4xl mb-4 opacity-40">∅</div>
          <div className="text-[#8A8A8A] mb-2">No live listings match your search.</div>
          <div className="text-xs text-[#555]">Once traders start listing skins from their Steam inventories, they will appear here in real time.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {listings.map((item, i) => (
            <div key={item.id} className="fade-up" style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}>
              <SkinCard item={item} onClick={() => buy(item)}
                actionLabel={buying === item.id ? "…" : "Buy"} disabled={buying === item.id}
                testid={`listing-${item.id}`} />
              {item.seller_name && (
                <div className="text-[10px] text-[#555] font-mono mt-1 px-1 truncate">
                  Seller: {item.seller_name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
