"""CS2 skins catalog powered by the free ByMykel/CSGO-API.
2000+ real skins with authentic images from Steam's CDN.
"""
import httpx
import random
import uuid
from datetime import datetime, timezone

SKINS_API_URL = "https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/skins.json"
CRATES_API_URL = "https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/crates.json"

RARITIES = {
    "consumer": "#B0C3D9",
    "industrial": "#5E98D9",
    "milspec": "#4B69FF",
    "restricted": "#8847FF",
    "classified": "#D32CE6",
    "covert": "#EB4B4B",
    "contraband": "#E4AE39",
}

# Map ByMykel rarity IDs to our internal rarity keys
RARITY_MAP = {
    "rarity_common_weapon": "consumer",
    "rarity_uncommon_weapon": "industrial",
    "rarity_rare_weapon": "milspec",
    "rarity_mythical_weapon": "restricted",
    "rarity_legendary_weapon": "classified",
    "rarity_ancient_weapon": "covert",
    "rarity_contraband_weapon": "contraband",
    "rarity_ancient": "contraband",  # Knives & gloves
    "rarity_immortal": "contraband",
}

# Base price ranges by rarity (USD) — used when generating listings
PRICE_RANGES = {
    "consumer": (0.05, 0.60),
    "industrial": (0.15, 2.50),
    "milspec": (0.80, 15.0),
    "restricted": (5.0, 80.0),
    "classified": (25.0, 400.0),
    "covert": (60.0, 3500.0),
    "contraband": (200.0, 12000.0),
}

WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"]
WEAR_MULT = {
    "Factory New": 1.75,
    "Minimal Wear": 1.25,
    "Field-Tested": 1.0,
    "Well-Worn": 0.72,
    "Battle-Scarred": 0.55,
}


async def fetch_skins_master() -> list[dict]:
    """Fetch full skin catalog from ByMykel API."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        resp = await c.get(SKINS_API_URL)
    resp.raise_for_status()
    data = resp.json()

    catalog = []
    for s in data:
        rid = (s.get("rarity") or {}).get("id")
        if rid not in RARITY_MAP:
            continue
        rarity = RARITY_MAP[rid]
        weapon = (s.get("weapon") or {}).get("name", "")
        category = (s.get("category") or {}).get("name", "")
        image = s.get("image")
        if not image or not weapon:
            continue

        # Map category → our type. ByMykel lumps snipers with rifles and
        # shotguns with machineguns ("Heavy"), so we split by weapon name.
        SNIPER_WEAPONS = {"AWP", "SSG 08", "G3SG1", "SCAR-20"}
        SHOTGUN_WEAPONS = {"Nova", "XM1014", "Sawed-Off", "MAG-7"}
        cat_lower = category.lower()
        name = s.get("name", "") or ""
        if "glove" in cat_lower or "wraps" in name.lower():
            # IMPORTANT: check gloves BEFORE the ★-knife heuristic, because
            # glove skins also start with ★ (e.g. ★ Hand Wraps | Spruce DDPAT)
            type_ = "Gloves"
        elif "knife" in cat_lower or name.startswith("★"):
            type_ = "Knife"
        elif "pistol" in cat_lower:
            type_ = "Pistol"
        elif "smg" in cat_lower:
            type_ = "SMG"
        elif "rifle" in cat_lower:
            type_ = "Sniper Rifle" if weapon in SNIPER_WEAPONS else "Rifle"
        elif "heavy" in cat_lower or "shotgun" in cat_lower or "machinegun" in cat_lower:
            type_ = "Shotgun" if weapon in SHOTGUN_WEAPONS else "Machinegun"
        else:
            type_ = "Rifle"  # last-resort fallback

        catalog.append({
            "master_id": s.get("id"),
            "name": s.get("name"),
            "weapon": weapon,
            "type": type_,
            "category": "weapon",
            "rarity": rarity,
            "image": image,
            "min_float": s.get("min_float"),
            "max_float": s.get("max_float"),
        })
    return catalog


# ---- Container / case types (from ByMykel crates.json) ----

# ByMykel crate.type → our public-facing type filter label
CRATE_TYPE_MAP = {
    "Case": "Case",
    "Sticker Capsule": "Sticker Capsule",
    "Autograph Capsule": "Autograph Capsule",
    "Music Kit Box": "Music Kit Box",
    "Patch Capsule": "Patch Capsule",
    "Pins": "Pins Capsule",
    "Graffiti": "Graffiti Box",
    "Souvenir": "Souvenir Package",
    "Souvenir Highlight": "Souvenir Highlight",
}


async def fetch_crates_master() -> list[dict]:
    """Fetch containers (cases, capsules, souvenir packages, etc.) from ByMykel."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        resp = await c.get(CRATES_API_URL)
    resp.raise_for_status()
    data = resp.json()

    catalog = []
    for cr in data:
        crate_type = cr.get("type")
        if not crate_type:
            continue  # skip generic gift packages, etc.
        mapped_type = CRATE_TYPE_MAP.get(crate_type)
        if not mapped_type:
            continue
        image = cr.get("image")
        name = cr.get("market_hash_name") or cr.get("name")
        if not image or not name:
            continue

        catalog.append({
            "master_id": cr.get("id"),
            "name": name,
            "weapon": "",
            "type": mapped_type,
            "category": "container",
            # Containers are technically Base Grade — reuse 'consumer' for UI colour
            "rarity": "consumer",
            "image": image,
            "min_float": None,
            "max_float": None,
        })
    return catalog


def price_for(rarity: str, wear: str, seed: str = "") -> float:
    lo, hi = PRICE_RANGES.get(rarity, (1.0, 10.0))
    # Deterministic-ish variance per skin
    rng = random.Random(seed + rarity)
    base = rng.uniform(lo, hi)
    mult = WEAR_MULT[wear] * rng.uniform(0.85, 1.15)
    return round(base * mult, 2)


def build_seed_listings(master: list[dict], target_count: int = 200) -> list[dict]:
    """Sample skins across rarities and generate listings with varied wears/floats."""
    # Group by rarity to ensure representation
    by_rar = {}
    for m in master:
        by_rar.setdefault(m["rarity"], []).append(m)

    # Weights: how many listings per rarity bucket (roughly matching real market distribution)
    weights = {
        "consumer": 15, "industrial": 18, "milspec": 40,
        "restricted": 40, "classified": 35, "covert": 40, "contraband": 12,
    }
    total_weight = sum(weights.values())

    listings = []
    for rar, w in weights.items():
        pool = by_rar.get(rar, [])
        if not pool:
            continue
        n = int(target_count * w / total_weight)
        picks = random.sample(pool, min(n, len(pool)))
        for skin in picks:
            wear = random.choices(
                WEARS,
                weights=[15, 25, 35, 15, 10],
            )[0]
            fn, mx = skin.get("min_float") or 0.0, skin.get("max_float") or 1.0
            float_val = round(random.uniform(float(fn), float(mx)), 4)
            price = price_for(rar, wear, seed=skin["master_id"])
            listings.append({
                "id": str(uuid.uuid4()),
                "skin_name": skin["name"],
                "weapon": skin["weapon"],
                "type": skin["type"],
                "rarity": rar,
                "wear": wear,
                "float_value": float_val,
                "price_usd": price,
                "image": skin["image"],
                "seller_id": "system",
                "seller_name": "CS2 Market Bot",
                "status": "active",
                "is_catalog": True,
                "catalog_version": 2,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    return listings
