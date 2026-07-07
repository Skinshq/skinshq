import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import api from "../lib/api";
import { useCurrency } from "../context/CurrencyContext";
import { toast } from "sonner";

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const orderId = params.get("order_id");
  const [order, setOrder] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const { format } = useCurrency();

  const load = async () => {
    if (!orderId) return;
    try {
      const { data } = await api.get(`/orders/${orderId}/status`);
      setOrder(data);
    } catch {
      toast.error("Could not load order");
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 2500);
    return () => clearInterval(iv);
  }, [orderId]);

  const confirmTrade = async () => {
    setConfirming(true);
    try {
      await api.post(`/orders/${orderId}/confirm-trade`);
      toast.success("Trade confirmed. Funds released to seller.");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setConfirming(false);
    }
  };

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#E4AE39] mx-auto mb-4" />
        <p className="text-[#8A8A8A]">Loading your order…</p>
      </div>
    );
  }

  const paid = order.status === "paid";
  const completed = order.trade_status === "completed";

  return (
    <div className="max-w-2xl mx-auto px-6 py-16" data-testid="checkout-success-page">
      <div className="text-center mb-10">
        <CheckCircle2 className="w-16 h-16 text-[#2ECC71] mx-auto mb-4" />
        <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight mb-2">
          {paid ? "Payment received" : "Waiting for payment…"}
        </h1>
        <p className="text-[#8A8A8A]">
          Order <span className="font-mono">{order.id.slice(0, 8)}</span>
        </p>
      </div>

      <div className="bg-[#121212] border border-white/10 rounded-sm p-6 mb-6">
        <div className="flex gap-4 mb-6">
          {order.listing_snapshot?.image && (
            <img src={order.listing_snapshot.image} alt="" className="w-24 h-24 object-cover rounded-sm bg-black" />
          )}
          <div>
            <div className={`text-[10px] uppercase tracking-widest font-bold rarity-text-${order.listing_snapshot?.rarity}`}>
              {order.listing_snapshot?.rarity}
            </div>
            <div className="font-medium">{order.listing_snapshot?.skin_name}</div>
            {order.listing_snapshot?.wear && (
              <div className="text-xs text-[#8A8A8A] mt-1">{order.listing_snapshot.wear}</div>
            )}
            <div className="font-mono text-[#E4AE39] text-lg font-bold mt-2">
              {format(order.amount_usd)}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-3">
          <Step ok={true} label="Order created" testid="step-created" />
          <Step ok={paid} label="Payment received via Stripe" testid="step-paid" />
          <Step ok={paid} label="Trade offer sent to buyer (mocked)" testid="step-trade-sent" />
          <Step ok={completed} label="Buyer confirmed & funds released" testid="step-completed" />
        </div>
      </div>

      {paid && !completed && (
        <button
          onClick={confirmTrade}
          disabled={confirming}
          data-testid="confirm-trade-btn"
          className="w-full bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold py-4 rounded-sm disabled:opacity-50"
        >
          {confirming ? "Confirming…" : "Confirm I received the skin"}
        </button>
      )}

      <div className="mt-6 flex gap-4 justify-center">
        <Link to="/orders" data-testid="link-orders" className="text-sm text-[#8A8A8A] hover:text-[#E4AE39] flex items-center gap-1">
          View all orders <ArrowRight className="w-3 h-3" />
        </Link>
        <Link to="/market" data-testid="link-market" className="text-sm text-[#8A8A8A] hover:text-[#E4AE39] flex items-center gap-1">
          Continue shopping <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

function Step({ ok, label, testid }) {
  return (
    <div className="flex items-center gap-3" data-testid={testid}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${ok ? "bg-[#2ECC71]" : "bg-[#1c1c1c] border border-white/10"}`}>
        {ok && <div className="w-1.5 h-1.5 bg-[#0A0A0A] rounded-full" />}
      </div>
      <div className={`text-sm ${ok ? "text-[#E0E0E0]" : "text-[#555]"}`}>{label}</div>
    </div>
  );
}
