#!/usr/bin/env python3
"""
Verify listing_status field is attached to listing-type favorites.
"""

import requests
import json

BASE_URL = "https://live-market-feed-4.preview.emergentagent.com/api"
USER_A_STEAMID = "76561198084749846"

# Auth
resp = requests.post(f"{BASE_URL}/auth/steamid", json={"steam_id": USER_A_STEAMID}, timeout=10)
token = resp.json()["token"]
headers = {"Authorization": f"Bearer {token}"}

# Get a test skin
resp = requests.get(f"{BASE_URL}/skins/all?page_size=1", timeout=10)
test_skin = resp.json()["items"][0]

# Create a listing
listing_payload = {
    "skin_name": test_skin["name"],
    "weapon": test_skin.get("weapon", ""),
    "type": test_skin.get("type", ""),
    "rarity": test_skin["rarity"],
    "wear": "Field-Tested",
    "float_value": 0.25,
    "price_usd": 15.00,
    "image": test_skin.get("image", ""),
    "asset_id": "test-listing-status-check"
}

resp = requests.post(f"{BASE_URL}/marketplace/listings", json=listing_payload, headers=headers, timeout=10)
if resp.status_code != 200:
    print(f"❌ Create listing failed: {resp.status_code}")
    exit(1)

listing_id = resp.json()["id"]
print(f"✅ Created listing: {listing_id}")

# Favorite the listing
resp = requests.post(f"{BASE_URL}/favorites",
                    json={"target_type": "listing", "target_id": listing_id},
                    headers=headers,
                    timeout=10)
if resp.status_code != 200:
    print(f"❌ Favorite failed: {resp.status_code}")
    exit(1)

print(f"✅ Favorited listing")

# Get favorites and check for listing_status
resp = requests.get(f"{BASE_URL}/favorites", headers=headers, timeout=10)
if resp.status_code != 200:
    print(f"❌ Get favorites failed: {resp.status_code}")
    exit(1)

data = resp.json()
items = data.get("items", [])

# Find our listing favorite
listing_fav = next((f for f in items if f.get("target_id") == listing_id), None)

if not listing_fav:
    print(f"❌ Listing favorite not found")
    exit(1)

print(f"\n✅ Found listing favorite:")
print(f"   target_type: {listing_fav.get('target_type')}")
print(f"   target_id: {listing_fav.get('target_id')}")
print(f"   listing_status: {listing_fav.get('listing_status')}")
print(f"   current_price_usd: {listing_fav.get('current_price_usd')}")

if "listing_status" not in listing_fav:
    print(f"\n❌ FAIL: listing_status field missing!")
    exit(1)

if listing_fav.get("listing_status") != "active":
    print(f"\n❌ FAIL: listing_status should be 'active', got '{listing_fav.get('listing_status')}'")
    exit(1)

print(f"\n✅ PASS: listing_status field present and correct!")

# Cleanup
requests.delete(f"{BASE_URL}/favorites?target_type=listing&target_id={listing_id}", headers=headers, timeout=10)
requests.delete(f"{BASE_URL}/marketplace/listings/{listing_id}", headers=headers, timeout=10)
print(f"✅ Cleanup complete")
