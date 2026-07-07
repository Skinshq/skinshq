import React, { useEffect, useState } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useCurrency } from "../context/CurrencyContext";

const RARITIES = [
  { key: "consumer", label: "Consumer" },
  { key: "industrial", label: "Industrial" },
  { key: "milspec", label: "Mil-Spec" },
  { key: "restricted", label: "Restricted" },
  { key: "classified", label: "Classified" },
  { key: "covert", label: "Covert" },
  { key: "contraband", label: "★ Rare Special" },
];
const TYPES = ["Rifle", "Sniper Rifle", "Pistol", "Knife", "SMG", "Shotgun", "Machinegun", "Gloves"];
const rarityLabel = { consumer: "Consumer", industrial: "Industrial", milspec: "Mil-Spec", restricted: "Restricted", classified: "Classified", covert: "Covert", contraband: "★ Extraordinary" };

export default function MarketplacePage() {
  const { format } = useCurrency();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("");
  const [wtype, setWtype] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [page, setPage] = useState(1);
  const pageSize = 60;

  const load = async () => {
    setLoading(true);
    try {
      const params = { sort, page, page_size: pageSize };
      if (q) params.search = q;
      if (rarity) params.rarity = rarity;
      if (wtype) params.weapon_type = wtype;
      const { data } = await api.get("/skins/all", { params });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error("Failed to load catalog"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [rarity, wtype, sort, page]);
  useEffect(() => { setPage(1); }, [rarity, wtype, q]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeFilters = [rarity, wtype].filter(Boolean).length;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">Full Catalog</div>
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">All CS2 skins</h1>
        <div className="text-sm text-[#8A8A8A] mt-2">
          Reference prices for every skin in Counter-Strike 2. Click any skin to see live listings from sellers.
          <span className="ml-2 text-[#E4AE39] font-mono">{total.toLocaleString()} skins</span>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-8 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-[#121212] border border-white/10 focus-within:border-[#E4AE39] rounded-sm px-3 py-2 flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#555]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="search-input"
            placeholder="Search AK-47, AWP, Karambit…"
            className="bg-transparent outline-none flex-1 text-sm placeholder:text-[#555]" />
          {q && <button type="button" onClick={() => { setQ(""); load(); }}><X className="w-4 h-4 text-[#555]" /></button>}
        </div>
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} data-testid="filter-rarity"
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="">Rarity: All</option>
          {RARITIES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <select value={wtype} onChange={(e) => setWtype(e.target.value)} data-testid="filter-type"
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="">Type: All</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} data-testid="sort-select"
          className="bg-[#121212] border border-white/10 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-[#E4AE39]">
          <option value="name_asc">Name A→Z</option>
          <option value="name_desc">Name Z→A</option>
        </select>
        {activeFilters > 0 && (
          <button type="button" onClick={() => { setRarity(""); setWtype(""); }}
            className="flex items-center gap-1 text-xs text-[#EB4B4B] hover:text-[#F56060] px-2 py-2">
            <X className="w-3 h-3" /> Clear ({activeFilters})
          </button>
        )}
      </form>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="bg-[#121212] aspect-[3/4] animate-pulse rounded-sm" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-white/10 rounded-sm text-[#8A8A8A]">No skins match your filters.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((s, i) => (
              <Link
                key={s.master_id}
                to={`/skin/${encodeURIComponent(s.master_id)}`}
                data-testid={`catalog-${s.master_id}`}
                className={`skin-card group bg-[#121212] rounded-sm overflow-hidden rarity-border-${s.rarity} flex flex-col fade-up`}
                style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}
              >
                <div className="relative aspect-[4/3] bg-gradient-to-br from-[#0A0A0A] via-[#121212] to-[#050505] overflow-hidden">
                  <div className={`absolute inset-0 opacity-40 rarity-bg-${s.rarity}`} />
                  <img src={s.image} alt={s.name} loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-300" />
                  <div className={`absolute top-2 left-2 text-[10px] uppercase tracking-[0.2em] font-bold rarity-text-${s.rarity} bg-black/60 px-2 py-0.5 rounded-sm backdrop-blur-sm`}>
                    {rarityLabel[s.rarity]}
                  </div>
                  {s.live_listings > 0 && (
                    <div className="absolute top-2 right-2 text-[10px] font-mono bg-[#2ECC71]/20 text-[#2ECC71] border border-[#2ECC71]/40 px-2 py-0.5 rounded-sm">
                      {s.live_listings} live
                    </div>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-1 flex-1">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-[#555] font-mono">{s.weapon}</div>
                  <div className="text-sm font-medium text-[#E0E0E0] leading-tight line-clamp-2 min-h-[2.5rem]">{s.name}</div>
                  <div className="mt-auto pt-2 border-t border-white/5">
                    <div className="text-[10px] uppercase tracking-widest text-[#555]">Reference price</div>
                    <div className="font-mono text-base font-bold text-[#E4AE39]">{format(s.reference_price_usd)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-center gap-2 mt-10">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} data-testid="prev-page"
              className="p-2 bg-[#121212] border border-white/10 disabled:opacity-30 hover:border-[#E4AE39]/40 rounded-sm">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm text-[#8A8A8A] font-mono px-4">
              Page {page} of {totalPages}
            </div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} data-testid="next-page"
              className="p-2 bg-[#121212] border border-white/10 disabled:opacity-30 hover:border-[#E4AE39]/40 rounded-sm">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
