"""P2P order state machine.

Because we're deliberately skipping real payment for this iteration, the buyer's
"purchase" action goes straight to AWAITING_SELLER_TRADE. Once real Stripe
Connect is wired up we'll insert PAYMENT_PENDING / PAYMENT_CONFIRMED between
the buyer commit and the seller notification.
"""

# ---- Active states ----
AWAITING_SELLER_TRADE       = "AWAITING_SELLER_TRADE"       # Buyer committed. Seller must send Steam offer.
TRADE_OFFER_REPORTED        = "TRADE_OFFER_REPORTED"        # Seller reported "I sent the trade offer" (unverified claim).
AWAITING_BUYER_ACCEPTANCE   = "AWAITING_BUYER_ACCEPTANCE"   # Buyer must accept the offer in Steam.
TRADE_VERIFICATION          = "TRADE_VERIFICATION"          # Backend is checking Steam inventories.
COMPLETED                   = "COMPLETED"                   # Verified. Seller wallet credited. 7-day CS2 protection active.

# Legacy alias — old orders in Mongo still carry TRADE_OFFER_SENT. Keep the constant
# so any DB read/query that matched the old value doesn't silently break.
TRADE_OFFER_SENT = TRADE_OFFER_REPORTED

# ---- Failure / hold states ----
CANCELLED           = "CANCELLED"           # Buyer cancelled before seller sent the trade.
SELLER_TIMEOUT      = "SELLER_TIMEOUT"      # Seller didn't send trade offer within the deadline.
VERIFICATION_PENDING = "VERIFICATION_PENDING"  # Auto-verify inconclusive; will retry.
MANUAL_REVIEW       = "MANUAL_REVIEW"       # Verification failed after retries. Admin decision required.
DISPUTED            = "DISPUTED"            # Either party opened a dispute.
REFUND_PENDING      = "REFUND_PENDING"      # Admin needs to issue refund (placeholder for Stripe Connect).

# Allowed transitions: {from_state: set(to_states)}
TRANSITIONS: dict[str, set[str]] = {
    AWAITING_SELLER_TRADE: {TRADE_OFFER_REPORTED, CANCELLED, SELLER_TIMEOUT, DISPUTED},
    TRADE_OFFER_REPORTED: {AWAITING_BUYER_ACCEPTANCE, DISPUTED, MANUAL_REVIEW},
    AWAITING_BUYER_ACCEPTANCE: {TRADE_VERIFICATION, DISPUTED, MANUAL_REVIEW},
    TRADE_VERIFICATION: {COMPLETED, VERIFICATION_PENDING, MANUAL_REVIEW, DISPUTED},
    VERIFICATION_PENDING: {TRADE_VERIFICATION, MANUAL_REVIEW, DISPUTED},
    COMPLETED: set(),
    CANCELLED: set(),
    SELLER_TIMEOUT: {REFUND_PENDING},
    MANUAL_REVIEW: {COMPLETED, REFUND_PENDING, DISPUTED},
    DISPUTED: {COMPLETED, REFUND_PENDING, MANUAL_REVIEW},
    REFUND_PENDING: set(),
}

LABELS = {
    AWAITING_SELLER_TRADE: "Payment confirmed — waiting for seller to send trade",
    TRADE_OFFER_REPORTED: "Seller reported sending trade — buyer should check Steam",
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
