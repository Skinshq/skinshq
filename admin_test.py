#!/usr/bin/env python3
"""
Comprehensive backend test for CS2 Marketplace Admin Panel endpoints.
Tests all admin endpoints with proper auth, validation, and ban enforcement.
"""

import requests
import json
import sys
import time
from typing import Optional

# Backend URL from frontend/.env
BASE_URL = "https://live-market-feed-4.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_STEAMID = "76561198084749846"
TEST_USER_STEAMID = "76561199090331774"
ADMIN_TOKEN = "G6-WwWj5AxPoEjU8RdqiW_dAjLvJ1P5y9IM91xoONRg"

# Global state
admin_token: Optional[str] = None
admin_user_id: Optional[str] = None
test_user_token: Optional[str] = None
test_user_id: Optional[str] = None

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
    """Setup: Authenticate admin and test user"""
    global admin_token, admin_user_id, test_user_token, test_user_id
    
    print("\n=== AUTH SETUP ===")
    
    # Admin user
    try:
        resp = requests.post(f"{BASE_URL}/auth/steamid", 
                            json={"steam_id": ADMIN_STEAMID},
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            admin_token = data["token"]
            admin_user_id = data["user"]["id"]
            result.success(f"Admin authenticated (ID: {admin_user_id}, is_admin: {data['user'].get('is_admin')})")
        else:
            result.fail(f"Admin auth failed: HTTP {resp.status_code}", resp.text)
            return False
    except Exception as e:
        result.fail(f"Admin auth exception: {e}")
        return False
    
    # Test user (non-admin)
    try:
        resp = requests.post(f"{BASE_URL}/auth/steamid",
                            json={"steam_id": TEST_USER_STEAMID},
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            test_user_token = data["token"]
            test_user_id = data["user"]["id"]
            result.success(f"Test user authenticated (ID: {test_user_id}, is_admin: {data['user'].get('is_admin')})")
        else:
            result.fail(f"Test user auth failed: HTTP {resp.status_code}", resp.text)
            return False
    except Exception as e:
        result.fail(f"Test user auth exception: {e}")
        return False
    
    return True

def test_admin_promote():
    """Test POST /api/admin/promote (bootstrap admin promotion)"""
    print("\n=== TEST POST /api/admin/promote ===")
    
    # 1. Without X-Admin-Token → 403
    try:
        resp = requests.post(f"{BASE_URL}/admin/promote?steam_id={ADMIN_STEAMID}", timeout=10)
        if resp.status_code == 403:
            result.success("POST /admin/promote without X-Admin-Token → 403")
        else:
            result.fail(f"POST /admin/promote without token should be 403, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /admin/promote no token exception: {e}")
    
    # 2. With wrong token → 403
    try:
        headers = {"X-Admin-Token": "wrong-token"}
        resp = requests.post(f"{BASE_URL}/admin/promote?steam_id={ADMIN_STEAMID}",
                            headers=headers, timeout=10)
        if resp.status_code == 403:
            result.success("POST /admin/promote with wrong token → 403")
        else:
            result.fail(f"POST /admin/promote with wrong token should be 403, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /admin/promote wrong token exception: {e}")
    
    # 3. With correct token + no steam_id and no user_id → 400
    try:
        headers = {"X-Admin-Token": ADMIN_TOKEN}
        resp = requests.post(f"{BASE_URL}/admin/promote", headers=headers, timeout=10)
        if resp.status_code == 400:
            result.success("POST /admin/promote without steam_id/user_id → 400")
        else:
            result.fail(f"POST /admin/promote without params should be 400, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /admin/promote no params exception: {e}")
    
    # 4. With correct token + non-existent steam_id → 404
    try:
        headers = {"X-Admin-Token": ADMIN_TOKEN}
        resp = requests.post(f"{BASE_URL}/admin/promote?steam_id=99999",
                            headers=headers, timeout=10)
        if resp.status_code == 404:
            result.success("POST /admin/promote with non-existent steam_id → 404")
        else:
            result.fail(f"POST /admin/promote non-existent should be 404, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /admin/promote non-existent exception: {e}")
    
    # 5. With correct token + existing steam_id → 200
    try:
        headers = {"X-Admin-Token": ADMIN_TOKEN}
        resp = requests.post(f"{BASE_URL}/admin/promote?steam_id={ADMIN_STEAMID}",
                            headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok") and data.get("promoted"):
                result.success("POST /admin/promote with correct token + existing steam_id → 200 with {ok:true, promoted:true}")
            else:
                result.fail("POST /admin/promote response incorrect", json.dumps(data))
        else:
            result.fail(f"POST /admin/promote should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"POST /admin/promote success exception: {e}")

def test_ban_enforcement():
    """Test ban enforcement across login and auth endpoints"""
    global test_user_token
    
    print("\n=== TEST BAN ENFORCEMENT ===")
    
    # 1. Ban the test user
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{BASE_URL}/admin/users/{test_user_id}/ban",
                            json={"reason": "test ban"},
                            headers=headers, timeout=10)
        if resp.status_code == 200:
            result.success(f"Admin banned test user {test_user_id}")
        else:
            result.fail(f"Ban user failed: HTTP {resp.status_code}", resp.text)
            return
    except Exception as e:
        result.fail(f"Ban user exception: {e}")
        return
    
    # 2. Banned user tries to login via POST /auth/steamid → 403 with ban reason
    try:
        resp = requests.post(f"{BASE_URL}/auth/steamid",
                            json={"steam_id": TEST_USER_STEAMID},
                            timeout=10)
        if resp.status_code == 403:
            data = resp.json()
            detail = data.get("detail", "")
            if "banned" in detail.lower() and "test ban" in detail.lower():
                result.success(f"Banned user login → 403 with 'Account banned: test ban'")
            else:
                result.fail(f"Banned user login → 403 but wrong message: {detail}")
        else:
            result.fail(f"Banned user login should be 403, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"Banned user login exception: {e}")
    
    # 3. Banned user with OLD token tries GET /auth/me → 403 with ban reason
    try:
        headers = {"Authorization": f"Bearer {test_user_token}"}
        resp = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
        if resp.status_code == 403:
            data = resp.json()
            detail = data.get("detail", "")
            if "banned" in detail.lower() and "test ban" in detail.lower():
                result.success(f"Banned user GET /auth/me → 403 with ban reason")
            else:
                result.fail(f"Banned user GET /auth/me → 403 but wrong message: {detail}")
        else:
            result.fail(f"Banned user GET /auth/me should be 403, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"Banned user GET /auth/me exception: {e}")
    
    # 4. Admin unbans the user
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{BASE_URL}/admin/users/{test_user_id}/unban",
                            headers=headers, timeout=10)
        if resp.status_code == 200:
            result.success(f"Admin unbanned test user {test_user_id}")
        else:
            result.fail(f"Unban user failed: HTTP {resp.status_code}", resp.text)
            return
    except Exception as e:
        result.fail(f"Unban user exception: {e}")
        return
    
    # 5. User can now log in again
    try:
        resp = requests.post(f"{BASE_URL}/auth/steamid",
                            json={"steam_id": TEST_USER_STEAMID},
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            test_user_token = data["token"]
            result.success(f"Unbanned user can log in again → 200")
        else:
            result.fail(f"Unbanned user login should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"Unbanned user login exception: {e}")
    
    # 6. Self-ban prevention: admin tries to ban themselves → 400
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{BASE_URL}/admin/users/{admin_user_id}/ban",
                            json={"reason": "self ban test"},
                            headers=headers, timeout=10)
        if resp.status_code == 400:
            data = resp.json()
            detail = data.get("detail", "")
            if "cannot ban yourself" in detail.lower():
                result.success("Admin self-ban → 400 'You cannot ban yourself'")
            else:
                result.fail(f"Admin self-ban → 400 but wrong message: {detail}")
        else:
            result.fail(f"Admin self-ban should be 400, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"Admin self-ban exception: {e}")

def test_admin_auth_gating():
    """Test that all admin endpoints return 403 for non-admin and 401 for missing token"""
    print("\n=== TEST ADMIN AUTH GATING ===")
    
    endpoints = [
        ("GET", "/admin/stats"),
        ("GET", "/admin/transactions"),
        ("GET", "/admin/users"),
        ("GET", f"/admin/users/{test_user_id}"),
        ("POST", f"/admin/users/{test_user_id}/ban"),
        ("POST", f"/admin/users/{test_user_id}/unban"),
        ("GET", "/admin/backup"),
        ("POST", "/admin/restore"),
    ]
    
    for method, path in endpoints:
        # Test 1: No token → 401
        try:
            if method == "GET":
                resp = requests.get(f"{BASE_URL}{path}", timeout=10)
            else:
                resp = requests.post(f"{BASE_URL}{path}", timeout=10)
            
            if resp.status_code == 401:
                result.success(f"{method} {path} without token → 401")
            else:
                result.fail(f"{method} {path} without token should be 401, got {resp.status_code}", resp.text[:200])
        except Exception as e:
            result.fail(f"{method} {path} no token exception: {e}")
        
        # Test 2: Non-admin token → 403
        try:
            headers = {"Authorization": f"Bearer {test_user_token}"}
            if method == "GET":
                resp = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=10)
            else:
                if path.endswith("/ban"):
                    resp = requests.post(f"{BASE_URL}{path}", json={"reason": "test"}, headers=headers, timeout=10)
                else:
                    resp = requests.post(f"{BASE_URL}{path}", headers=headers, timeout=10)
            
            if resp.status_code == 403:
                result.success(f"{method} {path} with non-admin token → 403")
            else:
                result.fail(f"{method} {path} with non-admin should be 403, got {resp.status_code}", resp.text[:200])
        except Exception as e:
            result.fail(f"{method} {path} non-admin exception: {e}")

def test_admin_stats():
    """Test GET /admin/stats"""
    print("\n=== TEST GET /admin/stats ===")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/stats", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ["users", "orders", "listings", "revenue_usd"]
            missing = [k for k in required_keys if k not in data]
            if missing:
                result.fail(f"GET /admin/stats missing keys: {missing}", json.dumps(data))
                return
            
            # Check users sub-keys
            users = data.get("users", {})
            user_keys = ["total", "banned", "verified", "active_24h", "new_7d"]
            missing_user = [k for k in user_keys if k not in users]
            if missing_user:
                result.fail(f"GET /admin/stats users missing keys: {missing_user}", json.dumps(users))
                return
            
            # Check orders sub-keys
            orders = data.get("orders", {})
            order_keys = ["total", "pending", "paid", "completed"]
            missing_order = [k for k in order_keys if k not in orders]
            if missing_order:
                result.fail(f"GET /admin/stats orders missing keys: {missing_order}", json.dumps(orders))
                return
            
            # Check listings sub-keys
            listings = data.get("listings", {})
            listing_keys = ["active", "sold"]
            missing_listing = [k for k in listing_keys if k not in listings]
            if missing_listing:
                result.fail(f"GET /admin/stats listings missing keys: {missing_listing}", json.dumps(listings))
                return
            
            # Check all counts are non-negative ints
            all_counts = [
                users["total"], users["banned"], users["verified"], users["active_24h"], users["new_7d"],
                orders["total"], orders["pending"], orders["paid"], orders["completed"],
                listings["active"], listings["sold"]
            ]
            if all(isinstance(c, int) and c >= 0 for c in all_counts):
                result.success(f"GET /admin/stats → 200 with all required keys and valid counts")
            else:
                result.fail("GET /admin/stats some counts are not non-negative ints", json.dumps(data))
            
            # Check revenue_usd is float
            if isinstance(data["revenue_usd"], (int, float)) and data["revenue_usd"] >= 0:
                result.success(f"GET /admin/stats revenue_usd is valid: {data['revenue_usd']}")
            else:
                result.fail(f"GET /admin/stats revenue_usd invalid: {data['revenue_usd']}")
        else:
            result.fail(f"GET /admin/stats should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/stats exception: {e}")

def test_admin_transactions():
    """Test GET /admin/transactions"""
    print("\n=== TEST GET /admin/transactions ===")
    
    # 1. Basic call → 200 with structure
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/transactions", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ["items", "total"]
            missing = [k for k in required_keys if k not in data]
            if missing:
                result.fail(f"GET /admin/transactions missing keys: {missing}", json.dumps(data))
            else:
                result.success(f"GET /admin/transactions → 200 with items={len(data['items'])}, total={data['total']}")
        else:
            result.fail(f"GET /admin/transactions should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/transactions exception: {e}")
    
    # 2. Filter by status=pending
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/transactions?status=pending", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result.success(f"GET /admin/transactions?status=pending → 200 with {len(data['items'])} items")
        else:
            result.fail(f"GET /admin/transactions?status=pending should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/transactions?status=pending exception: {e}")
    
    # 3. Search by q=nonexistent
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/transactions?q=nonexistent", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if len(data["items"]) == 0:
                result.success(f"GET /admin/transactions?q=nonexistent → 200 with 0 items")
            else:
                result.fail(f"GET /admin/transactions?q=nonexistent should return 0 items, got {len(data['items'])}")
        else:
            result.fail(f"GET /admin/transactions?q=nonexistent should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/transactions?q=nonexistent exception: {e}")
    
    # 4. Pagination
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/transactions?limit=10&skip=0", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "limit" in data and "skip" in data:
                result.success(f"GET /admin/transactions?limit=10&skip=0 → 200 with pagination shape")
            else:
                result.fail("GET /admin/transactions pagination missing limit/skip", json.dumps(data))
        else:
            result.fail(f"GET /admin/transactions pagination should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/transactions pagination exception: {e}")

def test_admin_users():
    """Test GET /admin/users"""
    print("\n=== TEST GET /admin/users ===")
    
    # 1. Basic call → 200 with structure
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/users", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ["items", "total", "limit", "skip"]
            missing = [k for k in required_keys if k not in data]
            if missing:
                result.fail(f"GET /admin/users missing keys: {missing}", json.dumps(data))
                return
            
            items = data.get("items", [])
            if items:
                user = items[0]
                required_user_keys = ["id", "steam_id", "display_name", "is_admin", "is_banned", "orders_count"]
                missing_user = [k for k in required_user_keys if k not in user]
                if missing_user:
                    result.fail(f"GET /admin/users user missing keys: {missing_user}", json.dumps(user))
                    return
                
                # Check orders_count structure
                orders_count = user.get("orders_count", {})
                order_keys = ["bought", "sold", "pending", "completed"]
                missing_order = [k for k in order_keys if k not in orders_count]
                if missing_order:
                    result.fail(f"GET /admin/users orders_count missing keys: {missing_order}", json.dumps(orders_count))
                    return
                
                # Check sensitive fields are redacted
                if "verify_code" in user or "email_code" in user:
                    result.fail("GET /admin/users should NOT include verify_code or email_code", json.dumps(user))
                    return
                
                result.success(f"GET /admin/users → 200 with {len(items)} users, all required fields present, sensitive fields redacted")
            else:
                result.success(f"GET /admin/users → 200 with 0 users")
        else:
            result.fail(f"GET /admin/users should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/users exception: {e}")
    
    # 2. Filter by banned=true
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/users?banned=true", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result.success(f"GET /admin/users?banned=true → 200 with {len(data['items'])} banned users")
        else:
            result.fail(f"GET /admin/users?banned=true should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/users?banned=true exception: {e}")
    
    # 3. Search by steam_id
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/users?q={ADMIN_STEAMID}", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            if any(u.get("steam_id") == ADMIN_STEAMID for u in items):
                result.success(f"GET /admin/users?q={ADMIN_STEAMID} → 200, found admin user")
            else:
                result.fail(f"GET /admin/users?q={ADMIN_STEAMID} should find admin user", json.dumps(items))
        else:
            result.fail(f"GET /admin/users?q={ADMIN_STEAMID} should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/users?q={ADMIN_STEAMID} exception: {e}")
    
    # 4. Search by display_name substring
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/users?q=Player", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result.success(f"GET /admin/users?q=Player → 200 with {len(data['items'])} users")
        else:
            result.fail(f"GET /admin/users?q=Player should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/users?q=Player exception: {e}")

def test_admin_user_detail():
    """Test GET /admin/users/{user_id}"""
    print("\n=== TEST GET /admin/users/{user_id} ===")
    
    # 1. Existing user → 200
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/users/{test_user_id}", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ["user", "orders_bought", "orders_sold", "listings", "favorites_count"]
            missing = [k for k in required_keys if k not in data]
            if missing:
                result.fail(f"GET /admin/users/{{id}} missing keys: {missing}", json.dumps(data))
                return
            
            user = data.get("user", {})
            # Check sensitive fields are redacted
            if "verify_code" in user or "email_code" in user:
                result.fail("GET /admin/users/{id} user should NOT include verify_code or email_code", json.dumps(user))
                return
            
            result.success(f"GET /admin/users/{test_user_id} → 200 with all required fields, sensitive fields redacted")
        else:
            result.fail(f"GET /admin/users/{{id}} should be 200, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/users/{{id}} exception: {e}")
    
    # 2. Non-existent user → 404
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/users/nonexistent-id", headers=headers, timeout=10)
        if resp.status_code == 404:
            result.success("GET /admin/users/{nonexistent} → 404")
        else:
            result.fail(f"GET /admin/users/{{nonexistent}} should be 404, got {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"GET /admin/users/{{nonexistent}} exception: {e}")

def test_admin_backup():
    """Test GET /admin/backup"""
    print("\n=== TEST GET /admin/backup ===")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/backup", headers=headers, timeout=30)
        if resp.status_code == 200:
            # Check Content-Type
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" not in content_type:
                result.fail(f"GET /admin/backup Content-Type should be application/json, got {content_type}")
                return
            
            # Check Content-Disposition
            content_disp = resp.headers.get("Content-Disposition", "")
            if "attachment" not in content_disp or "skinmrkt-backup-" not in content_disp:
                result.fail(f"GET /admin/backup Content-Disposition incorrect: {content_disp}")
                return
            
            # Parse JSON body
            try:
                data = resp.json()
            except Exception as e:
                result.fail(f"GET /admin/backup response is not valid JSON: {e}")
                return
            
            # Check structure
            required_keys = ["generated_at", "version", "collections"]
            missing = [k for k in required_keys if k not in data]
            if missing:
                result.fail(f"GET /admin/backup missing keys: {missing}", json.dumps(list(data.keys())))
                return
            
            # Check version
            if data.get("version") != 1:
                result.fail(f"GET /admin/backup version should be 1, got {data.get('version')}")
                return
            
            # Check collections
            collections = data.get("collections", {})
            required_colls = ["users", "listings", "orders", "favorites", "notifications", "payment_transactions", "market_prices"]
            missing_colls = [c for c in required_colls if c not in collections]
            if missing_colls:
                result.fail(f"GET /admin/backup missing collections: {missing_colls}", json.dumps(list(collections.keys())))
                return
            
            # Check all collections are lists
            if all(isinstance(collections[c], list) for c in required_colls):
                result.success(f"GET /admin/backup → 200 with valid JSON structure, all 7 collections present")
                # Save backup for restore test
                global backup_data
                backup_data = data
            else:
                result.fail("GET /admin/backup some collections are not lists", json.dumps({k: type(v).__name__ for k, v in collections.items()}))
        else:
            result.fail(f"GET /admin/backup should be 200, got {resp.status_code}", resp.text[:200])
    except Exception as e:
        result.fail(f"GET /admin/backup exception: {e}")

backup_data = None

def test_admin_restore():
    """Test POST /admin/restore"""
    print("\n=== TEST POST /admin/restore ===")
    
    if not backup_data:
        print("⚠️  Skipping restore test - no backup data available")
        return
    
    # 1. mode=xyz → 400
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        files = {"file": ("backup.json", json.dumps(backup_data), "application/json")}
        data = {"mode": "xyz"}
        resp = requests.post(f"{BASE_URL}/admin/restore", headers=headers, files=files, data=data, timeout=30)
        if resp.status_code == 400:
            resp_data = resp.json()
            detail = resp_data.get("detail", "")
            if "mode must be" in detail.lower():
                result.success("POST /admin/restore mode=xyz → 400 'mode must be merge or replace'")
            else:
                result.fail(f"POST /admin/restore mode=xyz → 400 but wrong message: {detail}")
        else:
            result.fail(f"POST /admin/restore mode=xyz should be 400, got {resp.status_code}", resp.text[:200])
    except Exception as e:
        result.fail(f"POST /admin/restore mode=xyz exception: {e}")
    
    # 2. Empty file → 400
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        files = {"file": ("backup.json", "", "application/json")}
        data = {"mode": "merge"}
        resp = requests.post(f"{BASE_URL}/admin/restore", headers=headers, files=files, data=data, timeout=30)
        if resp.status_code == 400:
            result.success("POST /admin/restore empty file → 400")
        else:
            result.fail(f"POST /admin/restore empty file should be 400, got {resp.status_code}", resp.text[:200])
    except Exception as e:
        result.fail(f"POST /admin/restore empty file exception: {e}")
    
    # 3. Invalid JSON → 400
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        files = {"file": ("backup.json", "not json", "application/json")}
        data = {"mode": "merge"}
        resp = requests.post(f"{BASE_URL}/admin/restore", headers=headers, files=files, data=data, timeout=30)
        if resp.status_code == 400:
            result.success("POST /admin/restore invalid JSON → 400")
        else:
            result.fail(f"POST /admin/restore invalid JSON should be 400, got {resp.status_code}", resp.text[:200])
    except Exception as e:
        result.fail(f"POST /admin/restore invalid JSON exception: {e}")
    
    # 4. Valid backup with mode=merge → 200
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        files = {"file": ("backup.json", json.dumps(backup_data), "application/json")}
        data = {"mode": "merge"}
        resp = requests.post(f"{BASE_URL}/admin/restore", headers=headers, files=files, data=data, timeout=30)
        if resp.status_code == 200:
            resp_data = resp.json()
            required_keys = ["ok", "mode", "stats"]
            missing = [k for k in required_keys if k not in resp_data]
            if missing:
                result.fail(f"POST /admin/restore missing keys: {missing}", json.dumps(resp_data))
                return
            
            if resp_data.get("ok") and resp_data.get("mode") == "merge":
                stats = resp_data.get("stats", {})
                result.success(f"POST /admin/restore mode=merge → 200 with stats: {json.dumps(stats)}")
            else:
                result.fail("POST /admin/restore response incorrect", json.dumps(resp_data))
        else:
            result.fail(f"POST /admin/restore should be 200, got {resp.status_code}", resp.text[:200])
    except Exception as e:
        result.fail(f"POST /admin/restore exception: {e}")
    
    # 5. Verify stats after restore
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/admin/stats", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            result.success(f"Verified /admin/stats after restore: users={data['users']['total']}, orders={data['orders']['total']}")
        else:
            result.fail(f"Verify stats after restore failed: HTTP {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"Verify stats after restore exception: {e}")

def test_ip_capture():
    """Test IP capture on login and /auth/me"""
    print("\n=== TEST IP CAPTURE ===")
    
    # 1. Login via /auth/steamid
    try:
        resp = requests.post(f"{BASE_URL}/auth/steamid",
                            json={"steam_id": ADMIN_STEAMID},
                            timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data["token"]
            
            # 2. GET /auth/me to check last_ip
            headers = {"Authorization": f"Bearer {token}"}
            resp2 = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
            if resp2.status_code == 200:
                user = resp2.json()
                last_ip = user.get("last_ip")
                ip_history = user.get("ip_history", [])
                
                if last_ip:
                    result.success(f"IP capture working: last_ip={last_ip}, ip_history has {len(ip_history)} entries")
                else:
                    result.fail("IP capture failed: last_ip is empty", json.dumps(user))
            else:
                result.fail(f"GET /auth/me failed: HTTP {resp2.status_code}", resp2.text)
        else:
            result.fail(f"Login failed: HTTP {resp.status_code}", resp.text)
    except Exception as e:
        result.fail(f"IP capture test exception: {e}")

def main():
    """Run all tests"""
    print("="*80)
    print("CS2 MARKETPLACE - ADMIN PANEL BACKEND TEST")
    print("="*80)
    
    # Setup
    if not test_auth_setup():
        print("\n❌ Auth setup failed - cannot continue")
        return 1
    
    # Run tests
    test_admin_promote()
    test_ban_enforcement()
    test_admin_auth_gating()
    test_admin_stats()
    test_admin_transactions()
    test_admin_users()
    test_admin_user_detail()
    test_admin_backup()
    test_admin_restore()
    test_ip_capture()
    
    # Summary
    success = result.summary()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
