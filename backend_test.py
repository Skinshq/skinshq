#!/usr/bin/env python3
"""Backend API tests for Steam Market price sync endpoints."""
import requests
import sys
import os
from pathlib import Path

# Load environment variables
backend_env = Path("/app/backend/.env")
frontend_env = Path("/app/frontend/.env")

BACKEND_URL = None
ADMIN_TOKEN = None

# Read REACT_APP_BACKEND_URL from frontend/.env
if frontend_env.exists():
    with open(frontend_env) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BACKEND_URL = line.split("=", 1)[1].strip() + "/api"
                break

# Read ADMIN_TOKEN from backend/.env
if backend_env.exists():
    with open(backend_env) as f:
        for line in f:
            if line.startswith("ADMIN_TOKEN="):
                ADMIN_TOKEN = line.split("=", 1)[1].strip().strip('"')
                break

if not BACKEND_URL:
    print("❌ REACT_APP_BACKEND_URL not found in /app/frontend/.env")
    sys.exit(1)

if not ADMIN_TOKEN:
    print("❌ ADMIN_TOKEN not found in /app/backend/.env")
    sys.exit(1)

print(f"🔧 Backend URL: {BACKEND_URL}")
print(f"🔧 Admin Token: {ADMIN_TOKEN[:20]}...")
print()

# Test results tracking
passed = 0
failed = 0
test_results = []


def test(name, fn):
    """Run a test function and track results."""
    global passed, failed
    print(f"🧪 {name}")
    try:
        fn()
        passed += 1
        test_results.append(f"✅ {name}")
        print(f"   ✅ PASS\n")
    except AssertionError as e:
        failed += 1
        test_results.append(f"❌ {name}: {e}")
        print(f"   ❌ FAIL: {e}\n")
    except Exception as e:
        failed += 1
        test_results.append(f"❌ {name}: {type(e).__name__}: {e}")
        print(f"   ❌ ERROR: {type(e).__name__}: {e}\n")


# ============================================================================
# Test 1: GET /api/skins/price-sync-status
# ============================================================================

def test_price_sync_status():
    """Test GET /api/skins/price-sync-status returns correct JSON shape."""
    url = f"{BACKEND_URL}/skins/price-sync-status"
    resp = requests.get(url, timeout=15)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    required_keys = ["running", "last_started_at", "last_finished_at", "last_error", "last_count", "total_items"]
    for key in required_keys:
        assert key in data, f"Missing key: {key}"
    
    assert isinstance(data["running"], bool), f"running should be bool, got {type(data['running'])}"
    print(f"   📊 Sync state: running={data['running']}, last_count={data['last_count']}, total_items={data['total_items']}")


# ============================================================================
# Test 2: POST /api/skins/refresh-prices - Auth scenarios
# ============================================================================

def test_refresh_prices_no_token():
    """Test POST /api/skins/refresh-prices without auth header returns 403."""
    url = f"{BACKEND_URL}/skins/refresh-prices"
    resp = requests.post(url, timeout=15)
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    data = resp.json()
    assert "detail" in data, "Expected 'detail' key in error response"
    assert "Admin token required" in data["detail"], f"Unexpected error message: {data['detail']}"
    print(f"   🔒 Correctly rejected: {data['detail']}")


def test_refresh_prices_wrong_token():
    """Test POST /api/skins/refresh-prices with wrong token returns 403."""
    url = f"{BACKEND_URL}/skins/refresh-prices"
    headers = {"X-Admin-Token": "wrong_token_12345"}
    resp = requests.post(url, headers=headers, timeout=15)
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print(f"   🔒 Correctly rejected wrong token")


def test_refresh_prices_correct_token():
    """Test POST /api/skins/refresh-prices with correct token returns 200."""
    url = f"{BACKEND_URL}/skins/refresh-prices"
    headers = {"X-Admin-Token": ADMIN_TOKEN}
    resp = requests.post(url, headers=headers, timeout=15)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    assert "ok" in data, "Missing 'ok' key"
    assert data["ok"] is True, f"Expected ok=true, got {data['ok']}"
    assert "started" in data or "already_running" in data, "Missing 'started' or 'already_running' key"
    assert "full" in data, "Missing 'full' key"
    assert data["full"] is False, f"Expected full=false, got {data['full']}"
    assert "state" in data, "Missing 'state' key"
    
    print(f"   ✅ Response: ok={data['ok']}, started={data.get('started')}, already_running={data.get('already_running')}, full={data['full']}")


def test_refresh_prices_full_param():
    """Test POST /api/skins/refresh-prices?full=true with correct token."""
    url = f"{BACKEND_URL}/skins/refresh-prices?full=true"
    headers = {"X-Admin-Token": ADMIN_TOKEN}
    resp = requests.post(url, headers=headers, timeout=15)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    assert "ok" in data, "Missing 'ok' key"
    assert data["ok"] is True, f"Expected ok=true, got {data['ok']}"
    # If already running from previous test, that's OK
    if "full" in data:
        assert data["full"] is True, f"Expected full=true, got {data['full']}"
    
    print(f"   ✅ Full sync response: ok={data['ok']}, full={data.get('full')}")


# ============================================================================
# Test 3: GET /api/skins/all - Market price fields
# ============================================================================

def test_skins_all_market_fields():
    """Test GET /api/skins/all returns items with market price fields."""
    url = f"{BACKEND_URL}/skins/all?page=1&page_size=10"
    resp = requests.get(url, timeout=15)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    assert "items" in data, "Missing 'items' key"
    assert len(data["items"]) > 0, "No items returned"
    
    # Check first item has all required keys
    item = data["items"][0]
    required_keys = [
        "master_id", "name", "weapon", "rarity", "image",
        "reference_price_usd", "price_range_usd", "live_listings",
        "market_price_usd", "market_price_updated_at"
    ]
    for key in required_keys:
        assert key in item, f"Missing key '{key}' in item"
    
    # market_price_usd can be null, but key must be present
    print(f"   📦 First item: {item['name']}")
    print(f"      market_price_usd={item['market_price_usd']}, reference_price_usd={item['reference_price_usd']}")
    
    # Check if any items have real market prices
    items_with_prices = [i for i in data["items"] if i.get("market_price_usd") is not None]
    print(f"   📊 Items with market prices: {len(items_with_prices)}/{len(data['items'])}")


def test_skins_all_find_real_price():
    """Test that at least one item across multiple pages has a real market price."""
    found_price = False
    for page in range(1, 6):  # Check first 5 pages
        url = f"{BACKEND_URL}/skins/all?page={page}&page_size=20"
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            continue
        
        data = resp.json()
        for item in data.get("items", []):
            if item.get("market_price_usd") is not None and item["market_price_usd"] > 0:
                found_price = True
                print(f"   💰 Found item with market price: {item['name']} = ${item['market_price_usd']}")
                print(f"      Updated: {item.get('market_price_updated_at')}")
                break
        if found_price:
            break
    
    # If no prices found, try covert rarity filter
    if not found_price:
        url = f"{BACKEND_URL}/skins/all?rarity=covert&page=1&page_size=20"
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            for item in data.get("items", []):
                if item.get("market_price_usd") is not None and item["market_price_usd"] > 0:
                    found_price = True
                    print(f"   💰 Found covert item with market price: {item['name']} = ${item['market_price_usd']}")
                    break
    
    assert found_price, "No items with real market prices found across 5 pages or covert filter"


# ============================================================================
# Test 4: GET /api/skins/detail/skin-0ffd6029f447 - AK-47 | Aquamarine Revenge
# ============================================================================

def test_skin_detail_aquamarine():
    """Test GET /api/skins/detail/skin-0ffd6029f447 returns market data."""
    url = f"{BACKEND_URL}/skins/detail/skin-0ffd6029f447"
    resp = requests.get(url, timeout=15)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    assert "skin" in data, "Missing 'skin' key"
    assert "listings" in data, "Missing 'listings' key"
    
    skin = data["skin"]
    assert skin["name"] == "AK-47 | Aquamarine Revenge", f"Unexpected skin name: {skin['name']}"
    
    # Check market price fields
    required_fields = [
        "market_price_usd", "market_price_min", "market_price_max",
        "market_price_median", "volume_7d", "market_price_updated_at",
        "market_variants"
    ]
    for field in required_fields:
        assert field in skin, f"Missing field '{field}' in skin"
    
    # Check reference price fields still present
    assert "reference_price_usd" in skin, "Missing reference_price_usd"
    assert "price_range_usd" in skin, "Missing price_range_usd"
    
    # If market data is present, validate it
    if skin["market_price_usd"] is not None:
        assert isinstance(skin["market_price_usd"], (int, float)), "market_price_usd should be a number"
        assert skin["market_price_usd"] > 0, "market_price_usd should be > 0"
        print(f"   💰 Market price: ${skin['market_price_usd']}")
        print(f"      Range: ${skin['market_price_min']} - ${skin['market_price_max']}")
        print(f"      Median: ${skin['market_price_median']}")
        print(f"      Volume (7d): {skin['volume_7d']}")
        print(f"      Updated: {skin['market_price_updated_at']}")
        
        # Check market_variants
        assert isinstance(skin["market_variants"], list), "market_variants should be a list"
        if len(skin["market_variants"]) > 0:
            variant = skin["market_variants"][0]
            assert "market_hash_name" in variant, "Missing market_hash_name in variant"
            assert "price_usd" in variant, "Missing price_usd in variant"
            assert "listings" in variant, "Missing listings in variant"
            assert "updated_at" in variant, "Missing updated_at in variant"
            print(f"      Variants: {len(skin['market_variants'])} wear conditions")
    else:
        print(f"   ⚠️  No market data yet for this skin (market_price_usd=null)")


# ============================================================================
# Test 5: Skin with no market data
# ============================================================================

def test_skin_no_market_data():
    """Test that a skin with no market data returns 200 with null market_price_usd."""
    # First, find a skin with no market data
    url = f"{BACKEND_URL}/skins/all?page=1&page_size=20"
    resp = requests.get(url, timeout=15)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    data = resp.json()
    skin_without_price = None
    for item in data.get("items", []):
        if item.get("market_price_usd") is None:
            skin_without_price = item
            break
    
    if not skin_without_price:
        print(f"   ⚠️  All items on page 1 have market prices - skipping this test")
        return
    
    # Now fetch detail for this skin
    master_id = skin_without_price["master_id"]
    url = f"{BACKEND_URL}/skins/detail/{master_id}"
    resp = requests.get(url, timeout=15)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code} for skin without market data"
    
    data = resp.json()
    assert "skin" in data, "Missing 'skin' key"
    skin = data["skin"]
    
    # Should have market_price_usd=null and market_variants=[]
    assert skin["market_price_usd"] is None, f"Expected market_price_usd=null, got {skin['market_price_usd']}"
    assert skin["market_variants"] == [], f"Expected empty market_variants, got {skin['market_variants']}"
    
    print(f"   ✅ Skin without market data: {skin['name']}")
    print(f"      market_price_usd=null, market_variants=[]")
    print(f"      Falls back to reference_price_usd=${skin.get('reference_price_usd')}")


# ============================================================================
# Run all tests
# ============================================================================

if __name__ == "__main__":
    print("=" * 80)
    print("🧪 BACKEND API TESTS - Steam Market Price Sync")
    print("=" * 80)
    print()
    
    # Test 1: Price sync status
    test("Test 1: GET /api/skins/price-sync-status", test_price_sync_status)
    
    # Test 2: Refresh prices auth scenarios
    test("Test 2a: POST /api/skins/refresh-prices (no token)", test_refresh_prices_no_token)
    test("Test 2b: POST /api/skins/refresh-prices (wrong token)", test_refresh_prices_wrong_token)
    test("Test 2c: POST /api/skins/refresh-prices (correct token)", test_refresh_prices_correct_token)
    test("Test 2d: POST /api/skins/refresh-prices?full=true", test_refresh_prices_full_param)
    
    # Test 3: Skins all market fields
    test("Test 3a: GET /api/skins/all - market fields present", test_skins_all_market_fields)
    test("Test 3b: GET /api/skins/all - find real market price", test_skins_all_find_real_price)
    
    # Test 4: Skin detail with market data
    test("Test 4: GET /api/skins/detail/skin-0ffd6029f447 (Aquamarine)", test_skin_detail_aquamarine)
    
    # Test 5: Skin without market data
    test("Test 5: Skin with no market data returns 200", test_skin_no_market_data)
    
    # Summary
    print("=" * 80)
    print("📊 TEST SUMMARY")
    print("=" * 80)
    for result in test_results:
        print(result)
    print()
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"📈 Total: {passed + failed}")
    print("=" * 80)
    
    sys.exit(0 if failed == 0 else 1)
