"""Steam OpenID 2.0 helpers."""
import re
import httpx
from urllib.parse import urlencode

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
STEAM_ID_REGEX = re.compile(r"https?://steamcommunity\.com/openid/id/(\d+)")


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


async def fetch_cs2_inventory(steam_id: str) -> list[dict]:
    """Fetch CS2 (appid 730) inventory from Steam community endpoint. Public inventories only."""
    url = f"https://steamcommunity.com/inventory/{steam_id}/730/2"
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(url, params={"l": "english", "count": 200},
                                headers={"User-Agent": "Mozilla/5.0"})
    if resp.status_code != 200:
        return []
    try:
        data = resp.json()
    except Exception:
        return []
    if not data or not data.get("assets"):
        return []

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

        # Determine rarity from tags
        rarity = "consumer"
        tags = d.get("tags", [])
        for t in tags:
            if t.get("category") == "Rarity":
                name = (t.get("localized_tag_name") or t.get("name") or "").lower()
                if "consumer" in name: rarity = "consumer"
                elif "industrial" in name: rarity = "industrial"
                elif "mil-spec" in name or "milspec" in name: rarity = "milspec"
                elif "restricted" in name: rarity = "restricted"
                elif "classified" in name: rarity = "classified"
                elif "covert" in name: rarity = "covert"
                elif "extraordinary" in name or "contraband" in name or "★" in market_name: rarity = "contraband"

        wear = None
        for t in tags:
            if t.get("category") == "Exterior":
                wear = t.get("localized_tag_name") or t.get("name")
                break

        items.append({
            "asset_id": a.get("assetid"),
            "class_id": a.get("classid"),
            "instance_id": a.get("instanceid"),
            "market_name": market_name,
            "wear": wear,
            "rarity": rarity,
            "image": img_url,
            "tradable": bool(d.get("tradable", 1)),
        })
    return items


def demo_inventory():
    """Return a demo inventory when Steam inventory is private/unavailable."""
    from skins_catalog import CATALOG, WEARS, KNIFE_IMG, RIFLE_IMG
    import random
    demo = []
    sample = random.sample(CATALOG, min(8, len(CATALOG)))
    for i, s in enumerate(sample):
        demo.append({
            "asset_id": f"demo-{i}",
            "class_id": f"cls-{i}",
            "instance_id": "0",
            "market_name": s["name"],
            "wear": random.choice(WEARS),
            "rarity": s["rarity"],
            "image": s["image"],
            "tradable": True,
            "is_demo": True,
        })
    return demo
