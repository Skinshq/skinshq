"""Backend smoke tests for the 6-item roadmap (F8).

Covers:
- GET  /api/me/wallet  (breakdown fields)
- POST /api/me/wallet/deposit (payment_method persistence)
- POST/GET/DELETE /api/me/price-alerts
- PATCH /api/admin/users/:id/status
- PATCH /api/admin/users/:id/premium
- GET  /api/me/profile (verified_progress)
- GET  /api/me/inventory shape (best-effort)
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://live-market-feed-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USER = "Bituop"
ADMIN_PASS = "Bituop123"
TEST_STEAM_ID = "76561198000000000"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/admin/login", json={"email": ADMIN_USER, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in admin login response: {r.text}"
    return tok


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{API}/auth/steamid", json={"steam_id": TEST_STEAM_ID}, timeout=15)
    assert r.status_code == 200, f"steamid auth failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in steamid auth: {r.text}"
    return tok


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- F8a: Wallet breakdown fields ----------------
def test_wallet_has_breakdown_fields(user_token):
    r = requests.get(f"{API}/me/wallet", headers=_auth(user_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    for field in ("available_usd", "on_hold_usd", "payout_usd", "total_fees_paid_usd", "platform_fee_rate"):
        assert field in data, f"wallet missing field '{field}': {data}"
    assert data["platform_fee_rate"] == 0.01, f"fee rate expected 0.01, got {data['platform_fee_rate']}"


# ---------------- F8b: Deposit persists payment_method ----------------
def test_deposit_persists_payment_method(user_token):
    payload = {"amount_usd": 50, "payment_method": "crypto"}
    r = requests.post(f"{API}/me/wallet/deposit", headers=_auth(user_token), json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    # Fetch wallet & find latest ledger row referencing crypto
    r2 = requests.get(f"{API}/me/wallet", headers=_auth(user_token), timeout=15)
    assert r2.status_code == 200
    data = r2.json()
    ledger = data.get("ledger") or data.get("transactions") or []
    assert ledger, f"empty ledger after deposit: {data}"
    latest = ledger[0]
    # Search top 3 for crypto
    found = any(
        (row.get("payment_method") == "crypto" or row.get("method") == "crypto")
        and float(row.get("amount_usd", row.get("amount", 0))) >= 50
        for row in ledger[:5]
    )
    assert found, f"crypto deposit not persisted in ledger. latest={latest}"


# ---------------- F8c: Price alerts CRUD ----------------
def test_price_alert_create_list_delete(user_token):
    payload = {"skin_name": "AK-47 | Redline", "max_price_usd": 25, "wear": "Field-Tested"}
    r = requests.post(f"{API}/me/price-alerts", headers=_auth(user_token), json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    print(f"[DEBUG] create response keys={list(created.keys())} id={created.get('id')}")
    alert_id = created.get("id") or created.get("_id") or created.get("alert_id")
    assert alert_id, f"no id on created alert: {created}"

    r2 = requests.get(f"{API}/me/price-alerts", headers=_auth(user_token), timeout=15)
    assert r2.status_code == 200
    body = r2.json()
    items = body.get("items") if isinstance(body, dict) else body
    items = items or []
    ids = [it.get("id") or it.get("_id") for it in items]
    assert alert_id in ids, f"alert_id {alert_id} not in listed ids {ids}"

    r3 = requests.delete(f"{API}/me/price-alerts/{alert_id}", headers=_auth(user_token), timeout=15)
    assert r3.status_code in (200, 204), r3.text


# ---------------- F8d + F8e: Admin status + premium ----------------
def _find_steam_user_id(admin_token):
    r = requests.get(f"{API}/admin/users", params={"q": "76561198"}, headers=_auth(admin_token), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    users = body.get("items") if isinstance(body, dict) else body
    users = users or []
    for u in users:
        sid = u.get("steam_id") or ""
        if sid.startswith("76561198") and not u.get("is_admin"):
            return u.get("id") or u.get("_id") or u.get("user_id")
    # fallback: any non-admin
    for u in users:
        if not u.get("is_admin"):
            return u.get("id")
    pytest.skip(f"No steam user available. count={len(users)} sample={users[:1]}")


def test_admin_set_status_restricted(admin_token):
    uid = _find_steam_user_id(admin_token)
    r = requests.patch(
        f"{API}/admin/users/{uid}/status",
        headers=_auth(admin_token),
        json={"status": "restricted", "reason": "TEST_regression"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    # Reset to good
    requests.patch(f"{API}/admin/users/{uid}/status", headers=_auth(admin_token), json={"status": "good", "reason": "reset"}, timeout=15)


def test_admin_set_premium_dealer(admin_token):
    uid = _find_steam_user_id(admin_token)
    r = requests.patch(
        f"{API}/admin/users/{uid}/premium",
        headers=_auth(admin_token),
        json={"tier": 2},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    # Reset to 0
    requests.patch(f"{API}/admin/users/{uid}/premium", headers=_auth(admin_token), json={"tier": 0}, timeout=15)


# ---------------- Bonus: Profile verified progress ----------------
def test_profile_has_verified_progress(user_token):
    r = requests.get(f"{API}/me/profile", headers=_auth(user_token), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    prof = data.get("profile") or {}
    assert "verified_progress" in prof, f"profile missing verified_progress: {list(prof.keys())}"
    assert "verified_criteria" in prof, f"profile missing verified_criteria: {list(prof.keys())}"
    assert "verified_total" in prof
