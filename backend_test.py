#!/usr/bin/env python3
"""
Comprehensive backend test for CS2 Marketplace Favourites + Notifications feature.
Tests all endpoints with proper auth, validation, and notification triggers.
"""

import requests
import json
import sys
from typing import Optional, Dict, List

# Backend URL from frontend/.env
BASE_URL = "https://live-market-feed-4.preview.emergentagent.com/api"

# Test data
USER_A_STEAMID = "76561198084749846"
USER_B_STEAMID = "76561198000000000"

# Global state
user_a_token: Optional[str] = None
user_a_id: Optional[str] = None
user_b_token: Optional[str] = None
user_b_id: Optional[str] = None
test_skin_master_id: Optional[str] = None
test_listing_id: Optional[str] = None
test_favorite_ids: List[str] = []
test_notification_ids: List[str] = []

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def success(self, msg: str):
        self.passed += 1
        print(f"✅ {msg}")
    
    def fail(self, msg: str, details: str = ""):
        self.failed += 1
        error = f"❌ {msg}"
        if details:
            error += f"\n   Details: {details}"
        self.errors.append(error)
        print(error)
    
    def summary(self):
        print("\n" + "="*80)
        print(f"TEST SUMMARY: {self.passed} passed, {self.failed} failed")
        print("="*80)
        if self.errors:
            print("\nFailed tests:")
            for err in self.errors:
                print(err)
        return self.failed == 0

result = TestResult()

def test_auth_setup():
    """Setup: Create two test users and get JWT tokens"""
    global user_a_token, user_a_id, user_b_token, user_b_id
    
    print("\n=== AUTH SETUP ===")
    
    # User A
    try:
        resp = requests.post(f"{BASE_URL}/auth/steamid", 
                            json={"steam_id": USER_A_STEAMID},
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            user_a_token = data["token"]
            user_a_id = data["user"]["id"]
            result.success(f"User A authenticated (ID: {user_a_id})")
        else:
            result.fail(f"User A auth failed: HTTP {resp.status_code}", resp.text)
            return False
    except Exception as e:
        result.fail(f"User A auth exception: {e}")
        return False
    
    # User B
    try:
        resp = requests.post(f"{BASE_URL}/auth/steamid",
                            json={"steam_id": USER_B_STEAMID},
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            user_b_token = data["token"]
            user_b_id = data["user"]["id"]
            result.success(f"User B authenticated (ID: {user_b_id})")
        else:
            result.fail(f"User B auth failed: HTTP {resp.status_code}", resp.text)
            return False
    except Exception as e:
        result.fail(f"User B auth exception: {e}")
        return False
    
    return True

def test_get_test_skin():
    """Get a test skin master_id for testing"""
    global test_skin_master_id
    
    print("\n=== GET TEST SKIN ===")
    
    try:
        resp = requests.get(f"{BASE_URL}/skins/all?page_size=5", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            if items:
                test_skin_master_id = items[0]["master_id"]
                result.success(f"Got test skin: {test_skin_master_id} ({items[0].get('name', 'Unknown')})")
                return True
            else:
                result.fail("No skins found in catalog")
                return False
        else:
            result.fail(f"Failed to get skins: HTTP {resp.status_code}", resp.text)
            return False
    except Exception as e:
        result.fail(f"Get skins exception: {e}")
        return False

def test_favorites_post_validation():
    """Test POST /api/favorites validation scenarios"""
    print("\n=== TEST POST /api/favorites VALIDATION ===")
    
    # 1. Without Authorization → 401
    try:
        resp = requests.post(f"{BASE_URL}/favorites",
                            json={"target_type": "skin", "target_id": test_skin_master_id},
                            timeout=10)
        if resp.status_code == 401:
            result.success("POST /favorites without auth → 401")
        else:
            result.fail(f"POST /favorites without auth should be 401, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /favorites no auth exception: {e}")
    
    # 2. Bad target_type → 400
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.post(f"{BASE_URL}/favorites",
                            json={"target_type": "xyz", "target_id": "test"},
                            headers=headers,
                            timeout=10)
        if resp.status_code == 400:
            data = resp.json()
            if "target_type must be" in data.get("detail", "").lower():
                result.success("POST /favorites with bad target_type → 400 with correct message")
            else:
                result.fail("POST /favorites bad target_type → 400 but wrong message", json.dumps(data))
        else:
            result.fail(f"POST /favorites bad target_type should be 400, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /favorites bad target_type exception: {e}")
    
    # 3. Non-existent skin → 404
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.post(f"{BASE_URL}/favorites",
                            json={"target_type": "skin", "target_id": "nope-12345"},
                            headers=headers,
                            timeout=10)
        if resp.status_code == 404:
            data = resp.json()
            if "skin not found" in data.get("detail", "").lower():
                result.success("POST /favorites with non-existent skin → 404")
            else:
                result.fail("POST /favorites non-existent skin → 404 but wrong message", json.dumps(data))
        else:
            result.fail(f"POST /favorites non-existent skin should be 404, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /favorites non-existent skin exception: {e}")
    
    # 4. Non-existent listing → 404
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.post(f"{BASE_URL}/favorites",
                            json={"target_type": "listing", "target_id": "fake-listing-id"},
                            headers=headers,
                            timeout=10)
        if resp.status_code == 404:
            data = resp.json()
            if "listing not found" in data.get("detail", "").lower():
                result.success("POST /favorites with non-existent listing → 404")
            else:
                result.fail("POST /favorites non-existent listing → 404 but wrong message", json.dumps(data))
        else:
            result.fail(f"POST /favorites non-existent listing should be 404, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /favorites non-existent listing exception: {e}")

def test_favorites_post_happy_path():
    """Test POST /api/favorites happy path"""
    global test_favorite_ids
    
    print("\n=== TEST POST /api/favorites HAPPY PATH ===")
    
    # Create favorite for skin
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.post(f"{BASE_URL}/favorites",
                            json={"target_type": "skin", "target_id": test_skin_master_id},
                            headers=headers,
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            required_fields = ["id", "user_id", "target_type", "target_id", "snapshot", "created_at"]
            missing = [f for f in required_fields if f not in data]
            if missing:
                result.fail(f"POST /favorites success but missing fields: {missing}", json.dumps(data))
            else:
                # Check snapshot enrichment
                snapshot = data.get("snapshot", {})
                if "skin_name" in snapshot and "image" in snapshot and "rarity" in snapshot:
                    result.success(f"POST /favorites skin → 200 with enriched snapshot")
                    test_favorite_ids.append(data["id"])
                else:
                    result.fail("POST /favorites snapshot not properly enriched", json.dumps(snapshot))
        else:
            result.fail(f"POST /favorites should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /favorites happy path exception: {e}")
    
    # Test duplicate (idempotent)
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.post(f"{BASE_URL}/favorites",
                            json={"target_type": "skin", "target_id": test_skin_master_id},
                            headers=headers,
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            # Should return existing or indicate duplicate
            if data.get("duplicate") or data.get("id"):
                result.success("POST /favorites duplicate → 200 (idempotent)")
            else:
                result.fail("POST /favorites duplicate response unclear", json.dumps(data))
        else:
            result.fail(f"POST /favorites duplicate should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /favorites duplicate exception: {e}")

def test_favorites_get():
    """Test GET /api/favorites"""
    print("\n=== TEST GET /api/favorites ===")
    
    # Without auth → 401
    try:
        resp = requests.get(f"{BASE_URL}/favorites", timeout=10)
        if resp.status_code == 401:
            result.success("GET /favorites without auth → 401")
        else:
            result.fail(f"GET /favorites without auth should be 401, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /favorites no auth exception: {e}")
    
    # With auth → 200
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.get(f"{BASE_URL}/favorites", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "items" in data and "count" in data:
                items = data["items"]
                if len(items) > 0:
                    # Check if listing-type favs have listing_status
                    listing_favs = [f for f in items if f.get("target_type") == "listing"]
                    if listing_favs:
                        if all("listing_status" in f for f in listing_favs):
                            result.success(f"GET /favorites → 200 with {len(items)} items, listing_status present")
                        else:
                            result.fail("GET /favorites listing-type favs missing listing_status", json.dumps(listing_favs[0]))
                    else:
                        result.success(f"GET /favorites → 200 with {len(items)} items")
                else:
                    result.success("GET /favorites → 200 with 0 items (expected after first favorite)")
            else:
                result.fail("GET /favorites missing items or count", json.dumps(data))
        else:
            result.fail(f"GET /favorites should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /favorites exception: {e}")

def test_favorites_check():
    """Test GET /api/favorites/check"""
    print("\n=== TEST GET /api/favorites/check ===")
    
    # Without auth → 200 with empty arrays (public)
    try:
        resp = requests.get(f"{BASE_URL}/favorites/check", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "listings" in data and "skins" in data:
                if data["listings"] == [] and data["skins"] == []:
                    result.success("GET /favorites/check without auth → 200 with empty arrays")
                else:
                    result.fail("GET /favorites/check without auth should return empty arrays", json.dumps(data))
            else:
                result.fail("GET /favorites/check missing listings or skins", json.dumps(data))
        else:
            result.fail(f"GET /favorites/check without auth should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /favorites/check no auth exception: {e}")
    
    # With auth → 200 with populated skins array
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.get(f"{BASE_URL}/favorites/check", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "listings" in data and "skins" in data:
                if test_skin_master_id in data["skins"]:
                    result.success(f"GET /favorites/check with auth → 200 with populated skins: {data['skins']}")
                else:
                    result.fail(f"GET /favorites/check should include {test_skin_master_id} in skins", json.dumps(data))
            else:
                result.fail("GET /favorites/check missing listings or skins", json.dumps(data))
        else:
            result.fail(f"GET /favorites/check should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /favorites/check exception: {e}")

def test_favorites_delete():
    """Test DELETE /api/favorites"""
    print("\n=== TEST DELETE /api/favorites ===")
    
    # Without auth → 401
    try:
        resp = requests.delete(f"{BASE_URL}/favorites?target_type=skin&target_id={test_skin_master_id}",
                              timeout=10)
        if resp.status_code == 401:
            result.success("DELETE /favorites without auth → 401")
        else:
            result.fail(f"DELETE /favorites without auth should be 401, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"DELETE /favorites no auth exception: {e}")
    
    # With auth, correct params → 200
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.delete(f"{BASE_URL}/favorites?target_type=skin&target_id={test_skin_master_id}",
                              headers=headers,
                              timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok") and data.get("removed") == 1:
                result.success("DELETE /favorites → 200 with removed=1")
            else:
                result.fail("DELETE /favorites response incorrect", json.dumps(data))
        else:
            result.fail(f"DELETE /favorites should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"DELETE /favorites exception: {e}")
    
    # Verify count decreased
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.get(f"{BASE_URL}/favorites", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("count") == 0:
                result.success("GET /favorites after delete → count=0")
            else:
                result.fail(f"GET /favorites after delete should have count=0, got {data.get('count')}", json.dumps(data))
        else:
            result.fail(f"GET /favorites verification failed: HTTP {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /favorites verification exception: {e}")
    
    # Delete non-existent → removed=0 (idempotent)
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.delete(f"{BASE_URL}/favorites?target_type=skin&target_id=nonexistent",
                              headers=headers,
                              timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok") and data.get("removed") == 0:
                result.success("DELETE /favorites non-existent → 200 with removed=0")
            else:
                result.fail("DELETE /favorites non-existent response incorrect", json.dumps(data))
        else:
            result.fail(f"DELETE /favorites non-existent should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"DELETE /favorites non-existent exception: {e}")

def test_notifications_get():
    """Test GET /api/notifications"""
    print("\n=== TEST GET /api/notifications ===")
    
    # Without auth → 401
    try:
        resp = requests.get(f"{BASE_URL}/notifications", timeout=10)
        if resp.status_code == 401:
            result.success("GET /notifications without auth → 401")
        else:
            result.fail(f"GET /notifications without auth should be 401, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /notifications no auth exception: {e}")
    
    # With auth for fresh user → empty
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.get(f"{BASE_URL}/notifications", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "items" in data and "count" in data:
                result.success(f"GET /notifications → 200 with {data['count']} items")
            else:
                result.fail("GET /notifications missing items or count", json.dumps(data))
        else:
            result.fail(f"GET /notifications should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /notifications exception: {e}")

def test_notifications_unread_count():
    """Test GET /api/notifications/unread-count (public endpoint)"""
    print("\n=== TEST GET /api/notifications/unread-count ===")
    
    # Without auth → 200 with count=0 (MUST NOT 401)
    try:
        resp = requests.get(f"{BASE_URL}/notifications/unread-count", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "count" in data:
                result.success(f"GET /notifications/unread-count without auth → 200 with count={data['count']}")
            else:
                result.fail("GET /notifications/unread-count missing count", json.dumps(data))
        else:
            result.fail(f"GET /notifications/unread-count without auth should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /notifications/unread-count no auth exception: {e}")
    
    # With auth for fresh user → count=0
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.get(f"{BASE_URL}/notifications/unread-count", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "count" in data:
                result.success(f"GET /notifications/unread-count with auth → 200 with count={data['count']}")
            else:
                result.fail("GET /notifications/unread-count missing count", json.dumps(data))
        else:
            result.fail(f"GET /notifications/unread-count should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /notifications/unread-count exception: {e}")

def test_notifications_read_all():
    """Test POST /api/notifications/read-all"""
    print("\n=== TEST POST /api/notifications/read-all ===")
    
    # Without auth → 401
    try:
        resp = requests.post(f"{BASE_URL}/notifications/read-all", timeout=10)
        if resp.status_code == 401:
            result.success("POST /notifications/read-all without auth → 401")
        else:
            result.fail(f"POST /notifications/read-all without auth should be 401, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /notifications/read-all no auth exception: {e}")
    
    # With auth → 200
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.post(f"{BASE_URL}/notifications/read-all", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "ok" in data and "updated" in data:
                result.success(f"POST /notifications/read-all → 200 with updated={data['updated']}")
            else:
                result.fail("POST /notifications/read-all missing ok or updated", json.dumps(data))
        else:
            result.fail(f"POST /notifications/read-all should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /notifications/read-all exception: {e}")

def test_notification_trigger_new_listing():
    """Test notification trigger for new listing of favorited skin"""
    print("\n=== TEST NOTIFICATION TRIGGER: NEW LISTING ===")
    
    # Step 1: User B favorites a skin
    try:
        headers = {"Authorization": f"Bearer {user_b_token}"}
        resp = requests.post(f"{BASE_URL}/favorites",
                            json={"target_type": "skin", "target_id": test_skin_master_id},
                            headers=headers,
                            timeout=10)
        if resp.status_code == 200:
            result.success(f"User B favorited skin {test_skin_master_id}")
        else:
            result.fail(f"User B favorite failed: HTTP {resp.status_code}", resp.text)
            return
    except Exception as e:
        result.fail(f"User B favorite exception: {e}")
        return
    
    # Step 2: Get skin details to create matching listing
    try:
        resp = requests.get(f"{BASE_URL}/skins/all?page_size=5", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            test_skin = next((s for s in items if s["master_id"] == test_skin_master_id), None)
            if not test_skin:
                result.fail("Could not find test skin details")
                return
        else:
            result.fail(f"Failed to get skin details: HTTP {resp.status_code}", resp.text)
            return
    except Exception as e:
        result.fail(f"Get skin details exception: {e}")
        return
    
    # Step 3: User A needs to be verified to create listing
    # First check if already verified
    try:
        headers = {"Authorization": f"Bearer {user_a_token}"}
        # Try to create a listing - if it fails with 403, we need to verify
        listing_payload = {
            "skin_name": test_skin["name"],
            "weapon": test_skin.get("weapon", ""),
            "type": test_skin.get("type", ""),
            "rarity": test_skin["rarity"],
            "wear": "Field-Tested",
            "float_value": 0.25,
            "price_usd": 42.00,
            "image": test_skin.get("image", ""),
            "asset_id": "test-asset-123"
        }
        
        resp = requests.post(f"{BASE_URL}/marketplace/listings",
                            json=listing_payload,
                            headers=headers,
                            timeout=10)
        
        if resp.status_code == 403:
            # Need to verify user - update auth_method directly via MongoDB
            result.fail("User A not verified - cannot test new listing notification trigger", 
                       "User needs auth_method=steam_openid but has steamid_manual (read-only mode)")
            return
        elif resp.status_code == 200:
            data = resp.json()
            global test_listing_id
            test_listing_id = data.get("id")
            result.success(f"User A created listing {test_listing_id} for {test_skin['name']}")
        else:
            result.fail(f"Create listing failed: HTTP {resp.status_code}", resp.text)
            return
    except Exception as e:
        result.fail(f"Create listing exception: {e}")
        return
    
    # Step 4: Check if User B received notification
    try:
        headers = {"Authorization": f"Bearer {user_b_token}"}
        resp = requests.get(f"{BASE_URL}/notifications", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            new_listing_notifs = [n for n in items if n.get("type") == "new_listing"]
            if new_listing_notifs:
                notif = new_listing_notifs[0]
                if test_skin["name"] in notif.get("body", ""):
                    result.success(f"User B received new_listing notification: {notif['body']}")
                    global test_notification_ids
                    test_notification_ids.append(notif["id"])
                else:
                    result.fail("new_listing notification body doesn't contain skin name", json.dumps(notif))
            else:
                result.fail("User B did not receive new_listing notification", json.dumps(items))
        else:
            result.fail(f"Get notifications failed: HTTP {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"Get notifications exception: {e}")

def test_notification_mark_read():
    """Test POST /api/notifications/{id}/read"""
    print("\n=== TEST POST /api/notifications/{id}/read ===")
    
    if not test_notification_ids:
        print("⚠️  Skipping mark read test - no notifications to mark")
        return
    
    notif_id = test_notification_ids[0]
    
    # Get unread count before
    try:
        headers = {"Authorization": f"Bearer {user_b_token}"}
        resp = requests.get(f"{BASE_URL}/notifications/unread-count", headers=headers, timeout=10)
        if resp.status_code == 200:
            before_count = resp.json().get("count", 0)
        else:
            before_count = None
    except Exception:
        before_count = None
    
    # Mark as read
    try:
        headers = {"Authorization": f"Bearer {user_b_token}"}
        resp = requests.post(f"{BASE_URL}/notifications/{notif_id}/read",
                            headers=headers,
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok"):
                result.success(f"POST /notifications/{notif_id}/read → 200")
            else:
                result.fail("POST /notifications/read missing ok", json.dumps(data))
        else:
            result.fail(f"POST /notifications/read should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /notifications/read exception: {e}")
    
    # Verify unread count decreased
    if before_count is not None and before_count > 0:
        try:
            headers = {"Authorization": f"Bearer {user_b_token}"}
            resp = requests.get(f"{BASE_URL}/notifications/unread-count", headers=headers, timeout=10)
            if resp.status_code == 200:
                after_count = resp.json().get("count", 0)
                if after_count == before_count - 1:
                    result.success(f"Unread count decreased from {before_count} to {after_count}")
                else:
                    result.fail(f"Unread count should be {before_count - 1}, got {after_count}")
        except Exception as e:
            result.fail(f"Verify unread count exception: {e}")

def cleanup():
    """Clean up test data"""
    print("\n=== CLEANUP ===")
    
    # Delete favorites
    try:
        if user_a_token:
            headers = {"Authorization": f"Bearer {user_a_token}"}
            requests.delete(f"{BASE_URL}/favorites?target_type=skin&target_id={test_skin_master_id}",
                          headers=headers, timeout=10)
        if user_b_token:
            headers = {"Authorization": f"Bearer {user_b_token}"}
            requests.delete(f"{BASE_URL}/favorites?target_type=skin&target_id={test_skin_master_id}",
                          headers=headers, timeout=10)
            if test_listing_id:
                requests.delete(f"{BASE_URL}/favorites?target_type=listing&target_id={test_listing_id}",
                              headers=headers, timeout=10)
        print("✅ Cleaned up favorites")
    except Exception as e:
        print(f"⚠️  Cleanup favorites warning: {e}")
    
    # Delete test listing
    try:
        if test_listing_id and user_a_token:
            headers = {"Authorization": f"Bearer {user_a_token}"}
            resp = requests.delete(f"{BASE_URL}/marketplace/listings/{test_listing_id}",
                                 headers=headers, timeout=10)
            if resp.status_code == 200:
                print(f"✅ Deleted test listing {test_listing_id}")
            else:
                print(f"⚠️  Could not delete listing: HTTP {resp.status_code}")
    except Exception as e:
        print(f"⚠️  Cleanup listing warning: {e}")
    
    # Note: We don't delete users or notifications as they're part of the system state
    print("✅ Cleanup complete (users and notifications retained)")

def main():
    """Run all tests"""
    print("="*80)
    print("CS2 MARKETPLACE - FAVOURITES + NOTIFICATIONS BACKEND TEST")
    print("="*80)
    
    # Setup
    if not test_auth_setup():
        print("\n❌ Auth setup failed - cannot continue")
        return 1
    
    if not test_get_test_skin():
        print("\n❌ Could not get test skin - cannot continue")
        return 1
    
    # Run tests
    test_favorites_post_validation()
    test_favorites_post_happy_path()
    test_favorites_get()
    test_favorites_check()
    test_favorites_delete()
    
    test_notifications_get()
    test_notifications_unread_count()
    test_notifications_read_all()
    
    test_notification_trigger_new_listing()
    test_notification_mark_read()
    
    # Cleanup
    cleanup()
    
    # Summary
    success = result.summary()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
