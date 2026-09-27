import React, { useEffect, useState } from "react";
import { X, ExternalLink, ShoppingBag, Layers, Package, Clock, Loader2, Lock, User } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import HeartButton from "./HeartButton";

const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

const RARITY_LABEL = {
  consumer: "Consumer Grade",
  industrial: "Industrial Grade",
  milspec: "Mil-Spec",
  restricted: "Restricted",
  classified: "Classified",
  covert: "Covert",
  contraband: "★ Extraordinary",
};

function stripName(name = "") {
  let n = name;
  for (const p of ["StatTrak™ ", "Souvenir ", "★ ", "★"]) if (n.startsWith(p)) n = n.slice(p.length);
  for (const w of WEARS) if (n.endsWith(` (${w})`)) n = n.slice(0, -(` (${w})`.length));
  return n.trim();
}

function inspectHref(item) {
  const link = item.inspect_link;
  if (!link) return null;
  return link
    .replace("%owner_steamid%", item.seller_steam_id || "0")
    .replace("%assetid%", item.asset_id || "0")
    .replace("%listingid%", "0");
}

/** Simple 4-point sparkline built from Skinport's 24h/7d/30d/90d avg prices. */
function PriceTrend({ history }) {
  const buckets = ["last_24_hours", "last_7_days", "last_30_days", "last_90_days"];
  const labels = ["24H", "7D", "30D", "90D"];
  const points = buckets.map((b, i) => ({ label: labels[i], v: history?.[b]?.avg }));
  if (points.every((p) => p.v == null)) {
    return (
      <div className="text-xs text-[#555] font-mono">
        No Skinport sales data available for this variant yet.
      </div>
    );
  }
  const vals = points.filter((p) => p.v != null).map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const H = 80;
  const W = 260;
  const stepX = W / (points.length - 1);
  const y = (v) => H - ((v - min) / range) * (H - 12) - 6;
  const path = points
    .map((p, i) => (p.v == null ? "" : `${i === 0 ? "M" : "L"} ${i * stepX} ${y(p.v)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24">
        <defs>
          <linearGradient id="tg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#E4AE39" stopOpacity="0.35" />
            <stop offset="1" stopColor="#E4AE39" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L ${W} ${H} L 0 ${H} Z`} fill="url(#tg)" />
        <path d={path} fill="none" stroke="#E4AE39" strokeWidth="1.6" />
        {points.map((p, i) =>
          p.v != null ? (
            <g key={i}>
              <circle cx={i * stepX} cy={y(p.v)} r="3" fill="#E4AE39" />
            </g>
          ) : null
        )}
      </svg>
      <div className="flex justify-between text-[10px] font-mono text-[#8A8A8A] px-1 mt-1">
        {points.map((p, i) => (
          <div key={i} className="text-center">
            <div>{p.label}</div>
            <div className={p.v == null ? "text-[#333]" : "text-[#E0E0E0]"}>
              {p.v != null ? `$${p.v.toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] font-mono text-[#555] mt-1">
        Source: Skinport aggregated averages
      </div>
    </div>
  );
}

/** Float bar: colored zones per wear range, marker for actual float. */
function FloatBar({ value, min = 0, max = 1 }) {
  if (value == null) {
    return (
      <div className="text-xs text-[#555] font-mono">
        Float lookup requires the CS2 inspect-bot (coming soon).
      </div>
    );
  }
  const clamped = Math.max(min, Math.min(max, value));
  const pct = ((clamped - min) / (max - min)) * 100;
  return (
    <div>
      <div className="relative h-3 rounded-full overflow-hidden flex">
        <div style={{ background: "#5BC0DE", width: "7%" }} title="FN" />
        <div style={{ background: "#5CB85C", width: "8%" }} title="MW" />
        <div style={{ background: "#F0AD4E", width: "23%" }} title="FT" />
        <div style={{ background: "#EB4B4B", width: "7%" }} title="WW" />
        <div style={{ background: "#8A2A2A", width: "55%" }} title="BS" />
        <div
          className="absolute top-[-3px] w-[3px] h-[18px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]"
          style={{ left: `calc(${pct}% - 1.5px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-mono text-[#555] mt-1">
        <span>0.00</span><span>0.07</span><span>0.15</span><span>0.38</span><span>0.45</span><span>1.00</span>
      </div>
      <div className="mt-2 text-xs font-mono text-[#E0E0E0]">
        <span className="text-[#8A8A8A]">Float: </span>
        <span className="text-[#E4AE39] font-bold">{Number(value).toFixed(6)}</span>
      </div>
    </div>
  );
}

/** Tabs — Details | Buy Orders | Similar | Recent Sales (Phase 2). */
const TABS = [
  { key: "details", label: "Details", icon: Layers },
  { key: "buyorders", label: "Buy Orders", icon: ShoppingBag },
  { key: "similar", label: "Similar Listings", icon: Package },
  { key: "sales", label: "Recent Sales", icon: Clock, phase2: true },
];

export default function ItemDetailPopup({ item, onClose, onBuy }) {
  const { user, loginWithSteam } = useAuth();
  const { format } = useCurrency();
  const [tab, setTab] = useState("details");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const [similar, setSimilar] = useState([]);
  const [buyOrders, setBuyOrders] = useState([]);
  const [wearFilter, setWearFilter] = useState("");
  const [stFilter, setStFilter] = useState("all"); // all | stattrak | souvenir | normal
  const [seller, setSeller] = useState(null);

  const [showBuyOrderForm, setShowBuyOrderForm] = useState(false);
  const [orderPrice, setOrderPrice] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);

  const rarity = item.rarity || "consumer";
  const cleanBase = stripName(item.market_hash_name || item.skin_name || item.name || "");
  const isStat = /StatTrak/i.test(item.market_hash_name || "");
  const isSouv = /Souvenir/i.test(item.market_hash_name || "");
  const inspect = inspectHref(item);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api
      .get("/skins/detail-by-name", { params: { market_hash_name: item.market_hash_name || item.skin_name } })
      .then(({ data }) => setDetail(data))
      .catch(() => toast.error("Failed to load skin details"))
      .finally(() => setLoading(false));

    // seller privacy view
    if (item.seller_steam_id) {
      api.get(`/users/${item.seller_steam_id}/public`).then(({ data }) => setSeller(data)).catch(() => {});
    }
    // Esc key
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      controller.abort();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [item.market_hash_name, item.seller_steam_id, item.skin_name, onClose]);

  // Lazy-load per tab
  useEffect(() => {
    if (tab === "similar") {
      const p = { base_name: cleanBase };
      if (wearFilter) p.wear = wearFilter;
      if (stFilter === "stattrak") p.stattrak = true;
      else if (stFilter === "souvenir") p.souvenir = true;
      else if (stFilter === "normal") { p.stattrak = false; p.souvenir = false; }
      api.get("/marketplace/similar", { params: p }).then(({ data }) => setSimilar(data.items || []));
    }
    if (tab === "buyorders") {
      api.get("/buy-orders/for-skin", { params: { market_hash_name: item.market_hash_name || item.skin_name } })
        .then(({ data }) => setBuyOrders(data.items || []));
    }
  }, [tab, wearFilter, stFilter, cleanBase, item.market_hash_name, item.skin_name]);

  const placeBuyOrder = async () => {
    if (!user) { toast.error("Sign in first"); loginWithSteam(); return; }
    const price = parseFloat(orderPrice);
    if (!price || price <= 0) { toast.error("Enter a valid max price"); return; }
    setPlacingOrder(true);
    try {
      await api.post("/buy-orders", {
        skin_name: cleanBase,
        max_price_usd: price,
        wear: item.wear || null,
        note: `Created from ${item.market_hash_name || cleanBase} item detail`,
      });
      toast.success("Buy order placed — we'll notify you the moment a matching listing appears");
      setShowBuyOrderForm(false);
      setOrderPrice("");
      // refresh
      api.get("/buy-orders/for-skin", { params: { market_hash_name: item.market_hash_name || item.skin_name } })
        .then(({ data }) => setBuyOrders(data.items || []));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create buy order");
    } finally { setPlacingOrder(false); }
  };

  const master = detail?.master || {};
  const history = detail?.sales_history || {};
  const marketSnap = detail?.market_snapshot || {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3 py-6 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      data-testid="item-detail-popup"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0F0F0F] border border-white/10 rounded-2xl w-full max-w-5xl relative shadow-[0_25px_80px_-10px_rgba(0,0,0,0.8)] my-auto"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black text-white/70 hover:text-white flex items-center justify-center z-10"
          data-testid="popup-close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* LEFT — image + core meta */}
          <div className="p-6 border-b lg:border-b-0 lg:border-r border-white/5">
            <div className={`relative aspect-[4/3] rounded-xl overflow-hidden rarity-bg-${rarity} border border-white/5`}>
              {item.image ? (
                <img src={item.image} alt={cleanBase} className="absolute inset-0 w-full h-full object-contain p-4 drop-shadow-[0_12px_30px_rgba(0,0,0,0.6)]" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[#333]">NO IMAGE</div>
              )}
              <div className="absolute top-3 left-3">
                <HeartButton
                  targetType="listing"
                  targetId={item.id || item.asset_id}
                  snapshot={{ skin_name: cleanBase, image: item.image, wear: item.wear, rarity, price_usd: item.price_usd }}
                  size="md"
                />
              </div>
              {inspect && (
                <a
                  href={inspect}
                  className="absolute top-3 right-3 flex items-center gap-1 bg-black/70 hover:bg-[#E4AE39] hover:text-black text-white/90 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-widest font-mono border border-white/10"
                  data-testid="popup-inspect"
                >
                  <ExternalLink className="w-3 h-3" /> Inspect
                </a>
              )}
            </div>

            {/* Name + rarity label + quality chips */}
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.3em] font-mono text-[#8A8A8A] mb-1">
                {item.weapon || item.type || "CS2 Item"}
              </div>
              <h2 className={`font-display font-black text-2xl tracking-tight rarity-text-${rarity} leading-tight`}>
                {cleanBase}
              </h2>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {isStat && <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border border-[#CF6A32]/50 bg-[#CF6A32]/15 text-[#F0A97A]">StatTrak™</span>}
                {isSouv && <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border border-[#FFD700]/40 bg-[#FFD700]/10 text-[#FFD700]">Souvenir</span>}
                {item.wear && <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border border-white/15 bg-white/5 text-[#B0B0B0]">{item.wear}</span>}
                <span className={`text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border rarity-text-${rarity}`} style={{ borderColor: "currentColor" }}>
                  {RARITY_LABEL[rarity]}
                </span>
              </div>
            </div>

            {/* Price + Buy */}
            {item.price_usd != null && (
              <div className="mt-5 p-4 bg-[#161616] rounded-xl border border-white/5">
                <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-1">Listed price</div>
                <div className="font-mono text-3xl font-bold text-[#E4AE39]">{format(item.price_usd)}</div>
                {onBuy && (
                  <button
                    onClick={() => onBuy(item)}
                    data-testid="popup-buy"
                    className="mt-3 w-full text-xs font-bold uppercase tracking-widest bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] px-3 py-3 rounded-lg transition-colors"
                  >
                    Buy Now
                  </button>
                )}
              </div>
            )}

            {/* Seller */}
            {seller && (
              <div className="mt-5">
                <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-2">Seller</div>
                {seller.profile_visibility === "public" ? (
                  <Link
                    to={`/seller/${seller.steam_id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#161616] border border-white/5 hover:border-[#E4AE39]/40 transition-colors"
                    data-testid="popup-seller"
                  >
                    {seller.avatar ? (
                      <img src={seller.avatar} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-white/50" />
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-[#E0E0E0] font-medium">{seller.display_name}</div>
                      <div className="text-[10px] text-[#8A8A8A] font-mono uppercase tracking-widest">View store →</div>
                    </div>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#161616] border border-white/5">
                    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-[#8A8A8A]" />
                    </div>
                    <div>
                      <div className="text-sm text-[#8A8A8A] font-medium">Anonymous Seller</div>
                      <div className="text-[10px] text-[#555] font-mono uppercase tracking-widest">Profile hidden by user</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — tabs */}
          <div className="p-6 flex flex-col min-h-[500px]">
            {/* Tab bar */}
            <div className="flex gap-1 mb-4 border-b border-white/5">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    data-testid={`tab-${t.key}`}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] uppercase tracking-widest font-mono transition-colors relative ${
                      active ? "text-[#E4AE39]" : "text-[#8A8A8A] hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                    {t.phase2 && <span className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-[#555]">P2</span>}
                    {active && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#E4AE39]" />}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center text-[#555]">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : tab === "details" ? (
              <div className="space-y-5 overflow-y-auto pr-1" style={{ maxHeight: "60vh" }}>
                {/* Price trend */}
                <section>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono mb-2">
                    Price trend (1Y aggregate)
                  </h3>
                  <PriceTrend history={history} />
                </section>

                {/* Float bar */}
                <section>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono mb-2">
                    Float value
                  </h3>
                  <FloatBar value={item.float_value} min={master.min_float || 0} max={master.max_float || 1} />
                </section>

                {/* Paint seed */}
                <section>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono mb-2">
                    Paint seed
                  </h3>
                  <div className="text-sm font-mono text-[#E0E0E0]">
                    {item.paint_seed != null ? item.paint_seed : (
                      <span className="text-[#555]">Requires CS2 inspect-bot — wiring up soon.</span>
                    )}
                  </div>
                </section>

                {/* Stickers */}
                <section>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono mb-2">
                    Applied stickers
                  </h3>
                  {(item.stickers || []).length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(item.stickers || []).map((s, i) => (
                        <div key={i} className="p-2 rounded-lg bg-[#161616] border border-white/5 text-xs text-[#E0E0E0] font-mono truncate" title={s}>
                          {s}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-[#555] font-mono">No stickers applied.</div>
                  )}
                </section>

                {/* Origin */}
                <section>
                  <h3 className="text-[10px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono mb-2">
                    Origin
                  </h3>
                  {(master.collections?.length || master.crates?.length) ? (
                    <div className="grid grid-cols-1 gap-2">
                      {(master.collections || []).map((c) => (
                        <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-[#161616] border border-white/5">
                          {c.image && <img src={c.image} alt="" className="w-8 h-8 object-contain" />}
                          <div>
                            <div className="text-[10px] text-[#555] font-mono uppercase">Collection</div>
                            <div className="text-sm text-[#E0E0E0]">{c.name}</div>
                          </div>
                        </div>
                      ))}
                      {(master.crates || []).map((c) => (
                        <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-[#161616] border border-white/5">
                          {c.image && <img src={c.image} alt="" className="w-8 h-8 object-contain" />}
                          <div>
                            <div className="text-[10px] text-[#555] font-mono uppercase">Case / Container</div>
                            <div className="text-sm text-[#E0E0E0]">{c.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-[#555] font-mono">Origin unknown for this variant.</div>
                  )}
                </section>

                {/* Market snapshot */}
                {marketSnap.median_price && (
                  <section>
                    <h3 className="text-[10px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono mb-2">
                      Skinport snapshot
                    </h3>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        ["Min", marketSnap.min_price],
                        ["Median", marketSnap.median_price],
                        ["Mean", marketSnap.mean_price],
                        ["Max", marketSnap.max_price],
                      ].map(([lbl, v]) => (
                        <div key={lbl} className="p-2 rounded-lg bg-[#161616] border border-white/5">
                          <div className="text-[9px] text-[#555] font-mono uppercase">{lbl}</div>
                          <div className="text-sm text-[#E4AE39] font-mono font-bold">
                            {v != null ? `$${Number(v).toFixed(2)}` : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : tab === "buyorders" ? (
              <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: "60vh" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono">
                    Open buy orders for <span className="text-[#E4AE39]">{cleanBase}</span>
                  </div>
                  <button
                    onClick={() => setShowBuyOrderForm((s) => !s)}
                    data-testid="popup-place-buy-order"
                    className="text-[10px] uppercase tracking-widest font-bold bg-[#E4AE39] hover:bg-[#F5C75A] text-black px-3 py-1.5 rounded-lg"
                  >
                    + Place buy order
                  </button>
                </div>

                {showBuyOrderForm && (
                  <div className="mb-4 p-4 rounded-xl bg-[#161616] border border-[#E4AE39]/30">
                    <div className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-mono mb-2">
                      Your max price (USD) — you'll be notified when a matching listing appears at or below this.
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={orderPrice}
                        onChange={(e) => setOrderPrice(e.target.value)}
                        data-testid="popup-buy-order-price"
                        placeholder="e.g. 25.00"
                        className="flex-1 bg-[#0A0A0A] border border-white/10 focus:border-[#E4AE39] outline-none rounded-lg px-3 py-2 text-sm font-mono text-[#E0E0E0]"
                      />
                      <button
                        onClick={placeBuyOrder}
                        disabled={placingOrder}
                        data-testid="popup-buy-order-submit"
                        className="text-[10px] uppercase tracking-widest font-bold bg-[#2ECC71] hover:bg-[#3EDD82] disabled:opacity-50 text-black px-4 py-2 rounded-lg"
                      >
                        {placingOrder ? "…" : "Create"}
                      </button>
                    </div>
                    <div className="text-[10px] font-mono text-[#555] mt-2">
                      Requires wallet balance ≥ your max price.
                    </div>
                  </div>
                )}

                {buyOrders.length === 0 ? (
                  <div className="text-xs text-[#555] font-mono py-8 text-center">
                    No open buy orders for this skin yet — be the first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {buyOrders.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-[#161616] border border-white/5">
                        <div>
                          <div className="text-sm text-[#E0E0E0]">{b.user_name}</div>
                          <div className="text-[10px] text-[#555] font-mono uppercase">
                            {b.wear || "Any wear"} • {new Date(b.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="font-mono text-lg font-bold text-[#E4AE39]">
                          ${Number(b.max_price_usd).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : tab === "similar" ? (
              <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: "60vh" }}>
                {/* Filter bar */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <select value={wearFilter} onChange={(e) => setWearFilter(e.target.value)}
                    data-testid="popup-similar-wear"
                    className="bg-[#161616] border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono">
                    <option value="">All wears</option>
                    {WEARS.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <div className="flex gap-1 rounded-lg bg-[#161616] border border-white/10 p-0.5">
                    {[
                      { k: "all", label: "All" },
                      { k: "normal", label: "Normal" },
                      { k: "stattrak", label: "StatTrak" },
                      { k: "souvenir", label: "Souvenir" },
                    ].map((o) => (
                      <button
                        key={o.k}
                        onClick={() => setStFilter(o.k)}
                        data-testid={`popup-similar-${o.k}`}
                        className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded ${
                          stFilter === o.k ? "bg-[#E4AE39] text-black" : "text-[#8A8A8A] hover:text-white"
                        }`}
                      >{o.label}</button>
                    ))}
                  </div>
                </div>

                {similar.length === 0 ? (
                  <div className="text-xs text-[#555] font-mono py-8 text-center">
                    No other live listings match those filters.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {similar.map((s) => (
                      <div key={s.id} className={`p-2 rounded-lg bg-[#161616] border border-white/5 hover:border-[#E4AE39]/40 rarity-border-${s.rarity || "consumer"}`}>
                        <div className={`relative aspect-[4/3] rounded-md overflow-hidden rarity-bg-${s.rarity || "consumer"}`}>
                          {s.image && <img src={s.image} alt="" className="absolute inset-0 w-full h-full object-contain p-2" />}
                        </div>
                        <div className="text-[10px] font-mono text-[#8A8A8A] mt-1 truncate">{s.wear || "—"}</div>
                        <div className="text-sm font-mono font-bold text-[#E4AE39]">${Number(s.price_usd).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Recent sales — Phase 2
              <div className="flex-1 flex flex-col items-center justify-center text-center text-[#555] py-8">
                <Clock className="w-8 h-8 mb-3 opacity-50" />
                <div className="text-sm text-[#8A8A8A]">Recent sales history — coming in Phase 2</div>
                <div className="text-[10px] font-mono mt-2 max-w-xs">
                  We'll surface the 15 most-recent completed sales for this variant once the sales-history index is live.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
