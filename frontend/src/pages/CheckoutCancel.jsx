import React from "react";
import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";

export default function CheckoutCancel() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center" data-testid="checkout-cancel-page">
      <XCircle className="w-16 h-16 text-[#EB4B4B] mx-auto mb-4" />
      <h1 className="font-display font-black text-3xl lg:text-4xl tracking-tight mb-3">
        Payment cancelled
      </h1>
      <p className="text-[#8A8A8A] mb-8">Your card was not charged.</p>
      <Link
        to="/market"
        data-testid="cancel-back-to-market"
        className="inline-block bg-[#E4AE39] hover:bg-[#F5C75A] text-[#0A0A0A] font-bold px-6 py-3 rounded-sm"
      >
        Back to marketplace
      </Link>
    </div>
  );
}
