import React, { useEffect, useState } from "react";
import { X, ChevronRight } from "lucide-react";
import {
  GiWinchesterRifle, GiPistolGun, GiMinigun, GiUzi,
  GiShotgun, GiPeriscope, GiCurvyKnife, GiBoxingGlove,
  GiCardboardBox, GiFilmProjector, GiMusicalNotes, GiPoliceBadge,
  GiPin, GiSpray, GiTrophy, GiTrophyCup, GiStarMedal,
} from "react-icons/gi";
import api from "../lib/api";

// Map every backend `type` to an icon
const ICONS = {
  "Rifle": GiWinchesterRifle,
  "Sniper Rifle": GiPeriscope,
  "SMG": GiUzi,
  "Shotgun": GiShotgun,
  "Machinegun": GiMinigun,
  "Pistol": GiPistolGun,
  "Knife": GiCurvyKnife,
  "Gloves": GiBoxingGlove,
  "Case": GiCardboardBox,
  "Sticker Capsule": GiFilmProjector,
  "Autograph Capsule": GiStarMedal,
  "Music Kit Box": GiMusicalNotes,
  "Patch Capsule": GiPoliceBadge,
  "Pins Capsule": GiPin,
  "Graffiti Box": GiSpray,
  "Souvenir Package": GiTrophy,
  "Souvenir Highlight": GiTrophyCup,
};

/**
 * Left-side category sidebar. Persistent column on desktop (lg+),
 * slide-out drawer on mobile.
 *
 * Props:
 *   - selected  : currently-selected type string ("" for All)
 *   - onSelect  : callback(type)
 *   - isOpen    : mobile drawer open state
 *   - onClose   : mobile drawer close cb
 */
export default function CategorySidebar({ selected, onSelect, isOpen, onClose }) {
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get("/skins/categories")
      .then(({ data }) => { setGroups(data.groups || []); setTotal(data.total || 0); })
      .catch(() => {});
  }, []);

  const pick = (t) => {
    onSelect(t);
    if (onClose) onClose();
  };

  const content = (
    <div className="h-full flex flex-col gap-6 py-6 px-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-1">
          Categories
        </div>
        <button
          type="button"
          onClick={() => pick("")}
          data-testid="cat-all"
          className={`w-full flex items-center justify-between text-sm font-medium py-2 px-3 rounded-sm transition-colors ${
            !selected
              ? "bg-[#E4AE39] text-[#0A0A0A]"
              : "bg-[#121212] hover:bg-white/5 text-[#E0E0E0]"
          }`}
        >
          <span>All items</span>
          <span className="text-[10px] font-mono opacity-70">{total.toLocaleString()}</span>
        </button>
      </div>

      {groups.map((g) => (
        <div key={g.key}>
          <div className="text-[10px] uppercase tracking-widest text-[#555] font-mono mb-2 px-1">
            {g.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.type];
              const active = selected === it.type;
              return (
                <button
                  key={it.type}
                  type="button"
                  onClick={() => pick(it.type)}
                  data-testid={`cat-${it.type.toLowerCase().replace(/\s+/g, "-")}`}
                  className={`group flex items-center gap-2 py-2 px-3 rounded-sm text-sm text-left transition-colors ${
                    active
                      ? "bg-[#E4AE39] text-[#0A0A0A] font-medium"
                      : "text-[#B0B0B0] hover:text-[#E0E0E0] hover:bg-white/5"
                  }`}
                >
                  {Icon ? (
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "" : "text-[#E4AE39]/70 group-hover:text-[#E4AE39]"}`} />
                  ) : (
                    <span className="w-4 h-4" />
                  )}
                  <span className="flex-1 truncate">{it.type}</span>
                  <span className={`text-[10px] font-mono ${active ? "opacity-70" : "text-[#555]"}`}>
                    {it.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden lg:block w-60 shrink-0 sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-y-auto border-r border-white/5 bg-[#0A0A0A]">
        {content}
      </aside>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" data-testid="mobile-drawer">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <aside className="relative w-72 max-w-[85%] h-full bg-[#0A0A0A] border-r border-white/10 overflow-y-auto animate-in slide-in-from-left duration-200">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 bg-white/5 hover:bg-white/10 rounded-sm"
              data-testid="drawer-close"
            >
              <X className="w-4 h-4" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
