import React from "react";

// CS2 wear tier boundaries (float value)
const WEAR_TIERS = [
  { key: "FN", label: "Factory New",    from: 0.00, to: 0.07, color: "#2ECC71" }, // green
  { key: "MW", label: "Minimal Wear",   from: 0.07, to: 0.15, color: "#A3E635" }, // lime
  { key: "FT", label: "Field-Tested",   from: 0.15, to: 0.38, color: "#FACC15" }, // yellow
  { key: "WW", label: "Well-Worn",      from: 0.38, to: 0.45, color: "#F97316" }, // orange
  { key: "BS", label: "Battle-Scarred", from: 0.45, to: 1.00, color: "#EF4444" }, // red
];

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const pct = (v) => `${clamp(v) * 100}%`;

export function tierForFloat(f) {
  if (f == null || Number.isNaN(f)) return null;
  return WEAR_TIERS.find((t) => f >= t.from && f < t.to) || WEAR_TIERS[WEAR_TIERS.length - 1];
}

/**
 * Compact color-coded float range bar.
 * Props:
 *   - min, max          : the min_float / max_float allowed for this skin
 *   - value (optional)  : specific float value to mark (for listings)
 *   - size = "sm"|"md"  : height variant
 *   - showLabels        : show FN/MW/FT/WW/BS ticks under the bar
 */
export default function FloatBar({ min = 0, max = 1, value = null, size = "sm", showLabels = false }) {
  const height = size === "md" ? 8 : 4;
  const lo = clamp(min);
  const hi = clamp(max);

  return (
    <div className="w-full select-none" data-testid="float-bar">
      {/* Base track — colored segments by wear tier */}
      <div className="relative w-full rounded-full overflow-hidden bg-[#0A0A0A]" style={{ height }}>
        {WEAR_TIERS.map((t) => (
          <div
            key={t.key}
            className="absolute top-0 bottom-0"
            style={{
              left: pct(t.from),
              width: pct(t.to - t.from),
              background: t.color,
              opacity: 0.6,
            }}
          />
        ))}
        {/* Dim regions outside this skin's [min,max] range */}
        {lo > 0 && (
          <div className="absolute top-0 bottom-0 bg-black/70" style={{ left: 0, width: pct(lo) }} />
        )}
        {hi < 1 && (
          <div className="absolute top-0 bottom-0 bg-black/70" style={{ left: pct(hi), right: 0 }} />
        )}
        {/* Value marker */}
        {value != null && !Number.isNaN(value) && (
          <div
            className="absolute -top-0.5 bottom-[-2px] w-[2px] bg-white shadow-[0_0_4px_#fff]"
            style={{ left: `calc(${pct(value)} - 1px)` }}
          />
        )}
      </div>

      {showLabels && (
        <div className="relative mt-1 h-3 text-[8px] font-mono text-[#666] uppercase tracking-widest">
          {WEAR_TIERS.map((t) => (
            <span
              key={t.key}
              className="absolute -translate-x-1/2"
              style={{ left: pct((t.from + t.to) / 2) }}
            >
              {t.key}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
