import React from "react";
import { Heart } from "lucide-react";
import { useFavorites } from "../context/FavoritesContext";

/**
 * Heart toggle. Stops event propagation so it can safely live inside
 * a wrapping <Link>. Sizes: sm | md | lg.
 *
 * Props:
 *   - targetType    : "listing" | "skin"
 *   - targetId      : listing.id or master_id
 *   - snapshot      : optional { skin_name, image, wear, rarity, price_usd }
 *   - size          : "sm" | "md"
 */
export default function HeartButton({ targetType, targetId, snapshot, size = "sm", className = "" }) {
  const { isLiked, toggle } = useFavorites();
  const liked = isLiked(targetType, targetId);
  const dims = size === "md" ? "w-9 h-9" : "w-7 h-7";
  const icon = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(targetType, targetId, snapshot); }}
      data-testid={`heart-${targetType}-${targetId}`}
      aria-label={liked ? "Remove from favourites" : "Save to favourites"}
      className={`${dims} flex items-center justify-center rounded-sm backdrop-blur-sm border transition-all ${
        liked
          ? "bg-[#EB4B4B]/20 border-[#EB4B4B]/60 text-[#EB4B4B]"
          : "bg-black/50 border-white/10 text-white/70 hover:text-[#EB4B4B] hover:border-[#EB4B4B]/40"
      } ${className}`}
    >
      <Heart className={`${icon} ${liked ? "fill-current" : ""}`} />
    </button>
  );
}
