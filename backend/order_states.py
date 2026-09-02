"""P2P order state machine.

Because we're deliberately skipping real payment for this iteration, the buyer's
"purchase" action goes straight to AWAITING_SELLER_TRADE. Once real Stripe
Connect is wired up we'll insert PAYMENT_PENDING / PAYMENT_CONFIRMED between
the buyer commit and the seller notification.
"""

# ---- Active states ----
AWAITING_SELLER_TRADE       = "AWAITING_SELLER_TRADE"       # Buyer committed. Seller must send Steam offer.
TRADE_OFFER_SENT            = "TRADE_OFFER_SENT"            # Seller marked "I sent the trade offer".
AWAITING_BUYER_ACCEPTANCE   = "AWAITING_BUYER_ACCEPTANCE"   # Buyer must accept the offer in Steam.
TRADE_VERIFICATION          = "TRADE_VERIFICATION"          # Backend is checking Steam inventories.
COMPLETED                   = "COMPLETED"                   # Verified. Seller wallet credited. 7-day CS2 protection active.

# ---- Failure / hold states ----
CANCELLED           = "CANCELLED"           # Buyer cancelled before seller sent the trade.
SELLER_TIMEOUT      = "SELLER_TIMEOUT"      # Seller didn't send trade offer within the deadline.
VERIFICATION_PENDING = "VERIFICATION_PENDING"  # Auto-verify inconclusive; will retry.
MANUAL_REVIEW       = "MANUAL_REVIEW"       # Verification failed after retries. Admin decision required.
DISPUTED            = "DISPUTED"            # Either party opened a dispute.
REFUND_PENDING      = "REFUND_PENDING"      # Admin needs to issue refund (placeholder for Stripe Connect).

# Allowed transitions: {from_state: set(to_states)}
TRANSITIONS: dict[str, set[str]] = {
    AWAITING_SELLER_TRADE: {TRADE_OFFER_SENT, CANCELLED, SELLER_TIMEOUT, DISPUTED},
    TRADE_OFFER_SENT: {AWAITING_BUYER_ACCEPTANCE, DISPUTED, MANUAL_REVIEW},
    AWAITING_BUYER_ACCEPTANCE: {TRADE_VERIFICATION, DISPUTED, MANUAL_REVIEW},
    TRADE_VERIFICATION: {COMPLETED, VERIFICATION_PENDING, MANUAL_REVIEW, DISPUTED},
    VERIFICATION_PENDING: {TRADE_VERIFICATION, MANUAL_REVIEW, DISPUTED},
    # Terminal states — no further transitions allowed at runtime (admin overrides handled explicitly).
    COMPLETED: set(),
    CANCELLED: set(),
    SELLER_TIMEOUT: {REFUND_PENDING},
    MANUAL_REVIEW: {COMPLETED, REFUND_PENDING, DISPUTED},
    DISPUTED: {COMPLETED, REFUND_PENDING, MANUAL_REVIEW},
    REFUND_PENDING: set(),
}

# Human-friendly labels for the timeline UI (frontend also has its own copy).
LABELS = {
    AWAITING_SELLER_TRADE: "Waiting for seller to send trade offer",
    TRADE_OFFER_SENT: "Trade offer sent — waiting for buyer",
    AWAITING_BUYER_ACCEPTANCE: "Waiting for buyer to accept in Steam",
    TRADE_VERIFICATION: "Verifying trade via Steam inventory",
    COMPLETED: "Trade completed",
    CANCELLED: "Cancelled by buyer",
    SELLER_TIMEOUT: "Seller didn't respond in time",
    VERIFICATION_PENDING: "Verification will retry shortly",
    MANUAL_REVIEW: "Under manual review",
    DISPUTED: "Disputed",
    REFUND_PENDING: "Refund pending",
}


def can_transition(from_state: str, to_state: str) -> bool:
    return to_state in TRANSITIONS.get(from_state, set())
