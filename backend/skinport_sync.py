"""Live price synchronisation via Skinport's public API.

Skinport exposes the *entire* CS2 catalog in a single HTTP GET, no auth
required (just Brotli compression). We fetch → upsert every item into
`market_prices` keyed by `market_hash_name`, preserving the shape our
API already expects.

Docs: https://docs.skinport.com/#items
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

log = logging.getLogger("skinport_sync")

SKINPORT_URL = "https://api.skinport.com/v1/items"
APP_ID = 730          # CS2
CURRENCY = "USD"
REFRESH_INTERVAL_SEC = 6 * 3600   # 6 hours
INITIAL_DELAY_SEC = 20            # wait for API to be up before first sync

_state = {
    "running": False,
    "last_started_at": None,
    "last_finished_at": None,
    "last_error": None,
    "last_count": 0,
    "total_items": 0,
    "source": "skinport",
}


def get_sync_state() -> dict:
    return dict(_state)


async def sync_all_prices(db) -> dict:
    """Fetch full Skinport catalog and upsert into market_prices."""
    if _state["running"]:
        return {"ok": False, "reason": "already_running"}
    _state["running"] = True
    _state["last_started_at"] = datetime.now(timezone.utc).isoformat()
    _state["last_error"] = None
    started = datetime.now(timezone.utc)

    total_upserts = 0
    total_seen = 0
    try:
        # Skinport REQUIRES Brotli compression per their docs
        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "br, gzip",
            "User-Agent": "Mozilla/5.0 (compatible; SkinMrktSync/1.0)",
        }
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            r = await client.get(
                SKINPORT_URL,
                params={"app_id": APP_ID, "currency": CURRENCY},
                headers=headers,
            )
            r.raise_for_status()
            items = r.json()
            if not isinstance(items, list):
                raise RuntimeError(f"unexpected Skinport response type: {type(items).__name__}")

        _state["total_items"] = len(items)
        log.info(f"[skinport_sync] fetched {len(items)} items — upserting...")

        now_iso = datetime.now(timezone.utc).isoformat()
        from pymongo import UpdateOne
        ops = []
        for it in items:
            hash_name = it.get("market_hash_name")
            if not hash_name:
                continue
            # Prefer 'suggested_price' (Skinport's fair-market price) → fallback to min
            price = it.get("suggested_price")
            if price is None:
                price = it.get("min_price")
            if price is None:
                continue
            listings = it.get("quantity") or 0
            doc = {
                "market_hash_name": hash_name,
                "price_usd": round(float(price), 2),
                "listings": int(listings),
                "min_price": it.get("min_price"),
                "max_price": it.get("max_price"),
                "median_price": it.get("median_price"),
                "mean_price": it.get("mean_price"),
                "source": "skinport",
                "item_page": it.get("item_page"),
                "updated_at": now_iso,
            }
            ops.append(UpdateOne(
                {"market_hash_name": hash_name},
                {"$set": doc},
                upsert=True,
            ))

        # Batch bulk-write in chunks of 2000 to keep memory sane
        CHUNK = 2000
        for i in range(0, len(ops), CHUNK):
            chunk = ops[i:i + CHUNK]
            if not chunk:
                continue
            res = await db.market_prices.bulk_write(chunk, ordered=False)
            total_upserts += (res.upserted_count or 0) + (res.modified_count or 0)
            total_seen += len(chunk)

        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        _state["last_finished_at"] = datetime.now(timezone.utc).isoformat()
        _state["last_count"] = total_seen
        log.info(f"[skinport_sync] DONE — {total_seen} items in {elapsed:.1f}s ({total_upserts} upserts)")
        return {"ok": True, "count": total_seen, "elapsed_sec": elapsed, "upserts": total_upserts}
    except Exception as e:
        log.exception(f"[skinport_sync] failed: {e}")
        _state["last_error"] = str(e)
        _state["last_finished_at"] = datetime.now(timezone.utc).isoformat()
        _state["last_count"] = total_seen
        return {"ok": False, "error": str(e), "count": total_seen}
    finally:
        _state["running"] = False


_scheduler_task: Optional[asyncio.Task] = None


async def _scheduler_loop(db):
    await asyncio.sleep(INITIAL_DELAY_SEC)
    while True:
        try:
            await sync_all_prices(db)
        except Exception as e:
            log.exception(f"[skinport_sync] scheduler iteration failed: {e}")
        await asyncio.sleep(REFRESH_INTERVAL_SEC)


def start_scheduler(db) -> None:
    global _scheduler_task
    if _scheduler_task is not None and not _scheduler_task.done():
        return
    _scheduler_task = asyncio.create_task(_scheduler_loop(db))
    log.info("[skinport_sync] scheduler started (6h interval)")
