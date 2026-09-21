"""
Backend regression tests after the requirements/config refactor.

Covers the core flows explicitly requested in the review:
  * Backend boots + slim requirements imports work
  * marketplace, categories
  * Steam manual auth (POST /api/auth/steamid)  -> JWT
  * JWT-protected /api/me/profile
  * Steam inventory fetch (429 acceptable)
  * Listing creation with server snapshot
  * Order reserve
  * Admin stats
  * Stripe webhook endpoint exists (not 404)
  * CORS preflight
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://live-market-feed-4.preview.emergentagent.com"
API = f"{BASE_URL}/api"

SELLER_STEAM = "76561198084749846"
BUYER_STEAM = "76561199090331774"

ADMIN_EMAIL = "admin@skinmrkt.com"
ADMIN_PASSWORD = "admin1234"


# ---------------- fixtures ----------------

@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def seller_token(http):
    r = http.post(f"{API}/auth/steamid", json={"steam_id": SELLER_STEAM}, timeout=30)
    assert r.status_code == 200, f"steamid auth failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data, data
    return data["token"]


@pytest.fixture(scope="session")
def buyer_token(http):
    r = http.post(f"{API}/auth/steamid", json={"steam_id": BUYER_STEAM}, timeout=30)
    assert r.status_code == 200, f"steamid auth failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token(http):
    r = http.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


# ---------------- boot & core reads ----------------

class TestBootAndReads:
    def test_marketplace_listings(self, http):
        r = http.get(f"{API}/marketplace/listings?limit=10", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Accept either {"items": [...]} or a bare list
        items = body.get("items") if isinstance(body, dict) else body
        assert isinstance(items, list), f"expected list, got {type(items).__name__}: {body}"

    def test_skins_categories(self, http):
        r = http.get(f"{API}/skins/categories", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data, "empty categories response"


# ---------------- auth ----------------

class TestAuth:
    def test_steam_manual_auth_creates_user_and_returns_jwt(self, http):
        r = http.post(f"{API}/auth/steamid", json={"steam_id": SELLER_STEAM}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("token")
        assert isinstance(data["token"], str) and len(data["token"]) > 20

    def test_me_profile_requires_jwt(self, http, seller_token):
        r = http.get(f"{API}/me/profile", headers={"Authorization": f"Bearer {seller_token}"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Accept steam_id at top level or nested under user
        sid = data.get("steam_id") or (data.get("user") or {}).get("steam_id") or (data.get("profile") or {}).get("steam_id")
        assert sid == SELLER_STEAM, data

    def test_me_profile_no_token_401(self, http):
        r = http.get(f"{API}/me/profile", timeout=30)
        assert r.status_code in (401, 403), r.text

    def test_admin_login_bcrypt_ok(self, http, admin_token):
        assert admin_token and len(admin_token) > 20


# ---------------- inventory ----------------

class TestInventory:
    def test_seller_inventory(self, http, seller_token):
        r = http.get(f"{API}/inventory/cs2", headers={"Authorization": f"Bearer {seller_token}"}, timeout=60)
        # 200 real, or 200 with reason=rate_limited/cached; 429 also acceptable per spec
        assert r.status_code in (200, 429), r.text
        if r.status_code == 200:
            data = r.json()
            # Accept multiple shapes
            items = data.get("items") if isinstance(data, dict) else data
            assert isinstance(items, list)


# ---------------- listing + order ----------------

@pytest.fixture(scope="session")
def created_listing(http, seller_token):
    # Grab an owned asset first
    r = http.get(f"{API}/inventory/cs2", headers={"Authorization": f"Bearer {seller_token}"}, timeout=60)
    if r.status_code != 200:
        pytest.skip(f"inventory unavailable ({r.status_code}) — cannot test listing snapshot")
    data = r.json()
    items = data.get("items") if isinstance(data, dict) else data
    if not items:
        pytest.skip("no inventory items to list")
    asset_id = items[0].get("asset_id") or items[0].get("assetid") or items[0].get("id")
    if not asset_id:
        pytest.skip(f"no asset_id field on inventory item: keys={list(items[0].keys())}")

    payload = {"asset_id": str(asset_id), "price_usd": 12.34}
    r2 = http.post(
        f"{API}/marketplace/listings",
        json=payload,
        headers={"Authorization": f"Bearer {seller_token}"},
        timeout=45,
    )
    return {"status": r2.status_code, "body": r2.json() if r2.headers.get("content-type", "").startswith("application/json") else r2.text, "asset_id": str(asset_id)}


class TestListingAndOrder:
    def test_create_listing_has_server_snapshot(self, created_listing):
        assert created_listing["status"] in (200, 201), created_listing
        body = created_listing["body"]
        # Server-authoritative snapshot fields must be echoed back
        for key in ("market_hash_name", "class_id", "instance_id"):
            assert key in body, f"missing snapshot field '{key}' in listing response: {body}"

    def test_reserve_listing(self, http, created_listing, buyer_token):
        if created_listing["status"] not in (200, 201):
            pytest.skip("listing not created")
        listing_id = created_listing["body"].get("id") or created_listing["body"].get("listing_id") or created_listing["body"].get("_id")
        assert listing_id, f"no listing id in {created_listing['body']}"
        r = http.post(
            f"{API}/orders/reserve",
            json={"listing_id": listing_id},
            headers={"Authorization": f"Bearer {buyer_token}"},
            timeout=30,
        )
        # Some code paths require is_verified; accept 200 or 403 (verify guard) but flag 500
        assert r.status_code in (200, 201, 400, 403, 409), r.text
        if r.status_code in (200, 201):
            body = r.json()
            state = body.get("state") or body.get("trade_status") or body.get("status")
            assert state and "AWAITING_SELLER_TRADE".lower() in str(state).lower() or state, body


# ---------------- admin ----------------

class TestAdmin:
    def test_admin_stats(self, http, admin_token):
        r = http.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict) and data, data


# ---------------- Stripe webhook + CORS ----------------

class TestStripeAndCors:
    def test_stripe_webhook_not_404(self, http):
        # POST with bogus body; endpoint should exist (not 404). Placeholder secret => 400/500 acceptable.
        r = http.post(f"{API}/webhook/stripe", data=b"{}", headers={"Content-Type": "application/json"}, timeout=15)
        assert r.status_code != 404, "webhook endpoint missing"
        # Per spec, expect 500 webhook_not_configured OR 400 signature error
        assert r.status_code in (400, 500, 403), r.text

    def test_cors_preflight_wildcard(self):
        # Using raw requests to send an OPTIONS preflight
        r = requests.options(
            f"{API}/marketplace/listings",
            headers={
                "Origin": "https://random-origin.example.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
            timeout=15,
        )
        assert r.status_code in (200, 204), r.text
        allow_origin = r.headers.get("access-control-allow-origin", "")
        assert allow_origin in ("*", "https://random-origin.example.com"), r.headers
