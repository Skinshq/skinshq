import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

/**
 * Global banner: whenever the signed-in user has any sale sitting in
 * AWAITING_SELLER_TRADE, remind them to send the Steam trade. Polls every 30s.
 * Auto-hides when they have nothing pending.
 */
export default function PendingSalesBanner() {
  const { user } = useAuth();
  const [pending, setPending] = useState([]);

  useEffect(() => {
    if (!user) { setPending([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get("/my/orders");
        if (cancelled) return;
        const p = (data.sells || []).filter(o => o.status === "AWAITING_SELLER_TRADE");
        setPending(p);
      } catch { /* silent */ }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user]);

  if (!user || pending.length === 0) return null;

  const first = pending[0];
  const label = pending.length === 1
    ? `You sold ${first.skin_name} — send the Steam trade now`
    : `You have ${pending.length} sales waiting to be sent`;
  const link = pending.length === 1 ? `/order/${first.id}` : `/orders`;

  return (
    <Link
      to={link}
      data-testid="pending-sales-banner"
      className="block bg-[#E4AE39]/15 border-b border-[#E4AE39]/40 hover:bg-[#E4AE39]/20 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-2.5 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-[#E4AE39] flex-shrink-0" />
        <span className="text-xs sm:text-sm text-[#E0E0E0] flex-1 min-w-0 truncate">
          <b className="text-[#E4AE39]">Action needed:</b> {label}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-[#E4AE39] font-mono flex items-center gap-1 flex-shrink-0">
          {pending.length === 1 ? "Open order" : "View sales"} <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  );
}
