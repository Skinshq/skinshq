import React, { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import SkinCard from "../components/SkinCard";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";

const RARITIES = [
  { key: "consumer", label: "Consumer" },
  { key: "industrial", label: "Industrial" },
  { key: "milspec", label: "Mil-Spec" },
  { key: "restricted", label: "Restricted" },
  { key: "classified", label: "Classified" },
  { key: "covert", label: "Covert" },
  { key: "contraband", label: "★ Knives / Rare" },
];

const TYPES = ["Rifle", "Sniper Rifle", "Pistol", "Knife", "SMG", "Shotgun"];
const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

export default function MarketplacePage() {
  const { user, loginWithSteam } = useAuth();
  const { format } = useCurrency();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("");
  const [wtype, setWtype] = useState("");
  const [wear, setWear] = useState("");
  const [sort, setSort] = useState("price_asc");
  const [buying, setBuying] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = { sort };
      if (q) params.search = q;
      if (rarity) params.rarity = rarity;
      if (wtype) params.weapon_type = wtype;
      if (wear) params.wear = wear;
      const { data } = await api.get("/marketplace/listings", { params });
      setListings(data.items || []);
    } catch (e) {
      toast.error("Failed to load listings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [rarity, wtype, wear, sort]);

  const onSearch = (e) => {
    e.preventDefault();
    load();
  };

  const clearFilters = () => {
    setRarity(""); setWtype(""); setWear(""); setQ("");
  };

  const buy = async (listing) => {
    if (!user) {
      toast.error("Please sign in with Steam first");
      loginWithSteam();
      return;
    }
    setBuying(listing.id);
    try {
      const { data } = await api.post(`/checkout/${listing.id}`);
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
      setBuying(null);
    }
  };

  const activeFilters = [rarity, wtype, wear].filter(Boolean).length;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">
            Marketplace
          </div>
          <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">
            Browse skins
          </h1>
          <div className="text-sm text-[#8A8A8A] mt-2">
            {loading ? "Loading…" : `${listings.length} listings available`}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            data-testid="sort-select"
            className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]"
          >
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {/* Search + Filters */}
      <form onSubmit={onSearch} className="mb-8 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-[#121212] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2 flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#555]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="search-input"
            placeholder="Search AK-47, AWP, Karambit…"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); load(); }} data-testid="clear-search">
              <X className="w-4 h-4 text-[#555]" />
            </button>
          )}
        </div>

        <FilterSelect value={rarity} onChange={setRarity} label="Rarity" options={RARITIES.map(r => ({ value: r.key, label: r.label }))} testid="filter-rarity" />
        <FilterSelect value={wtype} onChange={setWtype} label="Type" options={TYPES.map(t => ({ value: t, label: t }))} testid="filter-type" />
        <FilterSelect value={wear} onChange={setWear} label="Wear" options={WEARS.map(w => ({ value: w, label: w }))} testid="filter-wear" />

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            data-testid="clear-filters"
            className="flex items-center gap-1 text-xs text-[#EB4B4B] hover:text-[#F56060] px-2 py-2"
          >
            <X className="w-3 h-3" /> Clear ({activeFilters})
          </button>
        )}
      </form>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-[#121212] aspect-[3/4] animate-pulse rounded-sm" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-white/10 rounded-sm">
          <div className="text-4xl mb-4 opacity-40">∅</div>
          <div className="text-[#8A8A8A]">No skins match your filters.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {listings.map((item, i) => (
            <div key={item.id} className="fade-up" style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}>
              <SkinCard
                item={item}
                onClick={() => buy(item)}
                actionLabel={buying === item.id ? "..." : "Buy"}
                disabled={buying === item.id}
                testid={`listing-${item.id}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ value, onChange, label, options, testid }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testid}
      className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]"
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
