from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Header
from fastapi.responses import RedirectResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import jwt
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import stripe

from steam_auth import build_login_url, validate_openid, fetch_player_summary, fetch_cs2_inventory, demo_inventory
from skins_catalog import build_seed_listings, RARITIES

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
STRIPE_KEY = os.environ.get("STRIPE_API_KEY", "")
STEAM_API_KEY = os.environ.get("STEAM_API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

stripe.api_key = STRIPE_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


# ---------------- Auth utils ----------------

def make_jwt(user_id: str, steam_id: str) -> str:
    payload = {
        "sub": user_id,
        "steam_id": steam_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_jwt(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    payload = decode_jwt(authorization.split(" ", 1)[1])
    if not payload:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    payload = decode_jwt(authorization.split(" ", 1)[1])
    if not payload:
        return None
    return await db.users.find_one({"id": payload["sub"]}, {"_id": 0})


# ---------------- Models ----------------

class ListingCreate(BaseModel):
    skin_name: str
    weapon: Optional[str] = None
    type: Optional[str] = None
    rarity: str
    wear: Optional[str] = None
    float_value: Optional[float] = None
    price_usd: float
    image: Optional[str] = None
    asset_id: Optional[str] = None


# ---------------- Startup: seed catalog ----------------

@app.on_event("startup")
async def seed_catalog():
    count = await db.listings.count_documents({"is_catalog": True})
    if count == 0:
        seed = build_seed_listings()
        if seed:
            await db.listings.insert_many(seed)
            log.info(f"Seeded {len(seed)} catalog listings")


# ---------------- Health ----------------

@api.get("/")
async def root():
    return {"message": "CS2 Marketplace API", "rarities": RARITIES}


# ---------------- Steam Auth ----------------

@api.get("/auth/steam/login")
async def steam_login():
    return_to = f"{FRONTEND_URL}/api/auth/steam/callback"
    realm = FRONTEND_URL
    url = build_login_url(return_to, realm)
    return RedirectResponse(url=url)


@api.get("/auth/steam/callback")
async def steam_callback(request: Request):
    params = dict(request.query_params)
    steam_id = await validate_openid(params)
    if not steam_id:
        return RedirectResponse(url=f"{FRONTEND_URL}/?auth=failed")

    # Fetch/create user
    user = await db.users.find_one({"steam_id": steam_id}, {"_id": 0})
    if not user:
        summary = await fetch_player_summary(steam_id, STEAM_API_KEY) or {}
        user = {
            "id": str(uuid.uuid4()),
            "steam_id": steam_id,
            "display_name": summary.get("personaname", f"Player {steam_id[-6:]}"),
            "avatar": summary.get("avatarfull"),
            "profile_url": summary.get("profileurl", f"https://steamcommunity.com/profiles/{steam_id}"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user.copy())
        user.pop("_id", None)
    else:
        # Refresh display info
        summary = await fetch_player_summary(steam_id, STEAM_API_KEY)
        if summary:
            await db.users.update_one(
                {"steam_id": steam_id},
                {"$set": {"display_name": summary.get("personaname", user["display_name"]),
                          "avatar": summary.get("avatarfull", user.get("avatar"))}}
            )

    token = make_jwt(user["id"], steam_id)
    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={token}")


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ---------------- Inventory ----------------

@api.get("/inventory/cs2")
async def get_inventory(user=Depends(get_current_user)):
    items = await fetch_cs2_inventory(user["steam_id"])
    if not items:
        # Fallback to demo inventory when Steam inventory is private
        items = demo_inventory()
        return {"items": items, "is_demo": True,
                "message": "Your Steam CS2 inventory is private or empty. Showing demo items so you can preview the flow."}
    return {"items": items, "is_demo": False}


# ---------------- Marketplace Listings ----------------

@api.get("/marketplace/listings")
async def list_listings(
    rarity: Optional[str] = None,
    weapon_type: Optional[str] = None,
    wear: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    search: Optional[str] = None,
    sort: str = "price_asc",
    limit: int = 60,
):
    q = {"status": "active"}
    if rarity: q["rarity"] = rarity
    if weapon_type: q["type"] = weapon_type
    if wear: q["wear"] = wear
    if min_price is not None or max_price is not None:
        q["price_usd"] = {}
        if min_price is not None: q["price_usd"]["$gte"] = min_price
        if max_price is not None: q["price_usd"]["$lte"] = max_price
    if search:
        q["skin_name"] = {"$regex": search, "$options": "i"}

    sort_map = {
        "price_asc": [("price_usd", 1)],
        "price_desc": [("price_usd", -1)],
        "newest": [("created_at", -1)],
    }
    cursor = db.listings.find(q, {"_id": 0}).sort(sort_map.get(sort, sort_map["price_asc"])).limit(limit)
    return {"items": await cursor.to_list(length=limit)}


@api.get("/marketplace/listings/{listing_id}")
async def get_listing(listing_id: str):
    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(404, "Listing not found")
    return listing


@api.post("/marketplace/listings")
async def create_listing(payload: ListingCreate, user=Depends(get_current_user)):
    listing = {
        "id": str(uuid.uuid4()),
        "skin_name": payload.skin_name,
        "weapon": payload.weapon or "",
        "type": payload.type or "",
        "rarity": payload.rarity,
        "wear": payload.wear,
        "float_value": payload.float_value,
        "price_usd": round(payload.price_usd, 2),
        "image": payload.image,
        "asset_id": payload.asset_id,
        "seller_id": user["id"],
        "seller_name": user["display_name"],
        "seller_steam_id": user["steam_id"],
        "status": "active",
        "is_catalog": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.listings.insert_one(listing.copy())
    listing.pop("_id", None)
    return listing


@api.delete("/marketplace/listings/{listing_id}")
async def delete_listing(listing_id: str, user=Depends(get_current_user)):
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing["seller_id"] != user["id"]:
        raise HTTPException(403, "Not your listing")
    await db.listings.delete_one({"id": listing_id})
    return {"ok": True}


@api.get("/my/listings")
async def my_listings(user=Depends(get_current_user)):
    items = await db.listings.find({"seller_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    return {"items": items}


# ---------------- Stripe Checkout ----------------

@api.post("/checkout/{listing_id}")
async def create_checkout(listing_id: str, user=Depends(get_current_user)):
    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing["status"] != "active":
        raise HTTPException(400, "Listing not available")
    if listing["seller_id"] == user["id"]:
        raise HTTPException(400, "Cannot buy your own listing")

    order_id = str(uuid.uuid4())
    amount_cents = int(round(listing["price_usd"] * 100))

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": listing["skin_name"],
                        "description": f"{listing.get('wear', '')} • {listing['rarity'].upper()}",
                    },
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            success_url=f"{FRONTEND_URL}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&order_id={order_id}",
            cancel_url=f"{FRONTEND_URL}/checkout/cancel?order_id={order_id}",
            metadata={"order_id": order_id, "listing_id": listing_id, "buyer_id": user["id"]},
        )
    except Exception as e:
        log.error(f"Stripe error: {e}")
        raise HTTPException(500, f"Payment provider error: {e}")

    order = {
        "id": order_id,
        "listing_id": listing_id,
        "listing_snapshot": listing,
        "buyer_id": user["id"],
        "buyer_name": user["display_name"],
        "seller_id": listing["seller_id"],
        "seller_name": listing["seller_name"],
        "amount_usd": listing["price_usd"],
        "currency": "usd",
        "stripe_session_id": session.id,
        "status": "pending",
        "trade_status": "awaiting_payment",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(order.copy())
    return {"session_id": session.id, "checkout_url": session.url, "order_id": order_id}


@api.get("/orders/{order_id}/status")
async def order_status(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["buyer_id"] != user["id"] and order["seller_id"] != user["id"]:
        raise HTTPException(403, "Not your order")

    # Sync with Stripe if still pending
    if order["status"] == "pending" and order.get("stripe_session_id"):
        try:
            session = stripe.checkout.Session.retrieve(order["stripe_session_id"])
            if session.payment_status == "paid":
                # Mark listing sold + order paid + mocked trade progression
                await db.orders.update_one(
                    {"id": order_id},
                    {"$set": {"status": "paid", "trade_status": "trade_sent",
                              "paid_at": datetime.now(timezone.utc).isoformat()}}
                )
                await db.listings.update_one(
                    {"id": order["listing_id"]},
                    {"$set": {"status": "sold"}}
                )
                order["status"] = "paid"
                order["trade_status"] = "trade_sent"
        except Exception as e:
            log.error(f"Stripe sync error: {e}")
    return order


@api.post("/orders/{order_id}/confirm-trade")
async def confirm_trade(order_id: str, user=Depends(get_current_user)):
    """MOCKED: Buyer confirms receipt of skin, funds released to seller."""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["buyer_id"] != user["id"]:
        raise HTTPException(403, "Only buyer can confirm")
    if order["status"] != "paid":
        raise HTTPException(400, "Order not paid yet")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"trade_status": "completed",
                  "completed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"ok": True}


@api.get("/my/orders")
async def my_orders(user=Depends(get_current_user)):
    buys = await db.orders.find({"buyer_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    sells = await db.orders.find({"seller_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    return {"buys": buys, "sells": sells}


# ---------------- Currency FX ----------------

_fx_cache = {"ts": None, "rates": None}

@api.get("/fx/rates")
async def fx_rates():
    now = datetime.now(timezone.utc)
    if _fx_cache["ts"] and (now - _fx_cache["ts"]).total_seconds() < 3600 and _fx_cache["rates"]:
        return _fx_cache["rates"]
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get("https://open.er-api.com/v6/latest/USD")
        data = r.json()
        rates = data.get("rates") or {}
        result = {"base": "USD", "rates": rates, "updated": now.isoformat()}
        _fx_cache["ts"] = now
        _fx_cache["rates"] = result
        return result
    except Exception as e:
        log.error(f"FX fetch error: {e}")
        # Fallback rates
        return {"base": "USD", "rates": {
            "USD": 1.0, "EUR": 0.92, "GBP": 0.79, "INR": 83.2, "JPY": 149.5,
            "BRL": 5.05, "CAD": 1.36, "AUD": 1.52, "CNY": 7.24, "RUB": 91.5,
            "KRW": 1340.0, "MXN": 17.1, "TRY": 32.5, "ZAR": 18.6, "SGD": 1.34
        }, "updated": now.isoformat(), "fallback": True}


# ---------------- Register ----------------

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
