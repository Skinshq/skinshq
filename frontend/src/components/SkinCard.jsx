import React from "react";
import { useCurrency } from "../context/CurrencyContext";

const rarityLabel = {
  consumer: "Consumer",
  industrial: "Industrial",
  milspec: "Mil-Spec",
  restricted: "Restricted",
  classified: "Classified",
  covert: "Covert",
  contraband: "★ Extraordinary",
};

export default function SkinCard({ item, onClick, actionLabel = "Buy Now", testid, disabled }) {
  const { format } = useCurrency();
  const rarity = item.rarity || "consumer";

  return (
    <div
      className={`skin-card group relative bg-[#121212] rounded-sm overflow-hidden rarity-border-${rarity} flex flex-col`}
      data-testid={testid || `skin-card-${item.id || item.asset_id}`}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] bg-gradient-to-br from-[#0A0A0A] via-[#121212] to-[#050505] overflow-hidden">
        <div className={`absolute inset-0 rarity-bg-${rarity}`} />
        {item.image ? (
          <img
            src={item.image}
            alt={item.skin_name || item.market_name}
            className="absolute inset-0 w-full h-full object-cover mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-300"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#333] font-mono text-xs">
            NO IMAGE
          </div>
        )}
        {/* Rarity label */}
        <div className={`absolute top-2 left-2 text-[10px] uppercase tracking-[0.2em] font-bold rarity-text-${rarity} bg-black/60 px-2 py-0.5 rounded-sm backdrop-blur-sm`}>
          {rarityLabel[rarity]}
        </div>
        {item.wear && (
          <div className="absolute top-2 right-2 text-[10px] uppercase tracking-wider font-mono bg-black/60 text-[#E0E0E0] px-2 py-0.5 rounded-sm backdrop-blur-sm">
            {item.wear}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#555] font-mono">
            {item.weapon || item.type || "CS2 Skin"}
          </div>
          <div className="text-sm font-medium text-[#E0E0E0] leading-tight line-clamp-2 min-h-[2.5rem]">
            {item.skin_name || item.market_name}
          </div>
        </div>

        {item.float_value != null && (
          <div className="font-mono text-[10px] text-[#8A8A8A] flex items-center gap-1">
            <span className="text-[#555]">FLT</span>
            <span>{Number(item.float_value).toFixed(4)}</span>
          </div>
        )}

        {item.price_usd != null && (
          <div className="mt-auto pt-2 flex items-end justify-between border-t border-white/5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#555]">Price</div>
              <div className="font-mono text-lg font-bold text-[#E4AE39]">
                {format(item.price_usd)}
              </div>
            </div>
            {onClick && (
              <button
                onClick={onClick}
                disabled={disabled}
                data-testid={`action-${item.id || item.asset_id}`}
                className="text-[11px] font-bold uppercase tracking-widest bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A0A0A] px-3 py-2 rounded-sm transition-colors"
              >
                {actionLabel}
              </button>
            )}
          </div>
        )}

        {item.price_usd == null && onClick && (
          <button
            onClick={onClick}
            disabled={disabled}
            data-testid={`action-${item.asset_id}`}
            className="mt-auto text-[11px] font-bold uppercase tracking-widest bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-40 text-[#0A0A0A] px-3 py-2 rounded-sm transition-colors"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
