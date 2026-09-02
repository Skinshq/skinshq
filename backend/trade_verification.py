"""Steam trade verification service.

Verifies a P2P trade by diffing the buyer's and seller's live Steam inventories:
  - The listed asset_id must now appear in the buyer's inventory.
  - The listed asset_id must NO LONGER appear in the seller's inventory.

Because Steam's community inventory endpoint is eventually consistent
(refresh delay after a trade completes) and occasionally rate-limits us,
the caller should schedule retries with backoff before marking MANUAL_REVIEW.

The service is intentionally decoupled from the DB / order model so a more
authoritative source (Steam Web API GetTradeHistory, a self-hosted trade bot)
can drop in without touching the caller.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from steam_auth import fetch_cs2_inventory

# Result codes returned by verify_trade.
VERIFIED         = "verified"         # asset moved from seller -> buyer as expected
STILL_WITH_SELLER = "still_with_seller"  # buyer has NOT received it yet
BUYER_INVENTORY_UNREADABLE = "buyer_inventory_unreadable"
SELLER_INVENTORY_UNREADABLE = "seller_inventory_unreadable"
NEITHER_INVENTORY_READABLE = "neither_inventory_readable"
NOT_FOUND        = "not_found"        # asset not in either inventory — mismatch or already re-traded


async def verify_trade(
    *,
    asset_id: str,
    class_id: Optional[str],
    instance_id: Optional[str],
    seller_steam_id: str,
    buyer_steam_id: str,
    seller_baseline_count: Optional[int] = None,
) -> dict:
    """Attempt one verification pass. Returns a structured audit record.

    IMPORTANT: Steam re-assigns `asset_id` when an item changes hands, so we can't
    look for the same asset_id on the buyer's side. Identity is preserved by
    (class_id, instance_id) — the pair uniquely identifies the exact skin variant
    (name + wear tier + paint pattern index for most items).

    If the same (class_id, instance_id) already existed in the buyer's inventory
    before the trade (buyer had a duplicate), we can't tell them apart. In that
    case pass `seller_baseline_count` = seller's count of matching items captured
    at TRADE_OFFER_SENT time, and we'll require it to have decreased by 1.
    """
    checked_at = datetime.now(timezone.utc).isoformat()

    buyer_items, buyer_reason = await fetch_cs2_inventory(buyer_steam_id)
    seller_items, seller_reason = await fetch_cs2_inventory(seller_steam_id)

    buyer_readable = buyer_reason in ("ok", "cached")
    seller_readable = seller_reason in ("ok", "cached")

    if not buyer_readable and not seller_readable:
        return {
            "result": NEITHER_INVENTORY_READABLE,
            "verified": False,
            "checked_at": checked_at,
            "buyer_inventory_reason": buyer_reason,
            "seller_inventory_reason": seller_reason,
            "detail": "Neither Steam inventory could be read. Will retry.",
        }

    buyer_count = _count_asset(buyer_items, class_id, instance_id) if buyer_readable else None
    seller_count = _count_asset(seller_items, class_id, instance_id) if seller_readable else None

    audit = {
        "checked_at": checked_at,
        "buyer_inventory_reason": buyer_reason,
        "seller_inventory_reason": seller_reason,
        "buyer_asset_count": buyer_count,
        "seller_asset_count": seller_count,
        "seller_baseline_count": seller_baseline_count,
    }

    # Rule of thumb: item arrival on the buyer's side is the definitive event.
    if buyer_readable and buyer_count and buyer_count > 0:
        # Cross-check that the seller no longer has the same count as before trade.
        if (
            seller_readable and seller_baseline_count is not None
            and seller_count is not None
            and seller_count >= seller_baseline_count
        ):
            # Seller still has the same number — did the trade actually happen with this exact item?
            return {**audit, "result": STILL_WITH_SELLER, "verified": False,
                    "detail": f"Seller still holds {seller_count} matching item(s) (baseline was {seller_baseline_count})."}
        return {**audit, "result": VERIFIED, "verified": True,
                "detail": (
                    "Item confirmed in buyer's inventory."
                    + (f" Seller count dropped from {seller_baseline_count} to {seller_count}." if seller_baseline_count is not None and seller_count is not None else "")
                )}

    if buyer_readable and (buyer_count == 0):
        return {**audit, "result": (STILL_WITH_SELLER if (seller_count or 0) > 0 else NOT_FOUND),
                "verified": False,
                "detail": (
                    "Item is not yet in the buyer's inventory — Steam may still be settling the trade."
                    if (seller_count or 0) > 0 else
                    "Item not found in either inventory — possible identity mismatch."
                )}

    return {**audit, "result": BUYER_INVENTORY_UNREADABLE, "verified": False,
            "detail": "Buyer inventory couldn't be read. Will retry."}


def _count_asset(items: list[dict], class_id: Optional[str], instance_id: Optional[str]) -> int:
    """Count items matching (class_id, instance_id) — the stable identity pair."""
    if not class_id:
        return 0
    cid, iid = str(class_id), (str(instance_id) if instance_id else None)
    n = 0
    for it in items:
        if str(it.get("class_id")) != cid:
            continue
        if iid is not None and str(it.get("instance_id")) != iid:
            continue
        n += 1
    return n


async def snapshot_seller_count(*, seller_steam_id: str,
                                 class_id: str, instance_id: Optional[str]) -> Optional[int]:
    """Baseline: how many matching items the seller has right BEFORE they send the trade.
    Used later to prove a decrement after buyer acceptance."""
    items, reason = await fetch_cs2_inventory(seller_steam_id)
    if reason not in ("ok", "cached"):
        return None
    return _count_asset(items, class_id, instance_id)
