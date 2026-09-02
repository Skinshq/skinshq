import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Clock, AlertTriangle, Loader2, ShieldCheck, ExternalLink,
  Copy, X, RefreshCw, ArrowRight,
} from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";

// State machine mirrored from /app/backend/order_states.py
const STATE = {
  AWAITING_SELLER_TRADE: "AWAITING_SELLER_TRADE",
  TRADE_OFFER_REPORTED: "TRADE_OFFER_REPORTED",
  AWAITING_BUYER_ACCEPTANCE: "AWAITING_BUYER_ACCEPTANCE",
  TRADE_VERIFICATION: "TRADE_VERIFICATION",
  VERIFICATION_PENDING: "VERIFICATION_PENDING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  SELLER_TIMEOUT: "SELLER_TIMEOUT",
  MANUAL_REVIEW: "MANUAL_REVIEW",
  DISPUTED: "DISPUTED",
  REFUND_PENDING: "REFUND_PENDING",
};
// Legacy alias — orders reserved before the rename still carry TRADE_OFFER_SENT.
const isReportedState = (s) => s === STATE.TRADE_OFFER_REPORTED || s === "TRADE_OFFER_SENT";

const FAILURE_STATES = new Set([
  STATE.CANCELLED, STATE.SELLER_TIMEOUT, STATE.MANUAL_REVIEW,
  STATE.DISPUTED, STATE.REFUND_PENDING,
]);

const BUYER_STEPS = [
  { key: STATE.AWAITING_SELLER_TRADE,     label: "Payment confirmed",           hint: "Waiting for seller to send item" },
  { key: STATE.TRADE_OFFER_REPORTED,      label: "Trade offer received",        hint: "Check Steam & accept the offer" },
  { key: STATE.AWAITING_BUYER_ACCEPTANCE, label: "Confirming acceptance",       hint: "Verifying with Steam" },
  { key: STATE.TRADE_VERIFICATION,        label: "Verifying transfer",          hint: "Checking Steam inventory" },
  { key: STATE.COMPLETED,                 label: "Order completed",             hint: "Item locked by Steam for 7 days" },
];
const SELLER_STEPS = [
  { key: STATE.AWAITING_SELLER_TRADE,     label: "Item sold",                   hint: "Send Steam trade offer now" },
  { key: STATE.TRADE_OFFER_REPORTED,      label: "Trade offer sent (reported)", hint: "Waiting for buyer to accept in Steam" },
  { key: STATE.AWAITING_BUYER_ACCEPTANCE, label: "Buyer accepting",             hint: "Steam is processing" },
  { key: STATE.TRADE_VERIFICATION,        label: "Verifying transfer",          hint: "Backend confirming Steam movement" },
  { key: STATE.COMPLETED,                 label: "Sale completed",              hint: "Wallet credited (in-app balance)" },
];

function orderStepIndex(status, steps) {
  const idx = steps.findIndex(s => s.key === status);
  return idx >= 0 ? idx : (status === STATE.VERIFICATION_PENDING ? 3 : -1);
}

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const { format } = useCurrency();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/orders/${orderId}`);
      setOrder(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Poll while in active-but-transient states so state changes appear live
  useEffect(() => {
    if (!order) return;
    const transient = new Set([
      STATE.AWAITING_SELLER_TRADE, STATE.TRADE_OFFER_REPORTED,
      STATE.AWAITING_BUYER_ACCEPTANCE, STATE.TRADE_VERIFICATION,
      STATE.VERIFICATION_PENDING,
    ]);
    if (!transient.has(order.status)) return;
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [order, load]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#E4AE39]" />
      </div>
    );
  }
  if (!order) return null;

  const isBuyer = user && order.buyer_id === user.id;
  const isSeller = user && order.seller_id === user.id;
  const role = isBuyer ? "buyer" : (isSeller ? "seller" : "guest");
  const steps = isBuyer ? BUYER_STEPS : SELLER_STEPS;
  const activeIdx = orderStepIndex(order.status, steps);
  const failed = FAILURE_STATES.has(order.status);

  const act = async (fn) => { setBusy(true); try { await fn(); await load(); } finally { setBusy(false); } };

  const markTradeSent = () => act(async () => {
    try {
      await api.post(`/orders/${order.id}/mark-trade-sent`);
      toast.success("Marked as sent. Buyer notified.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  });
  const confirmReceived = () => act(async () => {
    try {
      const { data } = await api.post(`/orders/${order.id}/confirm-received`);
      if (data.verified) toast.success("Trade verified ✓");
      else toast.warning(data.detail || "Verification will retry");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  });
  const retryVerify = () => act(async () => {
    try {
      const { data } = await api.post(`/orders/${order.id}/retry-verification`);
      if (data.verified) toast.success("Trade verified ✓");
      else toast.warning(data.detail || "Still not visible — try again shortly");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  });
  const cancel = () => act(async () => {
    if (!window.confirm("Cancel this order? The listing goes back on the marketplace.")) return;
    try {
      await api.post(`/orders/${order.id}/cancel`, { reason: "Buyer cancelled from order page" });
      toast.success("Order cancelled");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  });
  const dispute = () => act(async () => {
    const reason = window.prompt("Describe the issue (this opens a dispute for admin review):");
    if (!reason) return;
    try {
      await api.post(`/orders/${order.id}/dispute`, { reason });
      toast.success("Dispute opened — an admin will review shortly.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  });

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-12 py-10" data-testid="order-detail">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/orders" className="text-[11px] uppercase tracking-[0.3em] text-[#8A8A8A] hover:text-[#E4AE39] font-mono">← All orders</Link>
          <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight mt-2">
            {order.skin_name}
          </h1>
          <div className="text-xs text-[#555] font-mono mt-1">
            Order #{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#8A8A8A] font-mono">Total</div>
          <div className="text-2xl font-mono font-bold text-[#E4AE39]">{format(order.price_usd)}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
        {/* Item card */}
        <div className="bg-[#121212] border border-white/5 rounded-sm overflow-hidden">
          <div className={`aspect-square bg-[#0A0A0A] flex items-center justify-center p-6 rarity-bg-${order.listing_snapshot?.rarity || "consumer"}`}>
            {order.image && <img src={order.image} alt="" className="max-w-full max-h-full object-contain drop-shadow-lg" />}
          </div>
          <div className="p-4 space-y-1 border-t border-white/5">
            <div className={`text-[9px] uppercase tracking-widest font-bold rarity-text-${order.listing_snapshot?.rarity || "consumer"}`}>
              {order.listing_snapshot?.rarity}
            </div>
            <div className="text-sm font-medium">{order.market_hash_name || order.skin_name}</div>
            {order.listing_snapshot?.wear && <div className="text-[11px] text-[#8A8A8A]">{order.listing_snapshot.wear}</div>}
            <div className="pt-3 mt-3 border-t border-white/5 space-y-1 text-[10px] font-mono text-[#8A8A8A]">
              <FieldRow label="Asset ID" value={order.asset_id} />
              <FieldRow label="Class ID" value={order.class_id} />
              <FieldRow label="Instance ID" value={order.instance_id} />
            </div>
          </div>
        </div>

        {/* Timeline + actions */}
        <div className="space-y-6">
          {/* Timeline */}
          <div className="bg-[#121212] border border-white/5 rounded-sm p-6">
            <div className="text-[11px] uppercase tracking-[0.3em] text-[#E4AE39] font-mono mb-4">
              {role === "seller" ? "Seller flow" : role === "buyer" ? "Your order" : "Order flow"}
            </div>
            {failed ? (
              <FailureBlock status={order.status} order={order} />
            ) : (
              <ol className="space-y-4">
                {steps.map((s, i) => {
                  const done = i < activeIdx;
                  const active = i === activeIdx;
                  return (
                    <li key={s.key} className="flex items-start gap-3" data-testid={`step-${s.key}`}>
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-[#2ECC71] flex-shrink-0 mt-0.5" />
                      ) : active ? (
                        <Loader2 className="w-5 h-5 text-[#E4AE39] flex-shrink-0 mt-0.5 animate-spin" />
                      ) : (
                        <Circle className="w-5 h-5 text-[#333] flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${done ? "text-[#E0E0E0]" : active ? "text-[#E4AE39]" : "text-[#555]"}`}>
                          {s.label}
                        </div>
                        <div className={`text-[11px] mt-0.5 ${active ? "text-[#B0B0B0]" : "text-[#555]"}`}>
                          {s.hint}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Role-specific action panel */}
          {isSeller && order.status === STATE.AWAITING_SELLER_TRADE && (
            <SellerTradePanel order={order} onMarkSent={markTradeSent} busy={busy} />
          )}
          {isSeller && isReportedState(order.status) && (
            <StatusCard tone="info" title="Trade offer sent — awaiting buyer" desc="You reported sending the trade. Waiting for the buyer to accept it in Steam. You'll be notified once inventory verification confirms transfer." />
          )}
          {isBuyer && order.status === STATE.AWAITING_SELLER_TRADE && (
            <BuyerWaitingSellerPanel order={order} onCancel={cancel} busy={busy} />
          )}
          {isBuyer && isReportedState(order.status) && (
            <BuyerAcceptPanel order={order} onConfirm={confirmReceived} onDispute={dispute} busy={busy} />
          )}
          {order.status === STATE.VERIFICATION_PENDING && (isBuyer || isSeller) && (
            <VerificationPendingPanel order={order} onRetry={retryVerify} onDispute={dispute} busy={busy} />
          )}
          {order.status === STATE.COMPLETED && (
            <CompletedPanel order={order} />
          )}

          {/* Trade protection */}
          {order.status === STATE.COMPLETED && order.trade_locked_until && (
            <TradeProtection lockUntil={order.trade_locked_until} />
          )}

          {/* Last verification detail */}
          {order.last_verification_audit && (
            <div className="bg-[#0A0A0A] border border-white/5 rounded-sm p-4">
              <div className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-mono mb-2">Last verification pass</div>
              <div className="text-xs text-[#B0B0B0]">{order.last_verification_audit.detail}</div>
              <div className="text-[10px] text-[#555] font-mono mt-1">
                {new Date(order.last_verification_audit.checked_at).toLocaleString()} · buyer:{order.last_verification_audit.buyer_inventory_reason} · seller:{order.last_verification_audit.seller_inventory_reason}
              </div>
            </div>
          )}

          {/* Full audit log */}
          {order.state_history?.length > 0 && (
            <details className="bg-[#0A0A0A] border border-white/5 rounded-sm p-4">
              <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-[#8A8A8A] font-mono">
                State history ({order.state_history.length})
              </summary>
              <ol className="mt-3 space-y-2 text-[11px] font-mono">
                {order.state_history.map((h, i) => (
                  <li key={i} className="text-[#B0B0B0]">
                    <span className="text-[#555]">{new Date(h.at).toLocaleString()}</span>
                    {" "}
                    <span className="text-[#555]">{h.from || "—"}</span>
                    {" "}<ArrowRight className="w-3 h-3 inline text-[#555]" />{" "}
                    <span className="text-[#E4AE39]">{h.to}</span>
                    {h.reason && <span className="text-[#8A8A8A]"> · {h.reason}</span>}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value }) {
  const copy = () => { navigator.clipboard.writeText(value || ""); toast.success("Copied"); };
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <button onClick={copy} className="text-[#E0E0E0] hover:text-[#E4AE39] flex items-center gap-1 truncate max-w-[180px]" title={value}>
        <span className="truncate">{value || "—"}</span>
        {value && <Copy className="w-3 h-3 flex-shrink-0" />}
      </button>
    </div>
  );
}

function SellerTradePanel({ order, onMarkSent, busy }) {
  const [copied, setCopied] = useState(false);
  const copyUrl = () => { navigator.clipboard.writeText(order.buyer_trade_url); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const deadline = order.seller_trade_deadline ? new Date(order.seller_trade_deadline) : null;
  const buyerProfileUrl = order.buyer_steam_id ? `https://steamcommunity.com/profiles/${order.buyer_steam_id}` : null;
  // steam:// deep-link opens the desktop Steam client directly to the New Trade Offer page.
  const steamDesktopDeepLink = `steam://openurl/${order.buyer_trade_url}`;
  const openSteamTrade = () => {
    // Open in a new tab — Steam's own page handles the login and item selection.
    window.open(order.buyer_trade_url, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="bg-[#E4AE39]/10 border border-[#E4AE39]/40 rounded-sm p-5 space-y-4" data-testid="seller-trade-panel">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#E4AE39] flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold text-[#E4AE39]">Send the Steam trade offer now</div>
          <div className="text-xs text-[#B0B0B0] mt-1">
            Click the big button below. Steam's own trade page opens with the buyer already selected —
            you just pick the exact item from your inventory and hit Send inside Steam.
            Deadline: <b className="text-[#E4AE39]">{deadline ? deadline.toLocaleString() : "24h"}</b>.
          </div>
        </div>
      </div>

      {/* Buyer identity block */}
      <div className="bg-[#0A0A0A] border border-white/10 rounded-sm p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-mono">Buyer</div>
            <div className="text-sm font-medium mt-0.5">{order.buyer_name}</div>
            <div className="text-[10px] font-mono text-[#555]">SteamID64: {order.buyer_steam_id}</div>
          </div>
          {buyerProfileUrl && (
            <a href={buyerProfileUrl} target="_blank" rel="noreferrer"
               className="text-[10px] uppercase tracking-widest text-[#E4AE39] hover:underline flex items-center gap-1">
              Steam profile <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Item to send */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-mono mb-1">Exact item to send</div>
        <div className="bg-[#0A0A0A] border border-white/10 rounded-sm p-3 flex gap-3 items-center">
          {order.image && <img src={order.image} className="w-12 h-12 object-contain bg-black rounded-sm" alt="" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{order.market_hash_name}</div>
            <div className="text-[10px] font-mono text-[#555] truncate">
              asset {order.asset_id} · class {order.class_id}
            </div>
          </div>
        </div>
      </div>

      {/* PRIMARY CTA — opens buyer's Steam trade URL in a new tab */}
      <button onClick={openSteamTrade}
        data-testid="open-steam-trade"
        className="w-full bg-[#4B69FF] hover:bg-[#5B79FF] text-white font-bold px-6 py-4 rounded-sm text-sm uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[#4B69FF]/20">
        <ExternalLink className="w-4 h-4" />
        Open Steam & Send Trade to {order.buyer_name}
      </button>
      <div className="flex items-center justify-between text-[10px] font-mono text-[#8A8A8A]">
        <a href={steamDesktopDeepLink} data-testid="open-steam-desktop"
           className="hover:text-[#E4AE39]">Open in Steam desktop app →</a>
        <button onClick={copyUrl} data-testid="copy-trade-url" className="hover:text-[#E4AE39] flex items-center gap-1">
          {copied ? "✓ copied" : (<><Copy className="w-3 h-3" /> copy URL</>)}
        </button>
      </div>

      {/* CONFIRM after sending — clearly separated + secondary style */}
      <div className="pt-3 border-t border-[#E4AE39]/20">
        <div className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-mono mb-2">After you clicked Send inside Steam</div>
        <button onClick={onMarkSent} disabled={busy}
          data-testid="mark-trade-sent"
          className="w-full bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-50 text-[#0A0A0A] font-bold px-6 py-3 rounded-sm text-xs uppercase tracking-widest">
          {busy ? "Marking…" : "I have sent the trade offer"}
        </button>
        <div className="text-[10px] text-[#8A8A8A] leading-relaxed mt-2">
          This <b>only</b> updates the order status. It does not complete the sale — the backend
          still verifies the item actually moved through Steam. SKIN.MRKT will <b>never</b> ask
          for your Steam password or Guard code.
        </div>
      </div>
    </div>
  );
}

function BuyerWaitingSellerPanel({ order, onCancel, busy }) {
  const deadline = order.seller_trade_deadline ? new Date(order.seller_trade_deadline) : null;
  return (
    <div className="bg-[#4B69FF]/10 border border-[#4B69FF]/40 rounded-sm p-5 space-y-3" data-testid="buyer-waiting">
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-[#4B69FF] flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold text-[#4B69FF]">Waiting for {order.seller_name} to send the trade</div>
          <div className="text-xs text-[#B0B0B0] mt-1">
            Seller has until <b className="text-[#E0E0E0]">{deadline ? deadline.toLocaleString() : "24h"}</b> to
            send the Steam trade offer to your saved trade URL. You'll get an email + in-app alert the moment they do.
          </div>
        </div>
      </div>
      <button onClick={onCancel} disabled={busy}
        data-testid="cancel-order"
        className="text-[11px] uppercase tracking-widest text-[#EB4B4B] hover:text-[#F56060]">
        <X className="w-3 h-3 inline mr-1" />
        Cancel order
      </button>
    </div>
  );
}

function BuyerAcceptPanel({ order, onConfirm, onDispute, busy }) {
  return (
    <div className="bg-[#E4AE39]/10 border border-[#E4AE39]/40 rounded-sm p-5 space-y-4" data-testid="buyer-accept-panel">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#E4AE39] flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold text-[#E4AE39]">The seller says they sent the trade — go accept it in Steam</div>
          <div className="text-xs text-[#B0B0B0] mt-1 leading-relaxed">
            Open Steam → <a href="https://steamcommunity.com/my/tradeoffers/" target="_blank" rel="noreferrer" className="text-[#E4AE39] underline">Trade Offers <ExternalLink className="w-3 h-3 inline" /></a> →
            confirm the offer is for <b>{order.market_hash_name}</b> → accept.
            Once accepted, click below and we'll verify the item is in your inventory.
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={busy}
          data-testid="confirm-received"
          className="flex-1 bg-[#E4AE39] hover:bg-[#F5C75A] disabled:opacity-50 text-[#0A0A0A] font-bold px-6 py-3 rounded-sm text-xs uppercase tracking-widest">
          {busy ? "Verifying…" : "I accepted the trade — verify"}
        </button>
        <button onClick={onDispute} disabled={busy}
          data-testid="open-dispute"
          className="bg-[#0A0A0A] border border-[#EB4B4B]/40 hover:border-[#EB4B4B] text-[#EB4B4B] px-4 py-3 rounded-sm text-xs uppercase tracking-widest">
          Dispute
        </button>
      </div>
    </div>
  );
}

function VerificationPendingPanel({ order, onRetry, onDispute, busy }) {
  return (
    <div className="bg-[#EB4B4B]/10 border border-[#EB4B4B]/40 rounded-sm p-5 space-y-4" data-testid="verification-pending-panel">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#EB4B4B] flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold text-[#EB4B4B]">Verification inconclusive</div>
          <div className="text-xs text-[#B0B0B0] mt-1">
            We couldn't confirm the item is in the buyer's inventory yet. Steam sometimes takes a couple
            of minutes to reflect a trade. Try again in ~30s.
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onRetry} disabled={busy}
          data-testid="retry-verify"
          className="flex-1 bg-[#EB4B4B]/20 hover:bg-[#EB4B4B]/30 disabled:opacity-50 text-[#EB4B4B] font-bold px-4 py-3 rounded-sm text-xs uppercase tracking-widest flex items-center justify-center gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Retry verification
        </button>
        <button onClick={onDispute} disabled={busy}
          className="bg-[#0A0A0A] border border-[#EB4B4B]/40 hover:border-[#EB4B4B] text-[#EB4B4B] px-4 py-3 rounded-sm text-xs uppercase tracking-widest">
          Escalate
        </button>
      </div>
      <div className="text-[10px] text-[#8A8A8A] font-mono">
        Retries: {order.verification_retries || 0} / 6 · after that the order moves to admin manual review.
      </div>
    </div>
  );
}

function CompletedPanel({ order }) {
  return (
    <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/40 rounded-sm p-5" data-testid="completed-panel">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#2ECC71] flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-bold text-[#2ECC71]">Trade verified & complete</div>
          <div className="text-xs text-[#B0B0B0] mt-1">
            The item is confirmed in the buyer's Steam inventory. Seller wallet has been credited
            <b className="text-[#2ECC71]"> ${order.price_usd?.toFixed(2)}</b> as in-app balance (real bank
            payout via Stripe Connect is a future step).
          </div>
        </div>
      </div>
    </div>
  );
}

function TradeProtection({ lockUntil }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const target = new Date(lockUntil).getTime();
  const diff = target - now;
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return (
    <div className="bg-[#0A0A0A] border border-[#EB4B4B]/30 rounded-sm p-4" data-testid="trade-protection">
      <div className="text-[10px] uppercase tracking-widest text-[#EB4B4B] font-mono mb-1">🔒 Steam trade protection</div>
      <div className="text-xs text-[#B0B0B0]">
        Item will be re-tradable on Steam on <b className="text-[#E0E0E0]">{new Date(lockUntil).toLocaleString()}</b>
      </div>
      <div className="text-[11px] font-mono text-[#EB4B4B] mt-1">
        {d}d {h}h {m}m
      </div>
      <div className="text-[10px] text-[#555] mt-2">
        This countdown is informational — Steam enforces the actual lock.
      </div>
    </div>
  );
}

function FailureBlock({ status, order }) {
  const map = {
    [STATE.CANCELLED]:     { title: "Order cancelled", desc: "The buyer cancelled before the seller sent the trade. The listing is back on the marketplace.", tone: "info" },
    [STATE.SELLER_TIMEOUT]:{ title: "Seller didn't respond", desc: "The seller failed to send the Steam trade offer in time. The listing has been returned to the marketplace.", tone: "warn" },
    [STATE.MANUAL_REVIEW]: { title: "Under manual review", desc: "Automated verification couldn't confirm the trade. An admin will investigate and update this order.", tone: "warn" },
    [STATE.DISPUTED]:      { title: "Order disputed", desc: "A dispute was opened. An admin will contact both parties.", tone: "warn" },
    [STATE.REFUND_PENDING]:{ title: "Refund pending", desc: "An admin is processing a refund for this order.", tone: "warn" },
  };
  const m = map[status] || { title: status, desc: "This order is in a non-active state.", tone: "warn" };
  const color = m.tone === "info" ? "#4B69FF" : "#EB4B4B";
  return (
    <div className="flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color }} />
      <div>
        <div className="text-sm font-bold" style={{ color }}>{m.title}</div>
        <div className="text-xs text-[#B0B0B0] mt-1">{m.desc}</div>
      </div>
    </div>
  );
}

function StatusCard({ tone, title, desc }) {
  const color = tone === "info" ? "#4B69FF" : "#E4AE39";
  const bg = tone === "info" ? "bg-[#4B69FF]/10 border-[#4B69FF]/40" : "bg-[#E4AE39]/10 border-[#E4AE39]/40";
  return (
    <div className={`${bg} border rounded-sm p-5`}>
      <div className="text-sm font-bold" style={{ color }}>{title}</div>
      <div className="text-xs text-[#B0B0B0] mt-1">{desc}</div>
    </div>
  );
}
