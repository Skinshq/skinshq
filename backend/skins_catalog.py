"""Seed catalog of popular CS2 skins for the marketplace."""

RARITIES = {
    "consumer": "#B0C3D9",
    "industrial": "#5E98D9",
    "milspec": "#4B69FF",
    "restricted": "#8847FF",
    "classified": "#D32CE6",
    "covert": "#EB4B4B",
    "contraband": "#E4AE39",
}

KNIFE_IMG = "https://images.unsplash.com/photo-1589728473894-4fb97b4dbb88?w=400"
KNIFE_IMG_2 = "https://images.unsplash.com/photo-1588597574944-5e581eeef359?w=400"
RIFLE_IMG = "https://images.pexels.com/photos/8390978/pexels-photo-8390978.jpeg?w=400"
RIFLE_IMG_2 = "https://images.unsplash.com/photo-1482649671545-bc53dcf1ad7c?w=400"

WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"]

CATALOG = [
    # Covert (Red)
    {"name": "AWP | Dragon Lore", "weapon": "AWP", "type": "Sniper Rifle", "rarity": "covert", "base_price": 12500.00, "image": RIFLE_IMG},
    {"name": "AK-47 | Fire Serpent", "weapon": "AK-47", "type": "Rifle", "rarity": "covert", "base_price": 2800.00, "image": RIFLE_IMG_2},
    {"name": "M4A4 | Howl", "weapon": "M4A4", "type": "Rifle", "rarity": "contraband", "base_price": 5400.00, "image": RIFLE_IMG},
    {"name": "AK-47 | Wild Lotus", "weapon": "AK-47", "type": "Rifle", "rarity": "covert", "base_price": 6800.00, "image": RIFLE_IMG_2},
    {"name": "AWP | Gungnir", "weapon": "AWP", "type": "Sniper Rifle", "rarity": "covert", "base_price": 9200.00, "image": RIFLE_IMG},
    # Knives (Gold)
    {"name": "★ Karambit | Doppler", "weapon": "Karambit", "type": "Knife", "rarity": "contraband", "base_price": 1850.00, "image": KNIFE_IMG},
    {"name": "★ Butterfly Knife | Fade", "weapon": "Butterfly Knife", "type": "Knife", "rarity": "contraband", "base_price": 2200.00, "image": KNIFE_IMG_2},
    {"name": "★ M9 Bayonet | Marble Fade", "weapon": "M9 Bayonet", "type": "Knife", "rarity": "contraband", "base_price": 1650.00, "image": KNIFE_IMG},
    {"name": "★ Bayonet | Tiger Tooth", "weapon": "Bayonet", "type": "Knife", "rarity": "contraband", "base_price": 950.00, "image": KNIFE_IMG_2},
    # Classified (Pink)
    {"name": "AK-47 | Vulcan", "weapon": "AK-47", "type": "Rifle", "rarity": "classified", "base_price": 380.00, "image": RIFLE_IMG_2},
    {"name": "M4A1-S | Hyper Beast", "weapon": "M4A1-S", "type": "Rifle", "rarity": "classified", "base_price": 42.00, "image": RIFLE_IMG},
    {"name": "USP-S | Kill Confirmed", "weapon": "USP-S", "type": "Pistol", "rarity": "classified", "base_price": 95.00, "image": RIFLE_IMG},
    {"name": "AWP | Neo-Noir", "weapon": "AWP", "type": "Sniper Rifle", "rarity": "classified", "base_price": 55.00, "image": RIFLE_IMG_2},
    # Restricted (Purple)
    {"name": "AK-47 | Redline", "weapon": "AK-47", "type": "Rifle", "rarity": "restricted", "base_price": 32.00, "image": RIFLE_IMG_2},
    {"name": "M4A4 | Desolate Space", "weapon": "M4A4", "type": "Rifle", "rarity": "restricted", "base_price": 28.00, "image": RIFLE_IMG},
    {"name": "Glock-18 | Fade", "weapon": "Glock-18", "type": "Pistol", "rarity": "restricted", "base_price": 480.00, "image": RIFLE_IMG},
    {"name": "Desert Eagle | Blaze", "weapon": "Desert Eagle", "type": "Pistol", "rarity": "restricted", "base_price": 520.00, "image": RIFLE_IMG_2},
    # Mil-Spec (Blue)
    {"name": "AK-47 | Elite Build", "weapon": "AK-47", "type": "Rifle", "rarity": "milspec", "base_price": 8.50, "image": RIFLE_IMG_2},
    {"name": "M4A1-S | Basilisk", "weapon": "M4A1-S", "type": "Rifle", "rarity": "milspec", "base_price": 6.20, "image": RIFLE_IMG},
    {"name": "AWP | Pit Viper", "weapon": "AWP", "type": "Sniper Rifle", "rarity": "milspec", "base_price": 4.80, "image": RIFLE_IMG_2},
    # Industrial (Light Blue)
    {"name": "MP7 | Skulls", "weapon": "MP7", "type": "SMG", "rarity": "industrial", "base_price": 1.20, "image": RIFLE_IMG},
    {"name": "P90 | Sand Spray", "weapon": "P90", "type": "SMG", "rarity": "industrial", "base_price": 0.85, "image": RIFLE_IMG_2},
    # Consumer (Grey)
    {"name": "MAC-10 | Indigo", "weapon": "MAC-10", "type": "SMG", "rarity": "consumer", "base_price": 0.30, "image": RIFLE_IMG_2},
    {"name": "Nova | Forest Leaves", "weapon": "Nova", "type": "Shotgun", "rarity": "consumer", "base_price": 0.15, "image": RIFLE_IMG},
]


def build_seed_listings():
    """Return listing dicts to seed marketplace catalog (marketplace listings owned by system)."""
    import uuid
    import random
    from datetime import datetime, timezone

    listings = []
    for skin in CATALOG:
        # Create 1-2 listings per skin with different wear/float
        n = random.randint(1, 2)
        for _ in range(n):
            wear = random.choice(WEARS)
            float_val = round(random.uniform(0.001, 0.75), 4)
            # Price varies by wear
            wear_multiplier = {
                "Factory New": 1.5,
                "Minimal Wear": 1.15,
                "Field-Tested": 1.0,
                "Well-Worn": 0.75,
                "Battle-Scarred": 0.55,
            }[wear]
            price = round(skin["base_price"] * wear_multiplier * random.uniform(0.9, 1.1), 2)
            listings.append({
                "id": str(uuid.uuid4()),
                "skin_name": skin["name"],
                "weapon": skin["weapon"],
                "type": skin["type"],
                "rarity": skin["rarity"],
                "wear": wear,
                "float_value": float_val,
                "price_usd": price,
                "image": skin["image"],
                "seller_id": "system",
                "seller_name": "CS2 Market Bot",
                "status": "active",
                "is_catalog": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
    return listings
