import React, { useState } from "react";
import { ExternalLink, X, Sparkles } from "lucide-react";
import { useCurrency } from "../context/CurrencyContext";

/**
 * Detect quality flags from market_hash_name.
 * StatTrak™, Souvenir, ★ (knives/gloves) all carry pricing weight, so surface
 * them as chips beside the name.
 */
function detectQuality(item) {
  const name = item.market_hash_name || item.name || item.skin_name || "";
  const chips = [];
  if (/StatTrak/i.test(name)) chips.push({ label: "StatTrak™", tone: "stattrak" });
  if (/Souvenir/i.test(name)) chips.push({ label: "Souvenir", tone: "souvenir" });
  if (name.trim().startsWith("★")) chips.push({ label: "★ Rare", tone: "rare" });
  return chips;
}

/** Strip the StatTrak/Souvenir/★ noise + wear parens for a clean display name. */
function cleanName(item) {
  let n = item.skin_name || item.market_hash_name || item.name || "";
  n = n.replace(/^StatTrak™\s*/i, "").replace(/^Souvenir\s*/i, "").replace(/^★\s*/i, "");
  n = n.replace(/\s*\(Factory New\)|\s*\(Minimal Wear\)|\s*\(Field-Tested\)|\s*\(Well-Worn\)|\s*\(Battle-Scarred\)/i, "");
  return n.trim();
}

/** Short wear abbreviation for the compact bracket chip. */
const WEAR_SHORT = {
  "Factory New": "FN",
  "Minimal Wear": "MW",
  "Field-Tested": "FT",
  "Well-Worn": "WW",
  "Battle-Scarred": "BS",
};

/** Turn Steam inspect_link into a runnable steam:// URL. */
function inspectHref(item) {
  const link = item.inspect_link;
  if (!link) return null;
  // Steam inspect links come in `steam://rungame/730/...` OR already-templated
  // form with %owner_steamid%/%assetid%/%listingid% tokens. Replace tokens.
  return link
    .replace("%owner_steamid%", item.seller_steam_id || item.owner_steam_id || "0")
    .replace("%assetid%", item.asset_id || "0")
    .replace("%listingid%", "0");
}

/** Small info popup fired when a sticker chip is clicked. */
function StickerPopup({ sticker, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      data-testid="sticker-popup"
    >
      <div
        className="bg-[#121212] border border-white/10 rounded-xl p-6 max-w-sm w-full relative shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[#555] hover:text-white"
          data-testid="sticker-popup-close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-3">
          <Sparkles className="w-3 h-3" /> Applied sticker
        </div>
        <div className="font-display font-bold text-lg leading-tight mb-2">{sticker}</div>
        <div className="text-xs text-[#8A8A8A] leading-relaxed">
          Detailed sticker analytics — wear percentage, live market price and slot position —
          will unlock once the CSFloat inspect bot is wired in.
        </div>
      </div>
    </div>
  );
}

export default function SkinCard({ item, onClick, actionLabel = "Buy Now", testid, disabled }) {
  const { format } = useCurrency();
  const rarity = item.rarity || "consumer";
  const chips = detectQuality(item);
  const wearShort = item.wear ? WEAR_SHORT[item.wear] || item.wear : null;
  const inspect = inspectHref(item);
  const stickers = item.stickers || [];
  const [popupSticker, setPopupSticker] = useState(null);

  return (
    <>
      <div
        className={`skin-card group relative bg-[#121212] rounded-xl overflow-hidden rarity-border-${rarity} flex flex-col`}
        data-testid={testid || `skin-card-${item.id || item.asset_id}`}
      >
        {/* Image + rarity glow */}
        <div className="relative aspect-[4/3] bg-gradient-to-br from-[#0A0A0A] via-[#121212] to-[#050505] overflow-hidden">
          <div className={`absolute inset-0 rarity-bg-${rarity} transition-all duration-500 group-hover:brightness-150 group-hover:saturate-150`} />
          {item.image ? (
            <img
              src={item.image}
              alt={cleanName(item)}
              className="absolute inset-0 w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-110 drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[#333] font-mono text-xs">
              NO IMAGE
            </div>
          )}

          {/* Inspect-in-game — icon-only, top-right */}
          {inspect && (
            <a
              href={inspect}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/70 hover:bg-[#E4AE39] hover:text-black text-[#E0E0E0] backdrop-blur-sm border border-white/10 opacity-0 group-hover:opacity-100 transition-all"
              title="Inspect in-game"
              data-testid={`inspect-${item.asset_id || item.id}`}
              aria-label="Inspect in-game"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {/* Sticker strip — bottom of image, chips per slot */}
          {stickers.length > 0 && (
            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap gap-1">
              {stickers.slice(0, 5).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPopupSticker(s); }}
                  title={s}
                  data-testid={`sticker-${i}`}
                  className="px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 hover:border-[#E4AE39] hover:bg-black/90 text-[9px] font-mono text-[#E0E0E0] truncate max-w-[80px] transition-colors"
                >
                  {s.length > 12 ? s.slice(0, 12) + "…" : s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-3 flex flex-col gap-2 flex-1">
          {/* Weapon type */}
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#555] font-mono">
            {item.weapon || item.type || "CS2 Skin"}
          </div>

          {/* Name (colored by rarity) + quality/wear brackets */}
          <div className="flex items-start justify-between gap-2 min-h-[2.5rem]">
            <div className={`text-sm font-semibold leading-tight line-clamp-2 rarity-text-${rarity}`}>
              {cleanName(item)}
            </div>
          </div>

          {/* Quality chips row: StatTrak / Souvenir / ★ / Wear */}
          {(chips.length > 0 || wearShort) && (
            <div className="flex flex-wrap gap-1">
              {chips.map((c, i) => (
                <span
                  key={i}
                  className={
                    "text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border " +
                    (c.tone === "stattrak"
                      ? "bg-[#CF6A32]/15 border-[#CF6A32]/50 text-[#F0A97A]"
                      : c.tone === "souvenir"
                      ? "bg-[#FFD700]/10 border-[#FFD700]/40 text-[#FFD700]"
                      : "bg-[#E4AE39]/10 border-[#E4AE39]/40 text-[#E4AE39]")
                  }
                >
                  {c.label}
                </span>
              ))}
              {wearShort && (
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border border-white/15 bg-white/5 text-[#B0B0B0]">
                  [{wearShort}]
                </span>
              )}
            </div>
          )}

          {/* Float */}
          {item.float_value != null && (
            <div className="font-mono text-[10px] text-[#8A8A8A] flex items-center gap-1">
              <span className="text-[#555]">FLOAT</span>
              <span>{Number(item.float_value).toFixed(4)}</span>
            </div>
          )}

          {/* Price — dedicated line */}
          {item.price_usd != null && (
            <div className="mt-auto pt-2 border-t border-white/5">
              <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono">Price</div>
              <div className="font-mono text-lg font-bold text-[#E4AE39]">
                {format(item.price_usd)}
              </div>
            </div>
          )}

          {/* Buy button — its own dedicated line */}
          {onClick && (
            <button
              onClick={onClick}
              disabled={disabled}
              data-testid={`action-${item.id || item.asset_id}`}
              className="w-full text-[11px] font-bold uppercase tracking-widest bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A0A0A] px-3 py-2 rounded-lg transition-colors mt-1"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>

      {popupSticker && (
        <StickerPopup sticker={popupSticker} onClose={() => setPopupSticker(null)} />
      )}
    </>
  );
}
