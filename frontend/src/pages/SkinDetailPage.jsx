import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, TrendingUp, User } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { timeAgo } from "../lib/utils";
import FloatBar, { tierForFloat } from "../components/FloatBar";

const rarityLabel = {
  consumer: "Consumer Grade", industrial: "Industrial Grade", milspec: "Mil-Spec Grade",
  restricted: "Restricted", classified: "Classified", covert: "Covert",
  contraband: "★ Extraordinary",
};

export default function SkinDetailPage() {
  const { masterId } = useParams();
  const { format } = useCurrency();
  const { user, loginWithSteam } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/skins/detail/${encodeURIComponent(masterId)}`)
      .then(({ data }) => setData(data))
      .catch(() => toast.error("Skin not found"))
      .finally(() => setLoading(false));
  }, [masterId]);

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

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#E4AE39]" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto py-24 text-center">
        <div className="text-[#8A8A8A]">Skin not found.</div>
        <Link to="/market" className="text-[#E4AE39] underline mt-4 inline-block">Back to catalog</Link>
      </div>
    );
  }

  const { skin, listings } = data;
  const rarity = skin.rarity || "consumer";
  const cheapest = listings[0];

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10" data-testid="skin-detail-page">
      <Link to="/market" data-testid="back-to-market"
        className="inline-flex items-center gap-1 text-sm text-[#8A8A8A] hover:text-[#E4AE39] mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to catalog
      </Link>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10">
        {/* Image + rarity strip */}
        <div>
          <div className={`relative aspect-[4/3] bg-gradient-to-br from-[#0A0A0A] via-[#121212] to-[#050505] overflow-hidden rounded-sm rarity-border-${rarity}`}>
            <div className={`absolute inset-0 opacity-30 rarity-bg-${rarity}`} />
            <img src={skin.image} alt={skin.name}
              className="absolute inset-0 w-full h-full object-contain p-8" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <Meta label="Rarity" value={rarityLabel[rarity]} valueClass={`rarity-text-${rarity}`} />
            <Meta label="Category" value={skin.type || "Weapon"} />
            <Meta label="Min Float" value={skin.min_float != null ? Number(skin.min_float).toFixed(4) : "—"} mono />
            <Meta label="Max Float" value={skin.max_float != null ? Number(skin.max_float).toFixed(4) : "—"} mono />
          </div>

          {(skin.min_float != null || skin.max_float != null) && (
            <div className="mt-6 bg-[#121212] border border-white/10 rounded-sm p-5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[#555] mb-3">
                <span>Float range</span>
                <span className="font-mono">
                  {Number(skin.min_float ?? 0).toFixed(4)} — {Number(skin.max_float ?? 1).toFixed(4)}
                </span>
              </div>
              <FloatBar
                min={Number(skin.min_float) || 0}
                max={Number(skin.max_float) || 1}
                size="md"
                showLabels
              />
              <div className="mt-4 text-[10px] font-mono text-[#555] leading-relaxed">
                Represents the float range this skin can spawn in (0.00 = pristine → 1.00 = destroyed).
                Colored segments mark the wear-tier boundaries.
              </div>
            </div>
          )}
        </div>

        {/* Info panel */}
        <div>
          <div className={`text-[11px] uppercase tracking-[0.3em] font-mono mb-2 rarity-text-${rarity}`}>
            {skin.weapon} — {rarityLabel[rarity]}
          </div>
          <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight mb-4">
            {skin.name}
          </h1>

          <div className="bg-[#121212] border border-white/10 rounded-sm p-5 mb-4">
            {skin.market_price_usd != null ? (
              <>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#2ECC71] mb-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#2ECC71] animate-pulse" />
                  Skinport <span className="text-[#555]">· live</span>
                </div>
                <div className="font-mono text-3xl font-black text-[#E4AE39]">
                  {format(skin.market_price_usd)}
                </div>
                <div className="text-xs text-[#8A8A8A] mt-1 font-mono">
                  Range: {format(skin.market_price_min || 0)} — {format(skin.market_price_max || 0)}
                  {skin.volume_7d ? <span className="ml-2">· {skin.volume_7d.toLocaleString()} on sale</span> : null}
                </div>
                <div className="text-[10px] text-[#555] mt-1 font-mono">
                  Updated {timeAgo(skin.market_price_updated_at) || "recently"}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#555] mb-2">
                  <TrendingUp className="w-3 h-3" /> Reference price
                </div>
                <div className="font-mono text-3xl font-black text-[#E4AE39]">
                  {format(skin.reference_price_usd)}
                </div>
                <div className="text-xs text-[#8A8A8A] mt-1 font-mono">
                  Range: {format(skin.price_range_usd?.low || 0)} — {format(skin.price_range_usd?.high || 0)}
                </div>
              </>
            )}
          </div>

          {Array.isArray(skin.market_variants) && skin.market_variants.length > 0 && (
            <div className="bg-[#0F0F0F] border border-white/10 rounded-sm p-4 mb-4">
              <div className="text-[10px] uppercase tracking-widest text-[#555] mb-3 font-mono">
                Skinport · price by wear
              </div>
              <div className="space-y-1.5">
                {skin.market_variants
                  .slice()
                  .sort((a, b) => (a.price_usd || 0) - (b.price_usd || 0))
                  .map((v) => {
                    // Extract wear from name e.g. "AK-47 | Redline (Field-Tested)"
                    const m = v.market_hash_name.match(/\(([^)]+)\)\s*$/);
                    const label = m ? m[1] : "Vanilla";
                    return (
                      <div key={v.market_hash_name} className="flex items-center justify-between text-xs">
                        <span className="text-[#E0E0E0]">{label}</span>
                        <span className="flex items-center gap-3">
                          {v.listings ? (
                            <span className="text-[10px] text-[#555] font-mono">{v.listings.toLocaleString()} on sale</span>
                          ) : null}
                          <span className="font-mono font-bold text-[#E4AE39]">{format(v.price_usd)}</span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {cheapest && (
            <div className="bg-[#0F1F14] border border-[#2ECC71]/30 rounded-sm p-5 mb-4">
              <div className="text-[10px] uppercase tracking-widest text-[#2ECC71] mb-2">Lowest live listing</div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="font-mono text-2xl font-black text-[#2ECC71]">{format(cheapest.price_usd)}</div>
                  <div className="text-xs text-[#8A8A8A] mt-1">{cheapest.wear} · Seller: {cheapest.seller_name}</div>
                </div>
                <button onClick={() => buy(cheapest)} disabled={buying === cheapest.id}
                  data-testid="buy-cheapest"
                  className="bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-5 py-3 rounded-sm disabled:opacity-50 text-xs uppercase tracking-widest">
                  {buying === cheapest.id ? "…" : "Buy now"}
                </button>
              </div>
            </div>
          )}

          <p className="text-sm text-[#8A8A8A] leading-relaxed">
            Weapon: <span className="text-[#E0E0E0]">{skin.weapon}</span> ·
            Type: <span className="text-[#E0E0E0]">{skin.type}</span> ·
            Skin id: <span className="font-mono text-[#555]">{skin.master_id}</span>
          </p>
        </div>
      </div>

      {/* Live listings */}
      <section className="mt-16">
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display font-black text-2xl tracking-tight">
            Live listings <span className="text-[#555] font-mono text-base">({listings.length})</span>
          </h2>
        </div>

        {listings.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-sm text-[#8A8A8A]">
            No sellers listing this skin right now.
            {user && (
              <div className="mt-3 text-xs">
                Have one in your inventory?{" "}
                <Link to="/inventory" className="text-[#E4AE39] underline">List it →</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-[#555] border-b border-white/10">
                <tr>
                  <th className="text-left py-3 px-2">Seller</th>
                  <th className="text-left py-3 px-2">Wear</th>
                  <th className="text-left py-3 px-2">Float</th>
                  <th className="text-right py-3 px-2">Price</th>
                  <th className="text-right py-3 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors" data-testid={`row-${l.id}`}>
                    <td className="py-3 px-2 flex items-center gap-2">
                      <User className="w-3 h-3 text-[#555]" />
                      <span className="text-[#E0E0E0]">{l.seller_name}</span>
                    </td>
                    <td className="py-3 px-2 text-[#E0E0E0]">{l.wear || "—"}</td>
                    <td className="py-3 px-2 font-mono text-[#8A8A8A]">
                      {l.float_value != null ? (
                        <div className="flex flex-col gap-1 min-w-[110px]">
                          <span>{Number(l.float_value).toFixed(4)}</span>
                          <FloatBar
                            min={Number(skin.min_float) || 0}
                            max={Number(skin.max_float) || 1}
                            value={Number(l.float_value)}
                          />
                        </div>
                      ) : "—"}
                    </td>
                    <td className="py-3 px-2 text-right font-mono font-bold text-[#E4AE39]">
                      {format(l.price_usd)}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <button onClick={() => buy(l)} disabled={buying === l.id}
                        data-testid={`buy-${l.id}`}
                        className="text-[10px] uppercase tracking-widest bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-3 py-2 rounded-sm disabled:opacity-50">
                        {buying === l.id ? "…" : "Buy"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Meta({ label, value, mono, valueClass = "" }) {
  return (
    <div className="bg-[#121212] border border-white/5 rounded-sm p-3">
      <div className="text-[9px] uppercase tracking-widest text-[#555] mb-1">{label}</div>
      <div className={`${mono ? "font-mono" : ""} text-sm ${valueClass || "text-[#E0E0E0]"}`}>{value}</div>
    </div>
  );
}
