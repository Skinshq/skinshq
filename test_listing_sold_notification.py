#!/usr/bin/env python3
"""
Test the listing_sold notification trigger.
This requires simulating a purchase flow.
"""

import requests
import json
import sys

BASE_URL = "https://live-market-feed-4.preview.emergentagent.com/api"

USER_A_STEAMID = "76561198084749846"  # Seller
USER_B_STEAMID = "76561198000000000"  # Buyer who favorites the listing

def main():
    print("="*80)
    print("TEST: LISTING_SOLD NOTIFICATION TRIGGER")
    print("="*80)
    
    # Step 1: Auth both users
    print("\n1. Authenticating users...")
    resp_a = requests.post(f"{BASE_URL}/auth/steamid", json={"steam_id": USER_A_STEAMID}, timeout=10)
    resp_b = requests.post(f"{BASE_URL}/auth/steamid", json={"steam_id": USER_B_STEAMID}, timeout=10)
    
    if resp_a.status_code != 200 or resp_b.status_code != 200:
        print(f"❌ Auth failed: A={resp_a.status_code}, B={resp_b.status_code}")
        return 1
    
    user_a = resp_a.json()
    user_b = resp_b.json()
    token_a = user_a["token"]
    token_b = user_b["token"]
    user_a_id = user_a["user"]["id"]
    user_b_id = user_b["user"]["id"]
    
    print(f"✅ User A (seller): {user_a_id}")
    print(f"✅ User B (buyer): {user_b_id}")
    
    # Step 2: Get a test skin
    print("\n2. Getting test skin...")
    resp = requests.get(f"{BASE_URL}/skins/all?page_size=5", timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to get skins: {resp.status_code}")
        return 1
    
    items = resp.json().get("items", [])
    if not items:
        print("❌ No skins found")
        return 1
    
    test_skin = items[0]
    print(f"✅ Test skin: {test_skin['name']}")
    
    # Step 3: User A creates a listing
    print("\n3. User A creating listing...")
    listing_payload = {
        "skin_name": test_skin["name"],
        "weapon": test_skin.get("weapon", ""),
        "type": test_skin.get("type", ""),
        "rarity": test_skin["rarity"],
        "wear": "Field-Tested",
        "float_value": 0.25,
        "price_usd": 10.00,
        "image": test_skin.get("image", ""),
        "asset_id": "test-asset-sold-trigger"
    }
    
    headers_a = {"Authorization": f"Bearer {token_a}"}
    resp = requests.post(f"{BASE_URL}/marketplace/listings", 
                        json=listing_payload,
                        headers=headers_a,
                        timeout=10)
    
    if resp.status_code != 200:
        print(f"❌ Create listing failed: {resp.status_code}")
        print(resp.text)
        return 1
    
    listing = resp.json()
    listing_id = listing["id"]
    print(f"✅ Created listing: {listing_id}")
    
    # Step 4: User B favorites the listing
    print("\n4. User B favoriting listing...")
    headers_b = {"Authorization": f"Bearer {token_b}"}
    resp = requests.post(f"{BASE_URL}/favorites",
                        json={"target_type": "listing", "target_id": listing_id},
                        headers=headers_b,
                        timeout=10)
    
    if resp.status_code != 200:
        print(f"❌ Favorite failed: {resp.status_code}")
        print(resp.text)
        return 1
    
    print(f"✅ User B favorited listing {listing_id}")
    
    # Step 5: Simulate the listing being sold
    # We'll do this by directly calling the MongoDB update and notification function
    print("\n5. Simulating listing sold (updating status to 'sold')...")
    
    # Use Python to call the notification function
    import subprocess
    script = f"""
import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, '/app/backend')
ROOT_DIR = Path('/app/backend')
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

async def simulate_sold():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Update listing status to sold
    await db.listings.update_one(
        {{"id": "{listing_id}"}},
        {{"$set": {{"status": "sold"}}}}
    )
    print("Updated listing status to sold")
    
    # Import and call the notification function
    from server import _notify_listing_sold
    
    listing_doc = {{
        "id": "{listing_id}",
        "skin_name": "{test_skin['name']}",
        "wear": "Field-Tested",
        "image": "{test_skin.get('image', '')}",
        "rarity": "{test_skin['rarity']}",
        "price_usd": 10.0
    }}
    
    await _notify_listing_sold(listing_doc, buyer_id="{user_a_id}")
    print("Called _notify_listing_sold")
    
    client.close()

asyncio.run(simulate_sold())
"""
    
    result = subprocess.run(
        ["python3", "-c", script],
        cwd="/app/backend",
        capture_output=True,
        text=True,
        timeout=10
    )
    
    if result.returncode != 0:
        print(f"❌ Simulation failed: {result.stderr}")
        return 1
    
    print(result.stdout)
    print("✅ Listing marked as sold and notifications sent")
    
    # Step 6: Check if User B received the notification
    print("\n6. Checking User B's notifications...")
    resp = requests.get(f"{BASE_URL}/notifications", headers=headers_b, timeout=10)
    
    if resp.status_code != 200:
        print(f"❌ Get notifications failed: {resp.status_code}")
        return 1
    
    data = resp.json()
    items = data.get("items", [])
    
    # Look for listing_sold notification
    sold_notifs = [n for n in items if n.get("type") == "listing_sold"]
    
    if sold_notifs:
        notif = sold_notifs[0]
        print(f"✅ User B received listing_sold notification!")
        print(f"   Title: {notif.get('title')}")
        print(f"   Body: {notif.get('body')}")
        print(f"   Target: {notif.get('target_type')}/{notif.get('target_id')}")
        
        # Verify it's for the correct listing
        if notif.get("target_id") == listing_id:
            print("✅ Notification is for the correct listing")
        else:
            print(f"❌ Notification target_id mismatch: expected {listing_id}, got {notif.get('target_id')}")
    else:
        print(f"❌ User B did not receive listing_sold notification")
        print(f"   All notifications: {json.dumps(items, indent=2)}")
        return 1
    
    # Step 7: Cleanup
    print("\n7. Cleanup...")
    
    # Delete favorite
    requests.delete(f"{BASE_URL}/favorites?target_type=listing&target_id={listing_id}",
                   headers=headers_b, timeout=10)
    
    # Delete listing
    resp = requests.delete(f"{BASE_URL}/marketplace/listings/{listing_id}",
                          headers=headers_a, timeout=10)
    if resp.status_code == 200:
        print(f"✅ Deleted listing {listing_id}")
    else:
        print(f"⚠️  Could not delete listing: {resp.status_code}")
    
    print("\n" + "="*80)
    print("✅ ALL TESTS PASSED - listing_sold notification trigger working!")
    print("="*80)
    return 0

if __name__ == "__main__":
    sys.exit(main())
