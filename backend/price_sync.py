"""Live Steam Market price synchronisation for CS2 skins.

Source: Steam Community Market's public /market/search/render/ endpoint
        (https://steamcommunity.com/market/search/render/?appid=730&norender=1).
        Returns real-time lowest sell price + total sell listings, no auth needed.

We paginate through all ~34k CS2 market items and upsert each into the
`market_prices` collection keyed by `market_hash_name`.

Per-skin card prices (base name only, no StatTrak/Souvenir) are then
aggregated on demand in server.py by looking up all wear-variants whose
market_hash_name starts with `f"{name} ("`.
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

log = logging.getLogger("price_sync")

MARKET_URL = "https://steamcommunity.com/market/search/render/"
APPID = 730  # CS2
PAGE_SIZE = 100          # Steam caps at 100 per page
PAGE_DELAY_SEC = 3.0     # Steam is strict — 1 req / ~3s is safe
RETRY_DELAY_SEC = 30.0   # base back-off for 429s
MAX_RETRIES = 5
REFRESH_INTERVAL_SEC = 6 * 3600  # 6 hours

# Default: sync only the top-N most-listed CS2 items (covers ~95% of what
# users actually browse — AKs, AWPs, knives, gloves, popular skins).
# Full 34k sync is opt-in via `full=True`.
DEFAULT_MAX_PAGES = 60   # 60 pages * 100 = 6000 most-active items

_sync_state = {
    "running": False,
    "last_started_at": None,
    "last_finished_at": None,
    "last_error": None,
    "last_count": 0,
    "total_items": 0,
}


def get_sync_state() -> dict:
    """Return a plain-dict snapshot of the current sync state."""
    return dict(_sync_state)


async def _fetch_page(client: httpx.AsyncClient, start: int) -> Optional[dict]:
    params = {
        "query": "",
        "start": start,
        "count": PAGE_SIZE,
        "search_descriptions": 0,
        "sort_column": "quantity",
        "sort_dir": "desc",
        "appid": APPID,
        "norender": 1,
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = await client.get(MARKET_URL, params=params, timeout=25.0)
            if r.status_code == 429:
                # Exponential back-off — Steam bans can last 30-90s
                wait = RETRY_DELAY_SEC * attempt
                log.warning(f"[price_sync] 429 at start={start}, back-off {wait:.0f}s (attempt {attempt}/{MAX_RETRIES})")
                await asyncio.sleep(wait)
                continue
            if r.status_code >= 500:
                await asyncio.sleep(RETRY_DELAY_SEC)
                continue
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError) as e:
            log.warning(f"[price_sync] fetch error start={start} attempt={attempt}: {e}")
            await asyncio.sleep(RETRY_DELAY_SEC)
    return None


async def sync_all_prices(db, max_pages: Optional[int] = None, full: bool = False) -> dict:
    """Walk Steam Market and upsert prices into market_prices.

    By default only syncs the top DEFAULT_MAX_PAGES pages of most-listed
    items (fast and covers the popular skins). Pass full=True to walk the
    entire ~34k catalog (~10 minutes, higher risk of rate-limits)."""
    if _sync_state["running"]:
        return {"ok": False, "reason": "already_running"}
    _sync_state["running"] = True
    _sync_state["last_started_at"] = datetime.now(timezone.utc).isoformat()
    _sync_state["last_error"] = None
    started = datetime.now(timezone.utc)

    total_seen = 0
    total_upserts = 0
    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": "Mozilla/5.0 (compatible; SkinMrktPriceSync/1.0)"},
            follow_redirects=True,
        ) as client:
            # First page to learn total_count
            first = await _fetch_page(client, 0)
            if not first or not first.get("success"):
                raise RuntimeError("initial fetch failed")
            total_count = int(first.get("total_count") or 0)
            _sync_state["total_items"] = total_count
            log.info(f"[price_sync] starting full sync: total_count={total_count}")

            pages = (total_count + PAGE_SIZE - 1) // PAGE_SIZE
            if not full and max_pages is None:
                max_pages = DEFAULT_MAX_PAGES
            if max_pages is not None:
                pages = min(pages, max_pages)

            consecutive_failures = 0
            for i in range(pages):
                start = i * PAGE_SIZE
                if i == 0:
                    data = first
                else:
                    data = await _fetch_page(client, start)
                if not data or not data.get("success"):
                    log.warning(f"[price_sync] skipping page start={start}")
                    consecutive_failures += 1
                    if consecutive_failures >= 5:
                        log.error("[price_sync] 5 consecutive page failures — aborting this run to preserve rate-limit quota")
                        break
                    await asyncio.sleep(PAGE_DELAY_SEC)
                    continue
                consecutive_failures = 0

                results = data.get("results") or []
                now_iso = datetime.now(timezone.utc).isoformat()
                ops = []
                for it in results:
                    hash_name = it.get("hash_name") or it.get("name")
                    if not hash_name:
                        continue
                    sell_price = it.get("sell_price")  # cents
                    sell_listings = it.get("sell_listings") or 0
                    if sell_price is None:
                        continue
                    price_usd = round(float(sell_price) / 100.0, 2)
                    ops.append({
                        "market_hash_name": hash_name,
                        "price_usd": price_usd,
                        "listings": int(sell_listings),
                        "updated_at": now_iso,
                    })
                if ops:
                    from pymongo import UpdateOne
                    bulk = [
                        UpdateOne({"market_hash_name": o["market_hash_name"]},
                                  {"$set": o}, upsert=True)
                        for o in ops
                    ]
                    result = await db.market_prices.bulk_write(bulk, ordered=False)
                    total_upserts += (result.upserted_count or 0) + (result.modified_count or 0)
                    total_seen += len(ops)

                if (i + 1) % 20 == 0:
                    log.info(f"[price_sync] page {i+1}/{pages} — items so far: {total_seen}")

                # Pace requests to be a good citizen
                await asyncio.sleep(PAGE_DELAY_SEC)

        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        _sync_state["last_finished_at"] = datetime.now(timezone.utc).isoformat()
        _sync_state["last_count"] = total_seen
        log.info(f"[price_sync] DONE — {total_seen} items in {elapsed:.1f}s ({total_upserts} upserts)")
        return {"ok": True, "count": total_seen, "elapsed_sec": elapsed, "upserts": total_upserts}
    except Exception as e:
        log.exception(f"[price_sync] sync failed: {e}")
        _sync_state["last_error"] = str(e)
        _sync_state["last_finished_at"] = datetime.now(timezone.utc).isoformat()
        _sync_state["last_count"] = total_seen
        return {"ok": False, "error": str(e), "count": total_seen}
    finally:
        _sync_state["running"] = False


# ---------------- Aggregation helpers ----------------

async def get_market_summary_for(db, base_name: str) -> Optional[dict]:
    """Aggregate all wear-variant prices for a base skin name.

    Matches market_hash_name that either equals the base name exactly
    (knives / gloves / stickers / cases with no wear) or starts with
    `f"{base_name} ("` (weapons with wear, excluding StatTrak/Souvenir
    which start with those prefixes).
    """
    if not base_name:
        return None
    # Escape regex specials
    import re
    escaped = re.escape(base_name)
    pattern = f"^{escaped}( \\(|$)"
    docs = await db.market_prices.find(
        {"market_hash_name": {"$regex": pattern}},
        {"_id": 0},
    ).to_list(20)
    if not docs:
        return None
    prices = [d["price_usd"] for d in docs if d.get("price_usd") is not None]
    if not prices:
        return None
    prices_sorted = sorted(prices)
    median = prices_sorted[len(prices_sorted) // 2]
    # For card display, prefer Field-Tested if present, else median
    ft = next((d for d in docs if d["market_hash_name"].endswith("(Field-Tested)")), None)
    card_price = ft["price_usd"] if ft else median
    total_listings = sum(int(d.get("listings") or 0) for d in docs)
    # Latest updated_at across all variants
    latest_updated = max((d.get("updated_at") or "") for d in docs)
    return {
        "market_price_usd": card_price,
        "market_price_min": min(prices),
        "market_price_max": max(prices),
        "market_price_median": median,
        "volume_7d": total_listings,
        "market_price_updated_at": latest_updated,
        "variants": docs,  # per-wear breakdown
    }


# ---------------- Background scheduler ----------------

_scheduler_task: Optional[asyncio.Task] = None


async def _scheduler_loop(db):
    """Runs sync every REFRESH_INTERVAL_SEC. First run happens after a short delay
    so backend can finish startup + serve initial traffic without contention."""
    # Initial delay so the API is live and answering /api/... before we start hammering Steam.
    # Also longer delay if Steam recently rate-limited us in a prior process.
    await asyncio.sleep(90)
    while True:
        try:
            await sync_all_prices(db)
        except Exception as e:
            log.exception(f"[price_sync] scheduler iteration failed: {e}")
        await asyncio.sleep(REFRESH_INTERVAL_SEC)


def start_scheduler(db) -> None:
    global _scheduler_task
    if _scheduler_task is not None and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.create_task(_scheduler_loop(db))
    log.info("[price_sync] scheduler started (6h interval)")


def stop_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task is not None:
        _scheduler_task.cancel()
        _scheduler_task = None
