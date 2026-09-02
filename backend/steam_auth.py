"""Steam OpenID 2.0 helpers."""
import re
import time
import httpx
from urllib.parse import urlencode

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
STEAM_ID_REGEX = re.compile(r"https?://steamcommunity\.com/openid/id/(\d+)")

# In-memory inventory cache: {steam_id: (fetched_at_epoch, items_list)}
# Steam heavily rate-limits inventory requests from cloud IPs; caching for 10 min
# means each user only triggers 1 real Steam call every 10 minutes.
_INVENTORY_CACHE: dict[str, tuple[float, list[dict]]] = {}
_INVENTORY_TTL_SECONDS = 600  # 10 minutes


def build_login_url(return_to: str, realm: str) -> str:
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to,
        "openid.realm": realm,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return f"{STEAM_OPENID_URL}?{urlencode(params)}"


async def validate_openid(params: dict) -> str | None:
    """Verify OpenID response with Steam. Returns steam_id64 on success, None otherwise."""
    claimed = params.get("openid.claimed_id", "")
    m = STEAM_ID_REGEX.match(claimed)
    if not m:
        return None
    steam_id = m.group(1)

    # Reflect params back with mode=check_authentication
    verify_params = dict(params)
    verify_params["openid.mode"] = "check_authentication"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(STEAM_OPENID_URL, data=verify_params)
    if resp.status_code != 200:
        return None
    if "is_valid:true" in resp.text:
        return steam_id
    return None


async def fetch_player_summary(steam_id: str, api_key: str) -> dict | None:
    if not api_key:
        return None
    url = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params={"key": api_key, "steamids": steam_id})
    if resp.status_code != 200:
        return None
    data = resp.json()
    players = data.get("response", {}).get("players", [])
    return players[0] if players else None


async def fetch_cs2_inventory(steam_id: str, *, force_refresh: bool = False) -> tuple[list[dict], str]:
    """Fetch CS2 (appid 730) inventory from Steam community endpoint.
    Returns (items, reason). reason is one of: 'ok', 'cached', 'private', 'rate_limited', 'not_found', 'network_error'.
    Empty items with reason='ok' means the account has no CS2 items.
    Uses a 10-min per-steam_id cache since Steam heavily rate-limits cloud IPs.
    Pass force_refresh=True to bypass the cache (used by trade verification)."""
    # Serve from cache first (unless force_refresh)
    if not force_refresh:
        cached = _INVENTORY_CACHE.get(steam_id)
        if cached and (time.time() - cached[0]) < _INVENTORY_TTL_SECONDS:
            return cached[1], "cached"

    url = f"https://steamcommunity.com/inventory/{steam_id}/730/2"
    # Steam's inventory endpoint has a quirky bot filter on cloud IPs:
    # a full Chrome UA gets 429'd, but a lightweight curl-like UA slips through.
    headers = {
        "User-Agent": "curl/8.0.1",
        "Accept": "*/*",
    }
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=headers) as client:
            resp = await client.get(url, params={"l": "english", "count": 500})
    except Exception:
        return [], "network_error"

    # Steam returns 401/403 for private, 429 for rate-limit, 500 sometimes for empty/no-CS2
    if resp.status_code in (401, 403):
        return [], "private"
    if resp.status_code == 429:
        return [], "rate_limited"
    if resp.status_code != 200:
        return [], "not_found"
    # Some private/empty inventories return 200 with "null" body
    if not resp.text or resp.text.strip().lower() in ("null", ""):
        return [], "private"
    try:
        data = resp.json()
    except Exception:
        return [], "network_error"
    if not data:
        return [], "private"
    if data.get("success") == 0:
        return [], "private"
    if not data.get("assets"):
        # 200 + success:1 + no assets = public but truly empty CS2 inventory
        return [], "ok"

    desc_map = {}
    for d in data.get("descriptions", []):
        key = f"{d.get('classid')}_{d.get('instanceid')}"
        desc_map[key] = d

    items = []
    for a in data.get("assets", []):
        key = f"{a.get('classid')}_{a.get('instanceid')}"
        d = desc_map.get(key, {})
        market_name = d.get("market_hash_name") or d.get("market_name") or d.get("name", "Unknown")
        icon = d.get("icon_url")
        img_url = f"https://community.cloudflare.steamstatic.com/economy/image/{icon}/300x300" if icon else None

        # Determine rarity, wear, weapon type from tags
        rarity = "consumer"
        wear = None
        weapon_type = None  # e.g. Rifle / Pistol / Knife / Container
        for t in d.get("tags", []):
            cat = t.get("category")
            name = (t.get("localized_tag_name") or t.get("name") or "").lower()
            if cat == "Rarity":
                if "consumer" in name: rarity = "consumer"
                elif "industrial" in name: rarity = "industrial"
                elif "mil-spec" in name or "milspec" in name: rarity = "milspec"
                elif "restricted" in name: rarity = "restricted"
                elif "classified" in name: rarity = "classified"
                elif "covert" in name: rarity = "covert"
                elif "extraordinary" in name or "contraband" in name or "★" in market_name:
                    rarity = "contraband"
            elif cat == "Exterior":
                wear = t.get("localized_tag_name") or t.get("name")
            elif cat == "Type":
                weapon_type = t.get("localized_tag_name") or t.get("name")

        # Extract sticker names from item descriptions (Steam surfaces them as HTML)
        stickers = []
        for x in d.get("descriptions", []):
            v = (x.get("value") or "").strip()
            if v.lower().startswith("sticker:") or v.lower().startswith("stickers:"):
                # e.g. "Sticker: Team Astralis | Antwerp 2022, iBUYPOWER | Katowice 2014"
                names_part = v.split(":", 1)[1] if ":" in v else v
                for s in names_part.split(","):
                    s = s.strip()
                    if s:
                        stickers.append(s)

        # Inspect link (needed later for CSFloat float/paint_seed lookups)
        inspect_link = None
        for act in d.get("actions") or []:
            link = act.get("link") or ""
            if "csgo_econ_action_preview" in link:
                inspect_link = link
                break

        items.append({
            "asset_id": a.get("assetid"),
            "class_id": a.get("classid"),
            "instance_id": a.get("instanceid"),
            "market_name": market_name,
            "market_hash_name": d.get("market_hash_name") or market_name,
            "name": d.get("name") or market_name,
            "weapon_type": weapon_type,
            "wear": wear,
            "rarity": rarity,
            "image": img_url,
            "icon_url": icon,
            "tradable": bool(d.get("tradable", 1)),
            "marketable": bool(d.get("marketable", 1)),
            "stickers": stickers,
            "inspect_link": inspect_link,
        })
    # Cache successful non-empty fetch so we don't hammer Steam on refresh
    if items:
        _INVENTORY_CACHE[steam_id] = (time.time(), items)
    return items, "ok"


def demo_inventory():
    """Return a demo inventory when Steam inventory is private/unavailable.
    Uses the real skins fetched from ByMykel API stored in Mongo.
    """
    from skins_catalog import WEARS
    import random
    # Import here to avoid circular dependency
    from pymongo import MongoClient
    import os
    client = MongoClient(os.environ["MONGO_URL"])
    coll = client[os.environ["DB_NAME"]].skins_master
    docs = list(coll.aggregate([{"$sample": {"size": 12}}]))
    client.close()
    demo = []
    for i, s in enumerate(docs):
        demo.append({
            "asset_id": f"demo-{i}",
            "class_id": f"cls-{i}",
            "instance_id": "0",
            "market_name": s.get("name"),
            "wear": random.choice(WEARS),
            "rarity": s.get("rarity"),
            "image": s.get("image"),
            "tradable": True,
            "is_demo": True,
        })
    return demo
