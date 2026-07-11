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
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

from steam_auth import build_login_url, validate_openid, fetch_player_summary, fetch_cs2_inventory, demo_inventory
from skins_catalog import build_seed_listings, fetch_skins_master, fetch_crates_master, RARITIES
from price_sync import get_market_summary_for
from skinport_sync import (
    sync_all_prices,
    get_sync_state,
    start_scheduler as start_price_scheduler,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
STRIPE_KEY = os.environ.get("STRIPE_API_KEY", "")
STEAM_API_KEY = os.environ.get("STEAM_API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
PRICE_SYNC_ENABLED = os.environ.get("PRICE_SYNC_ENABLED", "1") == "1"

# Stripe checkout is initialized per-request via StripeCheckout(api_key=STRIPE_KEY, webhook_url=...)

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
    """Fetch real CS2 skins master data from ByMykel API and seed marketplace."""
    # Fetch master skins list (cache in Mongo)
    master_meta = await db.skins_master_meta.find_one({"id": "meta"})
    need_refresh = True
    if master_meta:
        try:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(master_meta["updated"])).total_seconds()
            if age < 86400:  # 24h
                need_refresh = False
        except Exception:
            pass

    if need_refresh:
        try:
            master = await fetch_skins_master()
            crates = await fetch_crates_master()
            combined = (master or []) + (crates or [])
            if combined:
                await db.skins_master.delete_many({})
                await db.skins_master.insert_many(combined)
                await db.skins_master_meta.update_one(
                    {"id": "meta"},
                    {"$set": {"id": "meta", "updated": datetime.now(timezone.utc).isoformat(),
                              "count": len(combined),
                              "weapons_count": len(master or []),
                              "crates_count": len(crates or [])}},
                    upsert=True,
                )
                log.info(f"Fetched {len(master or [])} skins + {len(crates or [])} crates from ByMykel API")
        except Exception as e:
            log.error(f"Failed to fetch skins master: {e}")

    # No longer seed system listings — marketplace = full master catalog.
    # Remove any legacy seeded listings so /marketplace/listings only shows real user listings.
    await db.listings.delete_many({"is_catalog": True})

    # Index for fast market_prices lookups + uniqueness
    try:
        await db.market_prices.create_index("market_hash_name", unique=True)
    except Exception as e:
        log.warning(f"market_prices index warning: {e}")

    # Launch background price sync scheduler (6h refresh). Non-blocking.
    if PRICE_SYNC_ENABLED:
        start_price_scheduler(db)


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
            "is_verified": True,
            "auth_method": "steam_openid",
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


import secrets

class SteamIdLogin(BaseModel):
    steam_id: str


@api.post("/auth/steamid")
async def login_with_steamid(payload: SteamIdLogin):
    """Fallback login: accept SteamID64 directly. Creates an UNVERIFIED session.
    Unverified users can browse but cannot list skins or purchase until they
    prove Steam profile ownership via /auth/verify/init + /auth/verify/check.
    """
    steam_id = (payload.steam_id or "").strip()
    if not steam_id.isdigit() or len(steam_id) != 17 or not steam_id.startswith("7656"):
        raise HTTPException(400, "Invalid SteamID64 (must be a 17-digit number starting with 7656)")

    user = await db.users.find_one({"steam_id": steam_id}, {"_id": 0})
    if not user:
        summary = await fetch_player_summary(steam_id, STEAM_API_KEY) or {}
        user = {
            "id": str(uuid.uuid4()),
            "steam_id": steam_id,
            "display_name": summary.get("personaname", f"Player {steam_id[-6:]}"),
            "avatar": summary.get("avatarfull"),
            "profile_url": summary.get("profileurl", f"https://steamcommunity.com/profiles/{steam_id}"),
            "is_verified": False,
            "auth_method": "steamid_manual",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user.copy())
        user.pop("_id", None)

    token = make_jwt(user["id"], steam_id)
    return {"token": token, "user": user}


@api.post("/auth/verify/init")
async def verify_init(user=Depends(get_current_user)):
    """Generate a short code the user must add to their Steam profile 'Real Name' field."""
    if user.get("is_verified"):
        return {"already_verified": True}
    code = "SKMK-" + secrets.token_hex(3).upper()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    await db.users.update_one({"id": user["id"]},
        {"$set": {"verify_code": code, "verify_expires": expires}})
    return {
        "code": code,
        "expires_at": expires,
        "instructions": (
            "1) Go to your Steam profile → Edit Profile → paste this code into the "
            "'Real Name' field. 2) Save. 3) Come back and click Verify."
        ),
        "profile_edit_url": "https://steamcommunity.com/my/edit/info",
    }


@api.post("/auth/verify/check")
async def verify_check(user=Depends(get_current_user)):
    """Verify by fetching the public Steam profile XML and checking for the code."""
    if user.get("is_verified"):
        return {"verified": True}
    code = user.get("verify_code")
    expires = user.get("verify_expires")
    if not code:
        raise HTTPException(400, "Call /auth/verify/init first")
    if expires and datetime.now(timezone.utc) > datetime.fromisoformat(expires):
        raise HTTPException(400, "Verification code expired — request a new one")

    # Fetch public Steam profile XML (no API key required)
    url = f"https://steamcommunity.com/profiles/{user['steam_id']}?xml=1"
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(url, headers={"User-Agent": "Mozilla/5.0"})
        text = resp.text if resp.status_code == 200 else ""
    except Exception as e:
        log.error(f"Steam profile fetch error: {e}")
        raise HTTPException(502, "Could not reach Steam to verify. Try again.")

    if code not in text:
        raise HTTPException(400, "Code not found in your Steam profile Real Name. "
                                  "Make sure you saved the change and the profile is public.")
    await db.users.update_one({"id": user["id"]},
        {"$set": {"is_verified": True},
         "$unset": {"verify_code": "", "verify_expires": ""}})
    return {"verified": True}


async def require_verified(user=Depends(get_current_user)):
    """Only Steam OpenID (cryptographically verified) users can list or purchase.
    SteamID64 fallback users are read-only — they can view inventory but not transact."""
    if user.get("auth_method") != "steam_openid":
        raise HTTPException(403, "Read-only mode. Sign in with Steam OpenID to list or purchase skins.")
    return user


import secrets

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "onboarding@resend.dev")


async def send_email_code(to_email: str, code: str, purpose: str = "verify") -> bool:
    """Send a 6-digit code via Resend. If no key configured, log the code (dev mode)."""
    subject = f"SKIN.MRKT code: {code}"
    html = f"""<div style='font-family:sans-serif;background:#0A0A0A;color:#E0E0E0;padding:32px;'>
      <h2 style='color:#E4AE39;letter-spacing:-0.02em;'>Your SKIN.MRKT code</h2>
      <div style='font-size:36px;font-family:monospace;font-weight:900;color:#E4AE39;letter-spacing:8px;
                  background:#121212;padding:20px;text-align:center;border:1px solid #E4AE3940;margin:24px 0;'>{code}</div>
      <p style='color:#8A8A8A;font-size:13px;'>This code is used to {purpose}. It expires in 15 minutes.
      If you didn't request this, ignore this email.</p></div>"""
    if not RESEND_API_KEY:
        log.warning(f"[EMAIL DEV MODE] To={to_email} Code={code} (set RESEND_API_KEY to send real emails)")
        return True
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post("https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
                json={"from": EMAIL_FROM, "to": [to_email], "subject": subject, "html": html})
        if r.status_code >= 300:
            log.error(f"Resend send error {r.status_code}: {r.text}")
            return False
    except Exception as e:
        log.error(f"Resend error: {e}")
        return False
    return True


class EmailInit(BaseModel):
    email: str

class EmailCheck(BaseModel):
    code: str


@api.post("/auth/email/init")
async def email_verify_init(payload: EmailInit, user=Depends(get_current_user)):
    email = (payload.email or "").strip().lower()
    if "@" not in email or len(email) < 5:
        raise HTTPException(400, "Enter a valid email address")
    code = "".join(secrets.choice("0123456789") for _ in range(6))
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    await db.users.update_one({"id": user["id"]},
        {"$set": {"email": email, "email_code": code, "email_code_expires": expires}})
    sent = await send_email_code(email, code, "verify Steam account ownership")
    return {"sent": sent, "email": email,
            "dev_hint": "Check backend logs for the code (RESEND_API_KEY not set)" if not RESEND_API_KEY else None}


@api.post("/auth/email/check")
async def email_verify_check(payload: EmailCheck, user=Depends(get_current_user)):
    code = (payload.code or "").strip()
    expected = user.get("email_code")
    exp = user.get("email_code_expires")
    if not expected:
        raise HTTPException(400, "Request a code first via /auth/email/init")
    if exp and datetime.now(timezone.utc) > datetime.fromisoformat(exp):
        raise HTTPException(400, "Code expired — request a new one")
    if code != expected:
        raise HTTPException(400, "Wrong code")
    await db.users.update_one({"id": user["id"]},
        {"$set": {"is_verified": True, "email_verified": True},
         "$unset": {"email_code": "", "email_code_expires": ""}})
    return {"verified": True}


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


@api.get("/skins/search")
async def skins_search(q: str = "", rarity: str = "", limit: int = 40):
    """Search the master skins catalog (2000+ real CS2 skins)."""
    query = {}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    if rarity:
        query["rarity"] = rarity
    items = await db.skins_master.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return {"items": items}


@api.get("/skins/detail/{master_id}")
async def skin_detail(master_id: str):
    """Detailed info for a single skin + all current live listings of it."""
    from skins_catalog import PRICE_RANGES
    skin = await db.skins_master.find_one({"master_id": master_id}, {"_id": 0})
    if not skin:
        raise HTTPException(404, "Skin not found")
    listings = await db.listings.find(
        {"skin_name": skin["name"], "status": "active"},
        {"_id": 0},
    ).sort([("price_usd", 1)]).to_list(200)
    lo, hi = PRICE_RANGES.get(skin.get("rarity"), (1.0, 10.0))
    skin["reference_price_usd"] = round((lo + hi) / 2, 2)
    skin["price_range_usd"] = {"low": lo, "high": hi}
    # Attach live Steam Market prices (aggregated across wear variants)
    summary = await get_market_summary_for(db, skin["name"])
    if summary:
        skin["market_price_usd"] = summary["market_price_usd"]
        skin["market_price_min"] = summary["market_price_min"]
        skin["market_price_max"] = summary["market_price_max"]
        skin["market_price_median"] = summary["market_price_median"]
        skin["volume_7d"] = summary["volume_7d"]
        skin["market_price_updated_at"] = summary["market_price_updated_at"]
        skin["market_variants"] = summary["variants"]
    else:
        skin["market_price_usd"] = None
        skin["market_variants"] = []
    return {"skin": skin, "listings": listings, "listings_count": len(listings)}


@api.get("/skins/categories")
async def skins_categories():
    """Return the left-sidebar structure: groups → list of {type, count} for every
    type of skin/container in the master catalog."""
    pipeline = [
        {"$group": {"_id": {"category": "$category", "type": "$type"}, "count": {"$sum": 1}}},
    ]
    raw = await db.skins_master.aggregate(pipeline).to_list(200)
    # Order weapon types roughly as: primary → secondary → melee → gloves
    WEAPON_ORDER = ["Rifle", "Sniper Rifle", "SMG", "Shotgun", "Machinegun", "Pistol", "Knife", "Gloves"]
    CONTAINER_ORDER = ["Case", "Sticker Capsule", "Autograph Capsule", "Music Kit Box",
                       "Patch Capsule", "Pins Capsule", "Graffiti Box",
                       "Souvenir Package", "Souvenir Highlight"]

    weapons, melee, containers, other = [], [], [], []
    for row in raw:
        t = (row["_id"] or {}).get("type") or "Other"
        cat = (row["_id"] or {}).get("category") or "weapon"
        entry = {"type": t, "count": row["count"], "category": cat}
        if cat == "container":
            containers.append(entry)
        elif t in ("Knife", "Gloves"):
            melee.append(entry)
        elif t in WEAPON_ORDER:
            weapons.append(entry)
        else:
            other.append(entry)

    def _sort(rows, order):
        idx = {t: i for i, t in enumerate(order)}
        return sorted(rows, key=lambda r: (idx.get(r["type"], 999), r["type"]))

    total_all = sum(r["count"] for r in weapons + melee + containers + other)
    return {
        "total": total_all,
        "groups": [
            {"key": "weapons",    "label": "Weapons",    "items": _sort(weapons,    WEAPON_ORDER)},
            {"key": "melee",      "label": "Melee & Gear", "items": _sort(melee,    ["Knife", "Gloves"])},
            {"key": "containers", "label": "Containers", "items": _sort(containers, CONTAINER_ORDER)},
        ],
    }


@api.get("/skins/all")
async def skins_all(
    search: str = "",
    rarity: Optional[str] = None,
    weapon_type: Optional[str] = None,
    category: Optional[str] = None,
    sort: str = "name_asc",
    page: int = 1,
    page_size: int = 60,
):
    """Return the full CS2 master catalog with computed reference prices.
    This is the main 'Marketplace' — a pricing catalog of every CS2 skin.
    """
    from skins_catalog import PRICE_RANGES
    q = {}
    if search: q["name"] = {"$regex": search, "$options": "i"}
    if rarity: q["rarity"] = rarity
    if weapon_type: q["type"] = weapon_type
    if category: q["category"] = category

    sort_map = {
        "name_asc": [("name", 1)],
        "name_desc": [("name", -1)],
        "rarity_desc": [("rarity", -1)],
    }
    total = await db.skins_master.count_documents(q)
    skip = max(0, (page - 1) * page_size)
    docs = await db.skins_master.find(q, {"_id": 0}).sort(sort_map.get(sort, sort_map["name_asc"])).skip(skip).limit(page_size).to_list(page_size)

    # Attach reference price (midpoint of rarity band) and live-listing counts
    for d in docs:
        lo, hi = PRICE_RANGES.get(d.get("rarity"), (1.0, 10.0))
        d["reference_price_usd"] = round((lo + hi) / 2, 2)
        d["price_range_usd"] = {"low": lo, "high": hi}
        d["live_listings"] = await db.listings.count_documents({
            "skin_name": d.get("name"), "status": "active"
        })
        # Live Steam Market price (aggregated across wears)
        summary = await get_market_summary_for(db, d["name"])
        if summary:
            d["market_price_usd"] = summary["market_price_usd"]
            d["market_price_min"] = summary["market_price_min"]
            d["market_price_max"] = summary["market_price_max"]
            d["volume_7d"] = summary["volume_7d"]
            d["market_price_updated_at"] = summary["market_price_updated_at"]
        else:
            d["market_price_usd"] = None
            d["market_price_updated_at"] = None
    return {"items": docs, "total": total, "page": page, "page_size": page_size}


# ---------------- Admin: price sync ----------------

def _require_admin(x_admin_token: Optional[str] = Header(None)):
    if not ADMIN_TOKEN:
        raise HTTPException(500, "ADMIN_TOKEN not configured on server")
    if not x_admin_token or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(403, "Admin token required")
    return True


@api.post("/skins/refresh-prices")
async def refresh_prices(_: bool = Depends(_require_admin)):
    """Trigger a Skinport price sync in the background. Returns immediately;
    poll GET /skins/price-sync-status for progress."""
    import asyncio as _aio
    state = get_sync_state()
    if state["running"]:
        return {"ok": True, "already_running": True, "state": state}
    _aio.create_task(sync_all_prices(db))
    return {"ok": True, "started": True, "source": "skinport", "state": get_sync_state()}


@api.get("/skins/price-sync-status")
async def price_sync_status():
    """Public: last sync timestamp + running flag (safe to expose)."""
    return get_sync_state()


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
async def create_listing(payload: ListingCreate, user=Depends(require_verified)):
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
async def create_checkout(listing_id: str, request: Request, user=Depends(require_verified)):
    listing = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing["status"] != "active":
        raise HTTPException(400, "Listing not available")
    if listing["seller_id"] == user["id"]:
        raise HTTPException(400, "Cannot buy your own listing")

    order_id = str(uuid.uuid4())
    origin = str(request.base_url).rstrip("/")
    # If frontend and backend share the same host (Kubernetes ingress), use FRONTEND_URL
    success_base = FRONTEND_URL or origin
    webhook_url = f"{origin}/api/webhook/stripe"

    checkout = StripeCheckout(api_key=STRIPE_KEY, webhook_url=webhook_url)
    req = CheckoutSessionRequest(
        amount=float(listing["price_usd"]),
        currency="usd",
        success_url=f"{success_base}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&order_id={order_id}",
        cancel_url=f"{success_base}/checkout/cancel?order_id={order_id}",
        metadata={
            "order_id": order_id,
            "listing_id": listing_id,
            "buyer_id": user["id"],
            "seller_id": listing["seller_id"],
        },
    )
    try:
        session = await checkout.create_checkout_session(req)
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
        "stripe_session_id": session.session_id,
        "status": "pending",
        "trade_status": "awaiting_payment",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.insert_one(order.copy())

    # Also record in payment_transactions per playbook
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "order_id": order_id,
        "amount": float(listing["price_usd"]),
        "currency": "usd",
        "user_id": user["id"],
        "metadata": {"order_id": order_id, "listing_id": listing_id},
        "payment_status": "initiated",
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"session_id": session.session_id, "checkout_url": session.url, "order_id": order_id}


@api.get("/orders/{order_id}/status")
async def order_status(order_id: str, request: Request, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["buyer_id"] != user["id"] and order["seller_id"] != user["id"]:
        raise HTTPException(403, "Not your order")

    # Sync with Stripe if still pending
    if order["status"] == "pending" and order.get("stripe_session_id"):
        origin = str(request.base_url).rstrip("/")
        webhook_url = f"{origin}/api/webhook/stripe"
        checkout = StripeCheckout(api_key=STRIPE_KEY, webhook_url=webhook_url)
        try:
            status_resp = await checkout.get_checkout_status(order["stripe_session_id"])
            if status_resp.payment_status == "paid":
                # Idempotent update
                res = await db.orders.update_one(
                    {"id": order_id, "status": "pending"},
                    {"$set": {"status": "paid", "trade_status": "trade_sent",
                              "paid_at": datetime.now(timezone.utc).isoformat()}}
                )
                if res.modified_count:
                    await db.listings.update_one(
                        {"id": order["listing_id"]},
                        {"$set": {"status": "sold"}}
                    )
                    await db.payment_transactions.update_one(
                        {"session_id": order["stripe_session_id"]},
                        {"$set": {"payment_status": "paid", "status": "completed"}}
                    )
                order["status"] = "paid"
                order["trade_status"] = "trade_sent"
        except Exception as e:
            log.error(f"Stripe sync error: {e}")
    return order


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    origin = str(request.base_url).rstrip("/")
    checkout = StripeCheckout(api_key=STRIPE_KEY, webhook_url=f"{origin}/api/webhook/stripe")
    try:
        event = await checkout.handle_webhook(body, sig)
    except Exception as e:
        log.error(f"Webhook error: {e}")
        return JSONResponse({"error": "invalid"}, status_code=400)

    if event.payment_status == "paid" and event.session_id:
        order_id = (event.metadata or {}).get("order_id")
        if order_id:
            res = await db.orders.update_one(
                {"id": order_id, "status": "pending"},
                {"$set": {"status": "paid", "trade_status": "trade_sent",
                          "paid_at": datetime.now(timezone.utc).isoformat()}}
            )
            if res.modified_count:
                order = await db.orders.find_one({"id": order_id}, {"_id": 0})
                if order:
                    await db.listings.update_one(
                        {"id": order["listing_id"]},
                        {"$set": {"status": "sold"}}
                    )
                await db.payment_transactions.update_one(
                    {"session_id": event.session_id},
                    {"$set": {"payment_status": "paid", "status": "completed"}}
                )
    return {"ok": True}


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
