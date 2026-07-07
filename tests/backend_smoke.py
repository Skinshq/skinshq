"""Backend smoke tests for CS2 Marketplace API."""
import os, sys, uuid, json, asyncio, time
from datetime import datetime, timezone, timedelta
import httpx, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE = "https://live-market-feed-4.preview.emergentagent.com"
API = f"{BASE}/api"
JWT_SECRET = os.environ["JWT_SECRET"]
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

results = {"passed": [], "failed": []}

def rec(name, ok, detail=""):
    (results["passed"] if ok else results["failed"]).append(f"{name} :: {detail}")
    print(("PASS" if ok else "FAIL"), name, "-", detail)

def mint(user_id, steam_id):
    return jwt.encode({"sub": user_id, "steam_id": steam_id,
                       "exp": datetime.now(timezone.utc) + timedelta(days=1)},
                      JWT_SECRET, algorithm="HS256")

async def main():
    mc = AsyncIOMotorClient(MONGO_URL)
    db = mc[DB_NAME]
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as c:
        # 1. Root
        r = await c.get(f"{API}/")
        rec("GET /api/", r.status_code == 200 and "rarities" in r.json(),
            f"status={r.status_code} keys={list(r.json().keys()) if r.status_code==200 else r.text[:100]}")

        # 2. Listings seeded
        r = await c.get(f"{API}/marketplace/listings", params={"limit": 200})
        items = r.json().get("items", []) if r.status_code == 200 else []
        rec("GET /marketplace/listings seeded", r.status_code == 200 and len(items) >= 30,
            f"count={len(items)}")
        sample = items[0] if items else {}
        needed = {"id", "skin_name", "rarity", "wear", "price_usd", "image"}
        rec("listing fields", needed.issubset(sample.keys()) if sample else False,
            f"missing={needed - set(sample.keys()) if sample else 'no items'}")

        # 3. Filters
        r = await c.get(f"{API}/marketplace/listings", params={"rarity": "covert", "limit": 200})
        covert = r.json().get("items", [])
        rec("filter rarity=covert", all(i["rarity"] == "covert" for i in covert) and len(covert) > 0,
            f"count={len(covert)}")

        r = await c.get(f"{API}/marketplace/listings", params={"weapon_type": "Rifle", "limit": 200})
        rifles = r.json().get("items", [])
        rec("filter weapon_type=Rifle", all(i.get("type") == "Rifle" for i in rifles) and len(rifles) > 0,
            f"count={len(rifles)}")

        r = await c.get(f"{API}/marketplace/listings", params={"wear": "Factory New", "limit": 200})
        fn = r.json().get("items", [])
        rec("filter wear=Factory New", all(i.get("wear") == "Factory New" for i in fn) and len(fn) > 0,
            f"count={len(fn)}")

        r = await c.get(f"{API}/marketplace/listings", params={"min_price": 100, "max_price": 500, "limit": 200})
        pr = r.json().get("items", [])
        rec("filter price range", all(100 <= i["price_usd"] <= 500 for i in pr),
            f"count={len(pr)}")

        r = await c.get(f"{API}/marketplace/listings", params={"search": "AK-47", "limit": 200})
        ak = r.json().get("items", [])
        rec("filter search AK-47", all("ak-47" in i["skin_name"].lower() for i in ak) and len(ak) > 0,
            f"count={len(ak)}")

        r = await c.get(f"{API}/marketplace/listings", params={"sort": "price_desc", "limit": 200})
        ds = r.json().get("items", [])
        prices = [i["price_usd"] for i in ds]
        rec("sort price_desc", prices == sorted(prices, reverse=True), f"n={len(prices)}")

        # 4. Get by id
        target_id = items[0]["id"] if items else ""
        r = await c.get(f"{API}/marketplace/listings/{target_id}")
        rec("get listing by id", r.status_code == 200 and r.json()["id"] == target_id,
            f"status={r.status_code}")
        r = await c.get(f"{API}/marketplace/listings/nope-not-real")
        rec("get listing 404", r.status_code == 404, f"status={r.status_code}")

        # 5. FX rates
        r1 = await c.get(f"{API}/fx/rates")
        d1 = r1.json()
        need = {"EUR", "INR", "JPY", "GBP"}
        rec("GET /fx/rates", r1.status_code == 200 and d1.get("base") == "USD" and need.issubset(d1["rates"].keys()),
            f"base={d1.get('base')} has_rates={need.issubset(d1.get('rates', {}).keys())}")
        r2 = await c.get(f"{API}/fx/rates")
        d2 = r2.json()
        rec("FX cache same updated ts", d1.get("updated") == d2.get("updated"),
            f"t1={d1.get('updated')} t2={d2.get('updated')}")

        # 6. Steam login redirect
        r = await c.get(f"{API}/auth/steam/login")
        loc = r.headers.get("location", "")
        ok = r.status_code in (302, 307) and "steamcommunity.com/openid/login" in loc \
             and "openid.mode=checkid_setup" in loc \
             and "openid.ns=http" in loc \
             and "%2Fapi%2Fauth%2Fsteam%2Fcallback" in loc
        rec("steam login redirect", ok, f"status={r.status_code} loc={loc[:120]}")

        # 7. Auth required
        for path, method in [("/auth/me", "GET"), ("/inventory/cs2", "GET"),
                             ("/marketplace/listings", "POST"), ("/checkout/some-id", "POST")]:
            r = await c.request(method, f"{API}{path}", json={} if method == "POST" else None)
            rec(f"unauth {method} {path} -> 401", r.status_code in (401, 403),
                f"status={r.status_code}")

        # 8. Full auth flow: seed user A
        user_a = {"id": str(uuid.uuid4()), "steam_id": "76561198000000001",
                  "display_name": "TestUserA",
                  "created_at": datetime.now(timezone.utc).isoformat()}
        await db.users.insert_one(user_a.copy())
        token_a = mint(user_a["id"], user_a["steam_id"])
        h_a = {"Authorization": f"Bearer {token_a}"}

        r = await c.get(f"{API}/auth/me", headers=h_a)
        rec("/auth/me with token", r.status_code == 200 and r.json()["id"] == user_a["id"],
            f"status={r.status_code}")

        payload = {"skin_name": "TEST-AK-47 | Neon", "weapon": "AK-47", "type": "Rifle",
                   "rarity": "covert", "wear": "Factory New", "float_value": 0.05,
                   "price_usd": 123.45}
        r = await c.post(f"{API}/marketplace/listings", headers=h_a, json=payload)
        created = r.json() if r.status_code == 200 else {}
        rec("POST listing", r.status_code == 200 and created.get("seller_id") == user_a["id"],
            f"status={r.status_code} id={created.get('id')}")
        new_lid = created.get("id")

        r = await c.get(f"{API}/my/listings", headers=h_a)
        my = r.json().get("items", []) if r.status_code == 200 else []
        rec("GET /my/listings includes it", any(i["id"] == new_lid for i in my),
            f"count={len(my)}")

        # Seed user B, verify 403 on delete
        user_b = {"id": str(uuid.uuid4()), "steam_id": "76561198000000002",
                  "display_name": "TestUserB",
                  "created_at": datetime.now(timezone.utc).isoformat()}
        await db.users.insert_one(user_b.copy())
        token_b = mint(user_b["id"], user_b["steam_id"])
        h_b = {"Authorization": f"Bearer {token_b}"}

        r = await c.delete(f"{API}/marketplace/listings/{new_lid}", headers=h_b)
        rec("DELETE other user's listing -> 403", r.status_code == 403, f"status={r.status_code}")

        r = await c.delete(f"{API}/marketplace/listings/{new_lid}", headers=h_a)
        rec("DELETE own listing", r.status_code == 200, f"status={r.status_code}")

        # 9. Stripe checkout with buyer B on a catalog listing (seller_id='system')
        cat = next((i for i in items if i.get("seller_id") == "system"), None)
        if cat:
            r = await c.post(f"{API}/checkout/{cat['id']}", headers=h_b)
            body = r.json() if r.headers.get("content-type","").startswith("application/json") else {}
            ok = r.status_code == 200 and body.get("session_id") and body.get("checkout_url") and body.get("order_id")
            rec("POST /checkout Stripe session", ok, f"status={r.status_code} body={str(body)[:200]}")
            if ok:
                oid = body["order_id"]
                r = await c.get(f"{API}/orders/{oid}/status", headers=h_b)
                rec("GET order status", r.status_code == 200 and r.json().get("status") == "pending",
                    f"status={r.status_code} order_status={r.json().get('status') if r.status_code==200 else ''}")
        else:
            rec("Stripe checkout skipped", False, "no catalog listing found")

        # 10. Buy own listing -> 400
        payload["skin_name"] = "TEST own-buy"
        r = await c.post(f"{API}/marketplace/listings", headers=h_a, json=payload)
        own_lid = r.json().get("id") if r.status_code == 200 else None
        if own_lid:
            r = await c.post(f"{API}/checkout/{own_lid}", headers=h_a)
            rec("buy own listing -> 400", r.status_code == 400,
                f"status={r.status_code} body={r.text[:150]}")
            await c.delete(f"{API}/marketplace/listings/{own_lid}", headers=h_a)

        # Cleanup test users
        await db.users.delete_many({"id": {"$in": [user_a["id"], user_b["id"]]}})

    print("\n== SUMMARY ==")
    print(f"passed={len(results['passed'])} failed={len(results['failed'])}")
    for f in results["failed"]:
        print("  FAIL:", f)
    with open("/tmp/backend_smoke_results.json", "w") as fp:
        json.dump(results, fp, indent=2)

asyncio.run(main())
