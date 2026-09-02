import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { toast } from "sonner";

export default function OrdersPage() {
  const { user, loginWithSteam } = useAuth();
  const { format } = useCurrency();
  const [buys, setBuys] = useState([]);
  const [sells, setSells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("buys");

  useEffect(() => {
    if (!user) return;
    api.get("/my/orders")
      .then(({ data }) => { setBuys(data.buys || []); setSells(data.sells || []); })
      .catch(() => toast.error("Failed to load orders"))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-24 text-center">
        <h2 className="font-display font-black text-3xl mb-4">Sign in to see your orders</h2>
        <button onClick={loginWithSteam} data-testid="orders-login-cta" className="bg-[#171A21] hover:bg-[#2A475E] border border-[#2A475E] px-6 py-3 rounded-sm">
          Sign in with Steam
        </button>
      </div>
    );
  }

  const rows = tab === "buys" ? buys : sells;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-2">Orders</div>
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight">Transaction history</h1>
      </div>

      <div className="flex gap-1 mb-6 border-b border-white/10">
        <TabButton active={tab === "buys"} onClick={() => setTab("buys")} testid="tab-buys">
          Purchases ({buys.length})
        </TabButton>
        <TabButton active={tab === "sells"} onClick={() => setTab("sells")} testid="tab-sells">
          Sales ({sells.length})
        </TabButton>
      </div>

      {loading ? (
        <div className="text-[#8A8A8A]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-sm text-[#8A8A8A]">
          No {tab === "buys" ? "purchases" : "sales"} yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((o) => (
            <div key={o.id} className="bg-[#121212] border border-white/5 hover:border-white/10 rounded-sm p-4 flex flex-wrap items-center gap-4" data-testid={`order-${o.id}`}>
              {o.listing_snapshot?.image && (
                <img src={o.listing_snapshot.image} alt="" className="w-16 h-16 object-cover rounded-sm bg-black" />
              )}
              <div className="flex-1 min-w-[200px]">
                <div className={`text-[10px] uppercase tracking-widest font-bold rarity-text-${o.listing_snapshot?.rarity}`}>
                  {o.listing_snapshot?.rarity}
                </div>
                <div className="font-medium text-sm">{o.listing_snapshot?.skin_name}</div>
                <div className="text-xs text-[#555] font-mono mt-1">
                  {o.id.slice(0, 8)} • {new Date(o.created_at).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-[#E4AE39]">{format(o.amount_usd)}</div>
                <StatusBadge status={o.status} tradeStatus={o.trade_status} />
                <TradeLock lockUntil={o.trade_locked_until} status={o.status} />
              </div>
              <Link
                to={`/order/${o.id}`}
                data-testid={`view-order-${o.id}`}
                className="text-xs uppercase tracking-widest bg-[#0A0A0A] border border-white/10 hover:border-[#E4AE39]/50 px-3 py-2 rounded-sm"
              >
                View
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`px-4 py-2 text-sm uppercase tracking-wider font-medium border-b-2 -mb-px transition-colors ${
        active ? "text-[#E4AE39] border-[#E4AE39]" : "text-[#8A8A8A] border-transparent hover:text-[#E0E0E0]"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status, tradeStatus }) {
  // Support both the new P2P state machine and legacy Stripe orders (paid/pending).
  const NEW_STATE_LABELS = {
    AWAITING_SELLER_TRADE: { label: "Awaiting seller trade", color: "text-[#4B69FF]" },
    TRADE_OFFER_SENT: { label: "Trade offer sent", color: "text-[#E4AE39]" },
    AWAITING_BUYER_ACCEPTANCE: { label: "Awaiting acceptance", color: "text-[#E4AE39]" },
    TRADE_VERIFICATION: { label: "Verifying", color: "text-[#E4AE39]" },
    VERIFICATION_PENDING: { label: "Verification retrying", color: "text-[#EB4B4B]" },
    COMPLETED: { label: "Completed", color: "text-[#2ECC71]" },
    CANCELLED: { label: "Cancelled", color: "text-[#8A8A8A]" },
    SELLER_TIMEOUT: { label: "Seller timeout", color: "text-[#EB4B4B]" },
    MANUAL_REVIEW: { label: "Manual review", color: "text-[#EB4B4B]" },
    DISPUTED: { label: "Disputed", color: "text-[#EB4B4B]" },
    REFUND_PENDING: { label: "Refund pending", color: "text-[#EB4B4B]" },
  };
  if (NEW_STATE_LABELS[status]) {
    const m = NEW_STATE_LABELS[status];
    return <div className={`text-[10px] uppercase tracking-widest ${m.color} font-bold mt-1`}>{m.label}</div>;
  }
  // Legacy fallback
  const label = tradeStatus === "completed" ? "Completed"
    : status === "paid" ? "Paid"
    : status === "pending" ? "Pending payment"
    : status;
  const color = tradeStatus === "completed" ? "text-[#2ECC71]"
    : status === "paid" ? "text-[#4B69FF]"
    : "text-[#8A8A8A]";
  return <div className={`text-[10px] uppercase tracking-widest ${color} font-bold mt-1`}>{label}</div>;
}

// Live countdown until CS2 7-day trade hold expires
function TradeLock({ lockUntil, status }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (status !== "paid" || !lockUntil) return;
    const t = setInterval(() => setNow(Date.now()), 60000); // tick every minute
    return () => clearInterval(t);
  }, [lockUntil, status]);
  if (status !== "paid" || !lockUntil) return null;
  const target = new Date(lockUntil).getTime();
  const diff = target - now;
  if (diff <= 0) {
    return (
      <div data-testid="trade-unlocked" className="mt-1.5 inline-flex items-center gap-1 bg-[#2ECC71]/15 border border-[#2ECC71]/40 text-[#2ECC71] text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm">
        ✓ Tradable
      </div>
    );
  }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const parts = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  const unlockDate = new Date(lockUntil).toLocaleString(undefined,
    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div data-testid="trade-locked" className="mt-1.5">
      <div className="inline-flex items-center gap-1 bg-[#EB4B4B]/15 border border-[#EB4B4B]/40 text-[#EB4B4B] text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm">
        🔒 Locked · {parts}
      </div>
      <div className="text-[9px] text-[#555] font-mono mt-0.5">tradable {unlockDate}</div>
    </div>
  );
}
