from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Header
from fastapi.responses import RedirectResponse, JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
import uuid
import re
import jwt
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import bcrypt
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
BOOTSTRAP_ADMIN_EMAIL = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "admin@skinmrkt.com")
BOOTSTRAP_ADMIN_PASSWORD = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "admin1234")
BOOTSTRAP_MOD_EMAIL = os.environ.get("BOOTSTRAP_MOD_EMAIL", "mod@skinmrkt.com")
BOOTSTRAP_MOD_PASSWORD = os.environ.get("BOOTSTRAP_MOD_PASSWORD", "mod1234")

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


async def get_current_user(authorization: Optional[str] = Header(None),
                            request: Request = None) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    payload = decode_jwt(authorization.split(" ", 1)[1])
    if not payload:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("is_banned"):
        raise HTTPException(403, f"Account banned: {user.get('ban_reason') or 'Terms of Service violation'}")
    # Best-effort IP capture on every auth'd request (silent failure)
    try:
        if request is not None:
            ip = _client_ip(request)
            if ip and ip != user.get("last_ip"):
                await db.users.update_one({"id": user["id"]}, {
                    "$set": {"last_ip": ip, "last_seen_at": datetime.now(timezone.utc).isoformat()},
                    "$addToSet": {"ip_history": ip},
                })
    except Exception:
        pass
    return user


def _client_ip(request: Request) -> Optional[str]:
    """Extract the real client IP behind the ingress. Trusts X-Forwarded-For's first hop."""
    xff = request.headers.get("x-forwarded-for") or ""
    if xff:
        return xff.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None


async def get_admin_user(user=Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user


async def get_moderator_user(user=Depends(get_current_user)) -> dict:
    """Allows admins OR moderators. Used for view-only mod endpoints."""
    if not (user.get("is_admin") or user.get("is_moderator")):
        raise HTTPException(403, "Moderator or admin only")
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


class FavoriteCreate(BaseModel):
    target_type: str   # "listing" | "skin"
    target_id: str     # listing.id or master_id
    # Optional client-provided snapshot (used to render Favorites page even if
    # the underlying doc is later deleted). Server-verified for listing type.
    snapshot: Optional[dict] = None


# ---- Member Panel models ----

class ProfileUpdate(BaseModel):
    trade_url: Optional[str] = None
    bio: Optional[str] = None
    socials: Optional[dict] = None   # {twitter, discord, instagram, youtube, twitch}
    profile_public: Optional[bool] = None


class NotificationPrefs(BaseModel):
    on_trade_verified: Optional[bool] = None
    on_item_purchased: Optional[bool] = None
    on_listing_sold: Optional[bool] = None
    on_new_listing_for_fav_skin: Optional[bool] = None
    on_offer_received: Optional[bool] = None
    on_price_drop: Optional[bool] = None                # premium
    on_new_listing_in_category: Optional[bool] = None   # premium
    email_notifications: Optional[bool] = None          # premium


class WalletTxn(BaseModel):
    amount_usd: float
    note: Optional[str] = None


class BuyOrderCreate(BaseModel):
    skin_name: str
    master_id: Optional[str] = None
    max_price_usd: float
    wear: Optional[str] = None       # optional wear filter
    note: Optional[str] = None


class OfferCreate(BaseModel):
    listing_id: str
    price_usd: float
    message: Optional[str] = None


class TicketCreate(BaseModel):
    subject: str
    body: str
    category: Optional[str] = None       # e.g. trade_issue | payment | account | other
    order_id: Optional[str] = None       # optional link to a specific order


class TicketMessage(BaseModel):
    body: str


class ModeratorToggle(BaseModel):
    is_moderator: bool


# Helpers for favorites/notifications
async def _create_notification(user_id: str, ntype: str, title: str, body: str,
                                target_type: str, target_id: str,
                                snapshot: Optional[dict] = None):
    """Insert an unread notification. Silently swallows dupes on unique index."""
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "body": body,
        "target_type": target_type,
        "target_id": target_id,
        "snapshot": snapshot or {},
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.notifications.insert_one(doc)
    except Exception as e:
        log.warning(f"notification insert warning: {e}")


async def _notify_listing_sold(listing: dict, buyer_id: Optional[str] = None):
    """Fan-out: notify every user who favorited this listing that it's gone."""
    listing_id = listing.get("id")
    if not listing_id:
        return
    favs = await db.favorites.find(
        {"target_type": "listing", "target_id": listing_id},
        {"_id": 0},
    ).to_list(1000)
    for f in favs:
        if buyer_id and f["user_id"] == buyer_id:
            continue  # skip the buyer themselves
        await _create_notification(
            user_id=f["user_id"],
            ntype="listing_sold",
            title="A favourite was sold",
            body=f"{listing.get('skin_name', 'The item')} you saved was just bought by another user — it's no longer available.",
            target_type="listing",
            target_id=listing_id,
            snapshot={
                "skin_name": listing.get("skin_name"),
                "wear": listing.get("wear"),
                "image": listing.get("image"),
                "rarity": listing.get("rarity"),
                "price_usd": listing.get("price_usd"),
            },
        )


async def _notify_new_listing_for_skin(listing: dict):
    """Fan-out: notify users who favorited this base skin that a new listing dropped."""
    skin_name = listing.get("skin_name")
    if not skin_name:
        return
    master = await db.skins_master.find_one({"name": skin_name}, {"_id": 0, "master_id": 1})
    if not master:
        return
    master_id = master.get("master_id")
    favs = await db.favorites.find(
        {"target_type": "skin", "target_id": master_id},
        {"_id": 0},
    ).to_list(1000)
    for f in favs:
        if f["user_id"] == listing.get("seller_id"):
            continue  # skip the seller themselves
        await _create_notification(
            user_id=f["user_id"],
            ntype="new_listing",
            title="New listing for a favourite skin",
            body=f"{skin_name} ({listing.get('wear','—')}) just listed at ${listing.get('price_usd', 0):.2f}",
            target_type="skin",
            target_id=master_id,
            snapshot={
                "skin_name": skin_name,
                "wear": listing.get("wear"),
                "image": listing.get("image"),
                "rarity": listing.get("rarity"),
                "price_usd": listing.get("price_usd"),
                "listing_id": listing.get("id"),
            },
        )


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

    # Favorites: fast lookup by user + unique per (user, target)
    try:
        await db.favorites.create_index(
            [("user_id", 1), ("target_type", 1), ("target_id", 1)],
            unique=True,
        )
    except Exception as e:
        log.warning(f"favorites index warning: {e}")

    # Notifications: fast per-user listing + unread count
    try:
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.notifications.create_index([("user_id", 1), ("read", 1)])
    except Exception as e:
        log.warning(f"notifications index warning: {e}")

    # Member-panel collections
    try:
        await db.wallet_txns.create_index([("user_id", 1), ("created_at", -1)])
        await db.buy_orders.create_index([("user_id", 1), ("created_at", -1)])
        await db.buy_orders.create_index([("skin_name", 1), ("status", 1)])
        await db.offers.create_index([("seller_id", 1), ("created_at", -1)])
        await db.offers.create_index([("buyer_id", 1), ("created_at", -1)])
        await db.offers.create_index([("listing_id", 1), ("status", 1)])
        await db.support_tickets.create_index([("user_id", 1), ("updated_at", -1)])
        await db.support_tickets.create_index([("status", 1), ("updated_at", -1)])
    except Exception as e:
        log.warning(f"member-panel indexes warning: {e}")

    # Bootstrap admin login credentials — creates a password-based admin
    # user on first boot if one doesn't already exist for the configured
    # BOOTSTRAP_ADMIN_EMAIL. Use env vars to override the defaults.
    async def _seed_staff(email: str, password: str, role: str):
        """role is 'admin' or 'moderator'. Sets the matching flag."""
        try:
            existing = await db.users.find_one({"admin_email": email.lower()})
            if existing:
                return
            pw_hash = bcrypt.hashpw(password.encode("utf-8"),
                                     bcrypt.gensalt(rounds=10)).decode("utf-8")
            doc = {
                "id": str(uuid.uuid4()),
                "steam_id": f"{role}-" + str(uuid.uuid4())[:12],
                "display_name": role.capitalize(),
                "admin_email": email.lower(),
                "admin_password_hash": pw_hash,
                "auth_method": "admin_password",
                "is_admin": role == "admin",
                "is_moderator": role == "moderator",
                "is_verified": True,
                "is_banned": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.users.insert_one(doc)
            log.info(f"Seeded bootstrap {role}: {email}")
        except Exception as e:
            log.warning(f"{role} bootstrap warning: {e}")

    if BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD:
        await _seed_staff(BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, "admin")
    if BOOTSTRAP_MOD_EMAIL and BOOTSTRAP_MOD_PASSWORD:
        await _seed_staff(BOOTSTRAP_MOD_EMAIL, BOOTSTRAP_MOD_PASSWORD, "moderator")
    try:
        await db.users.create_index("admin_email", unique=True,
                                     partialFilterExpression={"admin_email": {"$exists": True}})
    except Exception as e:
        log.warning(f"admin_email index warning: {e}")

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

    ip = _client_ip(request)
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
            "last_ip": ip,
            "ip_history": [ip] if ip else [],
            "is_admin": False,
            "is_banned": False,
        }
        await db.users.insert_one(user.copy())
        user.pop("_id", None)
    else:
        # Refresh display info + IP + upgrade auth_method if needed
        # (a user could have been auto-created via /auth/steamid before actually
        #  completing OpenID; a successful OpenID must always upgrade them.)
        summary = await fetch_player_summary(steam_id, STEAM_API_KEY)
        upd = {"last_seen_at": datetime.now(timezone.utc).isoformat(),
               "auth_method": "steam_openid",
               "is_verified": True}
        if summary:
            upd["display_name"] = summary.get("personaname", user["display_name"])
            upd["avatar"] = summary.get("avatarfull", user.get("avatar"))
            if summary.get("profileurl"):
                upd["profile_url"] = summary["profileurl"]
        add = {}
        if ip:
            upd["last_ip"] = ip
            add["ip_history"] = ip
        update_doc = {"$set": upd}
        if add:
            update_doc["$addToSet"] = add
        await db.users.update_one({"steam_id": steam_id}, update_doc)
        # Reflect the upgrade in the in-memory copy so the JWT + downstream logic is consistent
        user["auth_method"] = "steam_openid"
        user["is_verified"] = True

    token = make_jwt(user["id"], steam_id)
    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={token}")


import secrets

class SteamIdLogin(BaseModel):
    steam_id: str


@api.post("/auth/steamid")
async def login_with_steamid(payload: SteamIdLogin, request: Request):
    """Fallback login: accept SteamID64 directly. Creates an UNVERIFIED session.
    Unverified users can browse but cannot list skins or purchase until they
    prove Steam profile ownership via /auth/verify/init + /auth/verify/check.
    """
    steam_id = (payload.steam_id or "").strip()
    if not steam_id.isdigit() or len(steam_id) != 17 or not steam_id.startswith("7656"):
        raise HTTPException(400, "Invalid SteamID64 (must be a 17-digit number starting with 7656)")

    ip = _client_ip(request)
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
            "last_ip": ip,
            "ip_history": [ip] if ip else [],
            "is_admin": False,
            "is_banned": False,
        }
        await db.users.insert_one(user.copy())
        user.pop("_id", None)
    else:
        if user.get("is_banned"):
            raise HTTPException(403, f"Account banned: {user.get('ban_reason') or 'Terms of Service violation'}")
        upd = {"last_seen_at": datetime.now(timezone.utc).isoformat()}
        add = {}
        if ip:
            upd["last_ip"] = ip
            add["ip_history"] = ip
        update_doc = {"$set": upd}
        if add:
            update_doc["$addToSet"] = add
        await db.users.update_one({"steam_id": steam_id}, update_doc)

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


RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "onboarding@resend.dev")

# CS2 in-game trade hold — Steam locks freshly-received items for 7 days
TRADE_LOCK_DAYS = 7


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


async def send_transactional_email(to_email: str, subject: str, html: str) -> bool:
    """Fire-and-forget style Resend send with the same dev-mode fallback."""
    if not to_email or "@" not in to_email:
        return False
    if not RESEND_API_KEY:
        log.warning(f"[EMAIL DEV MODE] To={to_email} Subject={subject!r} (set RESEND_API_KEY to send real emails)")
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
        log.error(f"Resend transactional error: {e}")
        return False
    return True


def _email_wants(user: dict, key: str) -> bool:
    """Check user has email + wants email_notifications + wants this specific event."""
    if not user or not user.get("email"):
        return False
    prefs = {**DEFAULT_NOTIFICATION_PREFS, **(user.get("notification_prefs") or {})}
    return bool(prefs.get("email_notifications") and prefs.get(key, True))


def _email_shell(inner_html: str) -> str:
    """Consistent dark-themed HTML wrapper."""
    return f"""<div style='font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0A0A0A;color:#E0E0E0;padding:32px;max-width:560px;margin:0 auto;'>
      <div style='border-bottom:1px solid #E4AE3940;padding-bottom:12px;margin-bottom:24px;'>
        <span style='color:#E4AE39;font-weight:900;letter-spacing:-0.02em;font-size:22px;'>SKIN.MRKT</span>
      </div>
      {inner_html}
      <p style='color:#555;font-size:11px;margin-top:32px;border-top:1px solid #222;padding-top:16px;'>
        You're receiving this because email notifications are enabled on your SKIN.MRKT account.
        Manage preferences at <a href='{FRONTEND_URL}/me?tab=notifs' style='color:#E4AE39;'>your notification settings</a>.
      </p>
    </div>"""


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
    items, reason = await fetch_cs2_inventory(user["steam_id"])
    if items:
        return {"items": items, "is_demo": False, "reason": reason}
    # No items — either private, empty, rate-limited, or network error
    messages = {
        "private":       "Your Steam CS2 inventory is set to Private. Change it to Public in your Steam privacy settings to see your real items here.",
        "rate_limited":  "Steam rate-limited our request. Try refreshing in a minute.",
        "not_found":     "Steam couldn't find a CS2 inventory for this account.",
        "network_error": "We couldn't reach Steam right now. Try again in a few seconds.",
        "ok":            "Your Steam CS2 inventory is public but empty. Play a match to earn a drop, or preview the flow with the demo items below.",
    }
    log.info(f"[inventory] steam_id={user['steam_id']} empty result reason={reason}")
    demo = demo_inventory()
    return {"items": demo, "is_demo": True, "reason": reason,
            "message": messages.get(reason, messages["private"])}


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
    # Fan-out: notify anyone who favorited this base skin + open buy orders that match
    try:
        await _notify_new_listing_for_skin(listing)
    except Exception as e:
        log.warning(f"new-listing notify failed: {e}")
    try:
        await _notify_matching_buy_orders(listing)
    except Exception as e:
        log.warning(f"buy-order match notify failed: {e}")
    # Email seller that their listing is live
    try:
        if _email_wants(user, "on_listing_sold"):
            price = listing["price_usd"]
            skin = listing["skin_name"]
            wear = listing.get("wear") or ""
            img = listing.get("image") or ""
            listing_url = f"{FRONTEND_URL}/market"
            img_html = (f"<img src='{img}' alt='' style='max-width:100%;border-radius:4px;"
                        f"background:#121212;padding:12px;margin:16px 0;' />") if img else ""
            html = _email_shell(f"""
              <h2 style='color:#fff;margin:0 0 8px;font-size:20px;letter-spacing:-0.02em;'>Your listing is live</h2>
              <p style='color:#B0B0B0;font-size:14px;margin:0 0 20px;'>
                <b style='color:#fff;'>{skin}</b>{f" ({wear})" if wear else ""} is now on the marketplace.
              </p>
              {img_html}
              <div style='background:#121212;border:1px solid #E4AE3940;border-radius:4px;padding:16px;margin:16px 0;'>
                <div style='color:#8A8A8A;font-size:11px;text-transform:uppercase;letter-spacing:2px;'>Asking price</div>
                <div style='color:#E4AE39;font-size:26px;font-weight:900;margin-top:4px;'>${price:.2f}</div>
              </div>
              <a href='{listing_url}' style='display:inline-block;background:#E4AE39;color:#0A0A0A;
                 font-weight:900;padding:12px 24px;text-decoration:none;border-radius:2px;
                 letter-spacing:2px;font-size:12px;text-transform:uppercase;'>View marketplace</a>
            """)
            asyncio.create_task(send_transactional_email(user["email"],
                f"Your {skin} listing is live on SKIN.MRKT", html))
    except Exception as e:
        log.warning(f"listing-live email failed: {e}")
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
                now = datetime.now(timezone.utc)
                unlock_at = now + timedelta(days=TRADE_LOCK_DAYS)
                res = await db.orders.update_one(
                    {"id": order_id, "status": "pending"},
                    {"$set": {"status": "paid", "trade_status": "trade_sent",
                              "paid_at": now.isoformat(),
                              "trade_locked_until": unlock_at.isoformat()}}
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
                    # Fan-out: notify anyone who favorited this listing
                    try:
                        await _notify_listing_sold(order.get("listing_snapshot") or {},
                                                    buyer_id=order.get("buyer_id"))
                    except Exception as e:
                        log.warning(f"sold-notify (sync) failed: {e}")
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
            now = datetime.now(timezone.utc)
            unlock_at = now + timedelta(days=TRADE_LOCK_DAYS)
            res = await db.orders.update_one(
                {"id": order_id, "status": "pending"},
                {"$set": {"status": "paid", "trade_status": "trade_sent",
                          "paid_at": now.isoformat(),
                          "trade_locked_until": unlock_at.isoformat()}}
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
                # Fan-out: notify anyone who favorited this listing
                try:
                    if order:
                        await _notify_listing_sold(order.get("listing_snapshot") or {},
                                                    buyer_id=order.get("buyer_id"))
                except Exception as e:
                    log.warning(f"sold-notify (webhook) failed: {e}")
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
    # Email both buyer + seller that the trade completed
    try:
        buyer = await db.users.find_one({"id": order.get("buyer_id")})
        seller = await db.users.find_one({"id": order.get("seller_id")})
        skin = order.get("skin_name") or "your skin"
        price = float(order.get("price_usd") or 0)
        img = order.get("image") or ""
        img_html = (f"<img src='{img}' alt='' style='max-width:100%;border-radius:4px;"
                    f"background:#121212;padding:12px;margin:16px 0;' />") if img else ""

        def _trade_html(role: str) -> str:
            headline = "Trade completed — item received" if role == "buyer" else "Trade completed — funds released"
            body = (f"You've confirmed receipt of <b style='color:#fff;'>{skin}</b>. "
                    f"The trade is now closed and escrow is released to the seller.") if role == "buyer" else (
                    f"The buyer has confirmed receipt of <b style='color:#fff;'>{skin}</b>. "
                    f"<b style='color:#E4AE39;'>${price:.2f}</b> has been credited to your wallet.")
            return _email_shell(f"""
              <h2 style='color:#fff;margin:0 0 8px;font-size:20px;letter-spacing:-0.02em;'>{headline}</h2>
              <p style='color:#B0B0B0;font-size:14px;margin:0 0 20px;'>{body}</p>
              {img_html}
              <a href='{FRONTEND_URL}/orders' style='display:inline-block;background:#E4AE39;color:#0A0A0A;
                 font-weight:900;padding:12px 24px;text-decoration:none;border-radius:2px;
                 letter-spacing:2px;font-size:12px;text-transform:uppercase;'>View orders</a>
            """)

        if _email_wants(buyer, "on_trade_verified"):
            asyncio.create_task(send_transactional_email(buyer["email"],
                f"Trade completed: {skin}", _trade_html("buyer")))
        if _email_wants(seller, "on_trade_verified"):
            asyncio.create_task(send_transactional_email(seller["email"],
                f"Trade completed: ${price:.2f} released", _trade_html("seller")))
    except Exception as e:
        log.warning(f"trade-complete email failed: {e}")
    return {"ok": True}


@api.get("/my/orders")
async def my_orders(user=Depends(get_current_user)):
    buys = await db.orders.find({"buyer_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    sells = await db.orders.find({"seller_id": user["id"]}, {"_id": 0}).sort([("created_at", -1)]).to_list(200)
    return {"buys": buys, "sells": sells}


# ---------------- Favorites (liked items) ----------------

@api.post("/favorites")
async def add_favorite(payload: FavoriteCreate, user=Depends(get_current_user)):
    if payload.target_type not in ("listing", "skin"):
        raise HTTPException(400, "target_type must be 'listing' or 'skin'")
    # Enrich snapshot server-side so it's authoritative
    snap = dict(payload.snapshot or {})
    if payload.target_type == "listing":
        l = await db.listings.find_one({"id": payload.target_id}, {"_id": 0})
        if not l:
            raise HTTPException(404, "Listing not found")
        snap.setdefault("skin_name", l.get("skin_name"))
        snap.setdefault("wear", l.get("wear"))
        snap.setdefault("image", l.get("image"))
        snap.setdefault("rarity", l.get("rarity"))
        snap.setdefault("price_usd", l.get("price_usd"))
    else:  # skin
        m = await db.skins_master.find_one({"master_id": payload.target_id}, {"_id": 0})
        if not m:
            raise HTTPException(404, "Skin not found")
        snap.setdefault("skin_name", m.get("name"))
        snap.setdefault("image", m.get("image"))
        snap.setdefault("rarity", m.get("rarity"))
        snap.setdefault("weapon", m.get("weapon"))
        snap.setdefault("type", m.get("type"))

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "target_type": payload.target_type,
        "target_id": payload.target_id,
        "snapshot": snap,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.favorites.insert_one(doc)
    except Exception:
        # Likely duplicate on unique index — return existing
        existing = await db.favorites.find_one(
            {"user_id": user["id"], "target_type": payload.target_type,
             "target_id": payload.target_id}, {"_id": 0},
        )
        return existing or {"ok": True, "duplicate": True}
    doc.pop("_id", None)
    return doc


@api.delete("/favorites")
async def remove_favorite(target_type: str, target_id: str,
                           user=Depends(get_current_user)):
    """Unfavorite by (target_type, target_id) — the natural key from the UI."""
    res = await db.favorites.delete_one({
        "user_id": user["id"],
        "target_type": target_type,
        "target_id": target_id,
    })
    return {"ok": True, "removed": res.deleted_count}


@api.get("/favorites")
async def list_favorites(user=Depends(get_current_user)):
    items = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}) \
        .sort([("created_at", -1)]).to_list(500)
    # Enrich with current listing status if applicable
    for f in items:
        if f["target_type"] == "listing":
            l = await db.listings.find_one({"id": f["target_id"]},
                                            {"_id": 0, "status": 1, "price_usd": 1})
            f["listing_status"] = l.get("status") if l else "unavailable"
            f["current_price_usd"] = l.get("price_usd") if l else None
    return {"items": items, "count": len(items)}


@api.get("/favorites/check")
async def check_favorites(user_optional=Depends(get_current_user_optional)):
    """Return a set of target_ids the current user has favorited (for UI heart-state)."""
    if not user_optional:
        return {"listings": [], "skins": []}
    docs = await db.favorites.find(
        {"user_id": user_optional["id"]},
        {"_id": 0, "target_type": 1, "target_id": 1},
    ).to_list(1000)
    return {
        "listings": [d["target_id"] for d in docs if d["target_type"] == "listing"],
        "skins":    [d["target_id"] for d in docs if d["target_type"] == "skin"],
    }


# ---------------- Notifications ----------------

@api.get("/notifications")
async def list_notifications(limit: int = 50, user=Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}) \
        .sort([("created_at", -1)]).limit(limit).to_list(limit)
    return {"items": items, "count": len(items)}


@api.get("/notifications/unread-count")
async def unread_count(user_optional=Depends(get_current_user_optional)):
    if not user_optional:
        return {"count": 0}
    n = await db.notifications.count_documents(
        {"user_id": user_optional["id"], "read": False}
    )
    return {"count": n}


@api.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user=Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": notif_id, "user_id": user["id"]},
        {"$set": {"read": True}}
    )
    return {"ok": True}


@api.post("/notifications/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    res = await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"ok": True, "updated": res.modified_count}


# ---------------- Member Panel ----------------

DEFAULT_NOTIFICATION_PREFS = {
    "on_trade_verified": True,
    "on_item_purchased": True,
    "on_listing_sold": True,
    "on_new_listing_for_fav_skin": True,
    "on_offer_received": True,
    "email_notifications": True,          # free for everyone
    "on_price_drop": False,               # premium
    "on_new_listing_in_category": False,  # premium
}

# Which notification prefs are gated behind a premium subscription
PREMIUM_PREF_KEYS = {"on_price_drop", "on_new_listing_in_category"}


def _compute_badges(user: dict, stats: dict) -> list[dict]:
    """Derive earned badges from user stats. Called on-demand — no persistence."""
    badges = []
    try:
        created = datetime.fromisoformat(user.get("created_at").replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - created).days
    except Exception:
        age_days = 0
    completed = stats.get("completed_orders", 0)
    spent = stats.get("total_spent_usd", 0.0)
    sold = stats.get("listings_sold", 0)
    trades_all = stats.get("all_orders", 0)

    def add(key, name, description, tier="normal", icon="award"):
        badges.append({"key": key, "name": name, "description": description, "tier": tier, "icon": icon})

    if user.get("is_admin"):
        add("admin", "Admin", "Platform administrator", tier="platform", icon="shield")
    if user.get("is_premium"):
        add("premium", "Premium", "Premium member with advanced alerts", tier="rare", icon="star")
    if user.get("is_verified"):
        add("verified", "Verified Trader", "Confirmed Steam profile ownership", tier="normal", icon="check")
    if trades_all >= 1:
        add("first_trade", "First Trade", "Completed your first trade", tier="normal", icon="handshake")
    if trades_all >= 10:
        add("regular", "Regular Trader", "10+ trades completed", tier="normal", icon="repeat")
    if trades_all >= 50:
        add("veteran_trader", "Veteran Trader", "50+ trades completed", tier="rare", icon="flame")
    if spent >= 1000:
        add("whale", "Whale", "Spent $1,000+ on the platform", tier="rare", icon="gem")
    if spent >= 5000:
        add("big_spender", "Big Spender", "Spent $5,000+ on the platform", tier="epic", icon="crown")
    if sold >= 10:
        add("prolific_seller", "Prolific Seller", "Sold 10+ items", tier="rare", icon="storefront")
    if age_days >= 30:
        add("veteran", "Veteran Member", "Member for 30+ days", tier="normal", icon="clock")
    return badges


async def _user_stats(user_id: str) -> dict:
    orders_bought = await db.orders.count_documents({"buyer_id": user_id})
    orders_sold = await db.orders.count_documents({"seller_id": user_id})
    completed = await db.orders.count_documents({
        "$or": [{"buyer_id": user_id}, {"seller_id": user_id}],
        "trade_status": "completed",
    })
    listings_active = await db.listings.count_documents({"seller_id": user_id, "status": "active"})
    listings_sold = await db.listings.count_documents({"seller_id": user_id, "status": "sold"})

    spent_pipe = [
        {"$match": {"buyer_id": user_id, "status": "paid"}},
        {"$group": {"_id": None, "sum": {"$sum": "$amount_usd"}}},
    ]
    spent_docs = await db.orders.aggregate(spent_pipe).to_list(1)
    total_spent = float(spent_docs[0]["sum"]) if spent_docs else 0.0

    earn_pipe = [
        {"$match": {"seller_id": user_id, "status": "paid"}},
        {"$group": {"_id": None, "sum": {"$sum": "$amount_usd"}}},
    ]
    earn_docs = await db.orders.aggregate(earn_pipe).to_list(1)
    total_earned = float(earn_docs[0]["sum"]) if earn_docs else 0.0

    return {
        "orders_bought": orders_bought,
        "orders_sold": orders_sold,
        "all_orders": orders_bought + orders_sold,
        "completed_orders": completed,
        "listings_active": listings_active,
        "listings_sold": listings_sold,
        "total_spent_usd": round(total_spent, 2),
        "total_earned_usd": round(total_earned, 2),
    }


# --- Profile ---

_TRADE_URL_RE = re.compile(r"^https?://(www\.)?steamcommunity\.com/tradeoffer/new/\?partner=\d+&token=[A-Za-z0-9_-]+$")
_SOCIAL_KEYS = {"twitter", "discord", "instagram", "youtube", "twitch"}


@api.get("/me/profile")
async def me_profile(user=Depends(get_current_user)):
    stats = await _user_stats(user["id"])
    badges = _compute_badges(user, stats)
    # Ensure fields exist with defaults for the UI
    prefs = {**DEFAULT_NOTIFICATION_PREFS, **(user.get("notification_prefs") or {})}
    profile = {
        "id": user["id"],
        "steam_id": user.get("steam_id"),
        "display_name": user.get("display_name"),
        "avatar": user.get("avatar"),
        "profile_url": user.get("profile_url"),
        "email": user.get("email"),
        "is_verified": user.get("is_verified", False),
        "is_premium": user.get("is_premium", False),
        "is_admin": user.get("is_admin", False),
        "created_at": user.get("created_at"),
        "trade_url": user.get("trade_url"),
        "bio": user.get("bio"),
        "socials": user.get("socials") or {},
        "profile_public": user.get("profile_public", True),
        "notification_prefs": prefs,
        "wallet_balance_usd": round(float(user.get("wallet_balance_usd", 0.0)), 2),
    }
    return {"profile": profile, "stats": stats, "badges": badges}


@api.patch("/me/profile")
async def update_profile(payload: ProfileUpdate, user=Depends(get_current_user)):
    upd = {}
    if payload.trade_url is not None:
        tu = payload.trade_url.strip()
        if tu and not _TRADE_URL_RE.match(tu):
            raise HTTPException(400, "Trade URL must look like https://steamcommunity.com/tradeoffer/new/?partner=…&token=…")
        upd["trade_url"] = tu or None
    if payload.bio is not None:
        upd["bio"] = payload.bio.strip()[:280] or None
    if payload.socials is not None:
        clean = {}
        for k, v in (payload.socials or {}).items():
            if k in _SOCIAL_KEYS and isinstance(v, str):
                v = v.strip()[:120]
                if v:
                    clean[k] = v
        upd["socials"] = clean
    if payload.profile_public is not None:
        upd["profile_public"] = bool(payload.profile_public)
    if not upd:
        return {"ok": True, "updated": 0}
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "admin_password_hash": 0,
                                                          "verify_code": 0, "email_code": 0})
    return {"ok": True, "updated": len(upd), "user": fresh}


@api.patch("/me/notifications")
async def update_notification_prefs(payload: NotificationPrefs, user=Depends(get_current_user)):
    curr = {**DEFAULT_NOTIFICATION_PREFS, **(user.get("notification_prefs") or {})}
    incoming = payload.dict(exclude_unset=True)
    # Gate premium keys
    if not user.get("is_premium"):
        for pk in PREMIUM_PREF_KEYS:
            if pk in incoming and incoming[pk] and not curr.get(pk):
                raise HTTPException(403, f"'{pk}' requires a Premium membership")
    curr.update(incoming)
    await db.users.update_one({"id": user["id"]}, {"$set": {"notification_prefs": curr}})
    return {"ok": True, "notification_prefs": curr}


# --- Wallet & Ledger (MOCKED top-ups/withdrawals) ---

async def _record_wallet_txn(user_id: str, kind: str, amount_usd: float,
                              note: str = "", ref_id: Optional[str] = None) -> dict:
    """Append a ledger entry AND update the user's cached balance atomically.
    'kind' is one of: deposit, withdraw, purchase, sale, refund."""
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "kind": kind,
        "amount_usd": round(float(amount_usd), 2),  # positive=in, negative=out
        "note": note or "",
        "ref_id": ref_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wallet_txns.insert_one(doc)
    await db.users.update_one({"id": user_id},
                                {"$inc": {"wallet_balance_usd": doc["amount_usd"]}})
    doc.pop("_id", None)
    return doc


@api.get("/me/wallet")
async def me_wallet(limit: int = 50, user=Depends(get_current_user)):
    balance = round(float(user.get("wallet_balance_usd", 0.0)), 2)
    txns = await db.wallet_txns.find({"user_id": user["id"]}, {"_id": 0}) \
        .sort([("created_at", -1)]).limit(limit).to_list(limit)
    return {"balance_usd": balance, "transactions": txns}


@api.post("/me/wallet/deposit")
async def wallet_deposit(payload: WalletTxn, user=Depends(get_current_user)):
    """MOCKED deposit — instantly credits the wallet. Real integration would go
    through Stripe. See /wallet-note in the UI for the disclosure."""
    if payload.amount_usd <= 0:
        raise HTTPException(400, "Amount must be positive")
    if payload.amount_usd > 10000:
        raise HTTPException(400, "Deposit cap is $10,000 in demo mode")
    txn = await _record_wallet_txn(user["id"], "deposit", payload.amount_usd,
                                     note=payload.note or "Demo deposit")
    return {"ok": True, "transaction": txn,
            "new_balance": round(user.get("wallet_balance_usd", 0.0) + payload.amount_usd, 2)}


@api.post("/me/wallet/withdraw")
async def wallet_withdraw(payload: WalletTxn, user=Depends(get_current_user)):
    if payload.amount_usd <= 0:
        raise HTTPException(400, "Amount must be positive")
    curr = float(user.get("wallet_balance_usd", 0.0))
    if payload.amount_usd > curr:
        raise HTTPException(400, f"Insufficient balance (${curr:.2f})")
    txn = await _record_wallet_txn(user["id"], "withdraw", -payload.amount_usd,
                                     note=payload.note or "Demo withdrawal")
    return {"ok": True, "transaction": txn,
            "new_balance": round(curr - payload.amount_usd, 2)}


# --- Transactions (my trades) ---

@api.get("/me/orders")
async def me_orders(user=Depends(get_current_user)):
    bought = await db.orders.find({"buyer_id": user["id"]}, {"_id": 0}) \
        .sort([("created_at", -1)]).to_list(200)
    sold = await db.orders.find({"seller_id": user["id"]}, {"_id": 0}) \
        .sort([("created_at", -1)]).to_list(200)
    return {"bought": bought, "sold": sold}


# --- Buy Orders ---

@api.post("/buy-orders")
async def create_buy_order(payload: BuyOrderCreate, user=Depends(get_current_user)):
    if payload.max_price_usd <= 0:
        raise HTTPException(400, "max_price_usd must be positive")
    # Require enough wallet balance to cover the potential buy
    balance = float(user.get("wallet_balance_usd", 0.0))
    if balance < payload.max_price_usd:
        raise HTTPException(400,
            f"Insufficient wallet balance. Need ${payload.max_price_usd:.2f}, have ${balance:.2f}. Deposit first.")
    # Verify master skin exists if master_id provided
    if payload.master_id:
        m = await db.skins_master.find_one({"master_id": payload.master_id}, {"_id": 0, "image": 1, "rarity": 1, "name": 1})
    else:
        m = await db.skins_master.find_one({"name": payload.skin_name}, {"_id": 0, "image": 1, "rarity": 1, "master_id": 1})
    if not m:
        raise HTTPException(404, "Skin not found")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user.get("display_name"),
        "skin_name": payload.skin_name,
        "master_id": payload.master_id or m.get("master_id"),
        "max_price_usd": round(float(payload.max_price_usd), 2),
        "wear": payload.wear,
        "note": (payload.note or "").strip()[:200],
        "image": m.get("image"),
        "rarity": m.get("rarity"),
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.buy_orders.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.get("/buy-orders")
async def list_my_buy_orders(user=Depends(get_current_user)):
    items = await db.buy_orders.find({"user_id": user["id"]}, {"_id": 0}) \
        .sort([("created_at", -1)]).to_list(200)
    # Attach current live listing count matching each buy order
    for b in items:
        b["matching_listings"] = await db.listings.count_documents({
            "skin_name": b["skin_name"],
            "status": "active",
            "price_usd": {"$lte": b["max_price_usd"]},
            **({"wear": b["wear"]} if b.get("wear") else {}),
        })
    return {"items": items, "count": len(items)}


@api.delete("/buy-orders/{order_id}")
async def cancel_buy_order(order_id: str, user=Depends(get_current_user)):
    res = await db.buy_orders.delete_one({"id": order_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(404, "Buy order not found")
    return {"ok": True}


async def _notify_matching_buy_orders(listing: dict):
    """When a new listing appears, notify buyers with an open buy order that matches."""
    price = listing.get("price_usd", 0)
    wear = listing.get("wear")
    matches = await db.buy_orders.find({
        "skin_name": listing.get("skin_name"),
        "status": "open",
        "max_price_usd": {"$gte": price},
        "$or": [{"wear": None}, {"wear": wear}],
    }, {"_id": 0}).to_list(500)
    for b in matches:
        if b["user_id"] == listing.get("seller_id"):
            continue
        await _create_notification(
            user_id=b["user_id"],
            ntype="buy_order_match",
            title="Buy order match",
            body=f"{listing.get('skin_name')} ({wear or 'any wear'}) is now on sale at ${price:.2f} — within your ${b['max_price_usd']:.2f} budget.",
            target_type="listing",
            target_id=listing.get("id"),
            snapshot={
                "skin_name": listing.get("skin_name"),
                "wear": wear,
                "image": listing.get("image"),
                "rarity": listing.get("rarity"),
                "price_usd": price,
                "listing_id": listing.get("id"),
            },
        )


# --- Offers ---

@api.post("/offers")
async def create_offer(payload: OfferCreate, user=Depends(get_current_user)):
    if payload.price_usd <= 0:
        raise HTTPException(400, "price_usd must be positive")
    l = await db.listings.find_one({"id": payload.listing_id}, {"_id": 0})
    if not l:
        raise HTTPException(404, "Listing not found")
    if l.get("status") != "active":
        raise HTTPException(400, "Listing is not active")
    if l.get("seller_id") == user["id"]:
        raise HTTPException(400, "You can't offer on your own listing")

    doc = {
        "id": str(uuid.uuid4()),
        "listing_id": l["id"],
        "listing_snapshot": {
            "skin_name": l.get("skin_name"), "wear": l.get("wear"),
            "image": l.get("image"), "rarity": l.get("rarity"),
            "list_price_usd": l.get("price_usd"),
        },
        "buyer_id": user["id"],
        "buyer_name": user.get("display_name"),
        "seller_id": l.get("seller_id"),
        "seller_name": l.get("seller_name"),
        "price_usd": round(float(payload.price_usd), 2),
        "message": (payload.message or "").strip()[:300],
        "status": "pending",   # pending | accepted | rejected | cancelled
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.offers.insert_one(doc.copy())
    doc.pop("_id", None)
    # Notify the seller
    await _create_notification(
        user_id=doc["seller_id"],
        ntype="offer_received",
        title="New offer received",
        body=f"{user.get('display_name')} offered ${doc['price_usd']:.2f} for your {l.get('skin_name')} (listed at ${l.get('price_usd'):.2f}).",
        target_type="listing",
        target_id=l["id"],
        snapshot=doc["listing_snapshot"],
    )
    return doc


@api.get("/offers")
async def list_offers(direction: str = "received", user=Depends(get_current_user)):
    """direction=received (offers on my listings) or sent (my outgoing offers)."""
    field = "seller_id" if direction == "received" else "buyer_id"
    items = await db.offers.find({field: user["id"]}, {"_id": 0}) \
        .sort([("created_at", -1)]).to_list(200)
    return {"items": items, "count": len(items), "direction": direction}


@api.post("/offers/{offer_id}/accept")
async def accept_offer(offer_id: str, user=Depends(get_current_user)):
    o = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Offer not found")
    if o.get("seller_id") != user["id"]:
        raise HTTPException(403, "Only the seller can accept")
    if o.get("status") != "pending":
        raise HTTPException(400, f"Offer already {o.get('status')}")
    # Drop the listing price to the accepted offer price so a normal checkout works
    await db.listings.update_one({"id": o["listing_id"]},
                                  {"$set": {"price_usd": o["price_usd"]}})
    await db.offers.update_one({"id": offer_id},
                                {"$set": {"status": "accepted",
                                          "accepted_at": datetime.now(timezone.utc).isoformat()}})
    # Reject all OTHER pending offers on the same listing
    await db.offers.update_many({"listing_id": o["listing_id"], "status": "pending",
                                  "id": {"$ne": offer_id}},
                                 {"$set": {"status": "rejected",
                                           "rejected_at": datetime.now(timezone.utc).isoformat()}})
    # Notify the buyer their offer was accepted
    await _create_notification(
        user_id=o["buyer_id"],
        ntype="offer_accepted",
        title="Your offer was accepted",
        body=f"{o.get('seller_name')} accepted your ${o['price_usd']:.2f} offer for {o['listing_snapshot'].get('skin_name')}. Go to the listing to check out.",
        target_type="listing",
        target_id=o["listing_id"],
        snapshot=o["listing_snapshot"],
    )
    return {"ok": True, "listing_id": o["listing_id"], "new_price_usd": o["price_usd"]}


@api.post("/offers/{offer_id}/reject")
async def reject_offer(offer_id: str, user=Depends(get_current_user)):
    o = await db.offers.find_one({"id": offer_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Offer not found")
    if o.get("seller_id") != user["id"]:
        raise HTTPException(403, "Only the seller can reject")
    if o.get("status") != "pending":
        raise HTTPException(400, f"Offer already {o.get('status')}")
    await db.offers.update_one({"id": offer_id},
                                {"$set": {"status": "rejected",
                                          "rejected_at": datetime.now(timezone.utc).isoformat()}})
    await _create_notification(
        user_id=o["buyer_id"],
        ntype="offer_rejected",
        title="Offer rejected",
        body=f"{o.get('seller_name')} declined your ${o['price_usd']:.2f} offer for {o['listing_snapshot'].get('skin_name')}.",
        target_type="listing",
        target_id=o["listing_id"],
        snapshot=o["listing_snapshot"],
    )
    return {"ok": True}


# ---------------- Support Tickets (users) ----------------

VALID_TICKET_CATEGORIES = {"trade_issue", "payment", "account", "listing", "other"}
VALID_TICKET_STATUSES = {"open", "pending_reply", "resolved", "closed"}


@api.post("/support/tickets")
async def create_ticket(payload: TicketCreate, user=Depends(get_current_user)):
    subject = (payload.subject or "").strip()
    body = (payload.body or "").strip()
    if not subject or len(subject) < 3:
        raise HTTPException(400, "Subject too short")
    if not body or len(body) < 10:
        raise HTTPException(400, "Body too short (min 10 chars)")
    cat = payload.category or "other"
    if cat not in VALID_TICKET_CATEGORIES:
        cat = "other"

    order_snapshot = None
    if payload.order_id:
        order = await db.orders.find_one({"id": payload.order_id, "buyer_id": user["id"]},
                                           {"_id": 0, "id": 1, "listing_snapshot": 1,
                                            "amount_usd": 1, "status": 1})
        if order:
            order_snapshot = order

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user.get("display_name"),
        "user_avatar": user.get("avatar"),
        "user_steam_id": user.get("steam_id"),
        "subject": subject[:200],
        "category": cat,
        "status": "open",
        "order_id": payload.order_id,
        "order_snapshot": order_snapshot,
        "messages": [{
            "id": str(uuid.uuid4()),
            "author_id": user["id"],
            "author_name": user.get("display_name"),
            "author_role": "user",
            "body": body[:4000],
            "created_at": now,
        }],
        "created_at": now,
        "updated_at": now,
    }
    await db.support_tickets.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api.get("/support/tickets")
async def list_my_tickets(user=Depends(get_current_user)):
    items = await db.support_tickets.find({"user_id": user["id"]},
                                            {"_id": 0, "messages": 0}) \
        .sort([("updated_at", -1)]).to_list(200)
    return {"items": items, "count": len(items)}


@api.get("/support/tickets/{ticket_id}")
async def get_my_ticket(ticket_id: str, user=Depends(get_current_user)):
    doc = await db.support_tickets.find_one({"id": ticket_id, "user_id": user["id"]},
                                              {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    return doc


@api.post("/support/tickets/{ticket_id}/messages")
async def add_ticket_message(ticket_id: str, payload: TicketMessage,
                              user=Depends(get_current_user)):
    body = (payload.body or "").strip()
    if not body or len(body) < 2:
        raise HTTPException(400, "Message too short")
    doc = await db.support_tickets.find_one({"id": ticket_id, "user_id": user["id"]},
                                              {"_id": 0, "status": 1})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    if doc["status"] == "closed":
        raise HTTPException(400, "Ticket is closed. Open a new one.")
    msg = {
        "id": str(uuid.uuid4()),
        "author_id": user["id"],
        "author_name": user.get("display_name"),
        "author_role": "user",
        "body": body[:4000],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$push": {"messages": msg},
         "$set": {"status": "open", "updated_at": msg["created_at"]}},
    )
    return {"ok": True, "message": msg}


# ---------------- Moderator (VIEW-ONLY) ----------------

@api.get("/mod/stats")
async def mod_stats(_: dict = Depends(get_moderator_user)):
    """A compact view for moderators — orders + tickets counts, no user data."""
    orders_total = await db.orders.count_documents({})
    orders_pending = await db.orders.count_documents({"status": "pending"})
    orders_paid = await db.orders.count_documents({"status": "paid"})
    tickets_open = await db.support_tickets.count_documents({"status": {"$in": ["open", "pending_reply"]}})
    tickets_total = await db.support_tickets.count_documents({})
    return {
        "orders": {"total": orders_total, "pending": orders_pending, "paid": orders_paid},
        "tickets": {"open": tickets_open, "total": tickets_total},
    }


@api.get("/mod/transactions")
async def mod_transactions(status: Optional[str] = None,
                            q: Optional[str] = None,
                            limit: int = 100,
                            skip: int = 0,
                            _: dict = Depends(get_moderator_user)):
    """View-only version of /admin/transactions. Same shape, no mutation
    endpoints exist for moderators."""
    filt = {}
    if status:
        filt["status"] = status
    if q:
        filt["$or"] = [
            {"id": q},
            {"listing_snapshot.skin_name": {"$regex": q, "$options": "i"}},
            {"buyer_name": {"$regex": q, "$options": "i"}},
            {"seller_name": {"$regex": q, "$options": "i"}},
        ]
    total = await db.orders.count_documents(filt)
    items = await db.orders.find(filt, {"_id": 0}) \
        .sort([("created_at", -1)]).skip(skip).limit(limit).to_list(limit)
    return {"items": items, "total": total, "limit": limit, "skip": skip}


@api.get("/mod/tickets")
async def mod_tickets(status: Optional[str] = None,
                       q: Optional[str] = None,
                       limit: int = 100,
                       skip: int = 0,
                       _: dict = Depends(get_moderator_user)):
    """View-only ticket list for moderators."""
    filt = {}
    if status:
        if status not in VALID_TICKET_STATUSES:
            raise HTTPException(400, "invalid status")
        filt["status"] = status
    if q:
        filt["$or"] = [
            {"id": q},
            {"subject": {"$regex": q, "$options": "i"}},
            {"user_name": {"$regex": q, "$options": "i"}},
            {"user_steam_id": {"$regex": q}},
        ]
    total = await db.support_tickets.count_documents(filt)
    items = await db.support_tickets.find(filt, {"_id": 0, "messages": 0}) \
        .sort([("updated_at", -1)]).skip(skip).limit(limit).to_list(limit)
    return {"items": items, "total": total, "limit": limit, "skip": skip}


@api.get("/mod/tickets/{ticket_id}")
async def mod_ticket_detail(ticket_id: str, _: dict = Depends(get_moderator_user)):
    doc = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    return doc


# ---------------- Admin Panel ----------------

class AdminLogin(BaseModel):
    email: str
    password: str


class BanPayload(BaseModel):
    reason: Optional[str] = None


@api.post("/admin/login")
async def admin_login(payload: AdminLogin, request: Request):
    """Email/password login for admins. Returns a JWT identical in shape to
    the Steam-based JWT (Authorization: Bearer <token>)."""
    email = (payload.email or "").strip().lower()
    pw = payload.password or ""
    if not email or not pw:
        raise HTTPException(400, "Email and password required")
    user = await db.users.find_one({"admin_email": email}, {"_id": 0})
    if not user or not user.get("admin_password_hash"):
        raise HTTPException(401, "Invalid credentials")
    if user.get("is_banned"):
        raise HTTPException(403, f"Account banned: {user.get('ban_reason') or 'Access denied'}")
    try:
        ok = bcrypt.checkpw(pw.encode("utf-8"), user["admin_password_hash"].encode("utf-8"))
    except Exception:
        ok = False
    if not ok:
        raise HTTPException(401, "Invalid credentials")
    if not (user.get("is_admin") or user.get("is_moderator")):
        raise HTTPException(403, "Not a staff account")
    # Update last IP + last seen
    ip = _client_ip(request)
    upd = {"last_seen_at": datetime.now(timezone.utc).isoformat()}
    add = {}
    if ip:
        upd["last_ip"] = ip
        add["ip_history"] = ip
    update_doc = {"$set": upd}
    if add:
        update_doc["$addToSet"] = add
    await db.users.update_one({"id": user["id"]}, update_doc)
    # Strip the hash before returning
    user.pop("admin_password_hash", None)
    token = make_jwt(user["id"], user.get("steam_id", "admin"))
    return {"token": token, "user": user}


@api.post("/admin/promote")
async def admin_promote(steam_id: Optional[str] = None,
                         user_id: Optional[str] = None,
                         x_admin_token: Optional[str] = Header(None)):
    """Bootstrap: promote a user to admin using the server-side ADMIN_TOKEN.
    Use this ONCE to make your Steam account an admin; from then on the
    admin can do everything via their normal JWT."""
    if not ADMIN_TOKEN or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(403, "Admin token required")
    if not steam_id and not user_id:
        raise HTTPException(400, "Provide steam_id or user_id")
    q = {"steam_id": steam_id} if steam_id else {"id": user_id}
    res = await db.users.update_one(q, {"$set": {"is_admin": True}})
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    return {"ok": True, "promoted": True}


@api.post("/admin/orders/{order_id}/force-unlock")
async def admin_force_unlock_order(order_id: str, _: dict = Depends(get_admin_user)):
    """Skip the 7-day CS2 trade lock on a paid order — for testing the trade flow."""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    if order.get("status") != "paid":
        raise HTTPException(400, "Order is not in a paid state")
    # Set the lock to the past so the item becomes immediately tradable
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"trade_locked_until": past, "trade_lock_forced": True}}
    )
    return {"ok": True, "order_id": order_id, "trade_locked_until": past}


@api.get("/admin/stats")
async def admin_stats(_: dict = Depends(get_admin_user)):
    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(hours=24)).isoformat()
    week_ago = (now - timedelta(days=7)).isoformat()

    users_total = await db.users.count_documents({})
    users_banned = await db.users.count_documents({"is_banned": True})
    users_verified = await db.users.count_documents({"is_verified": True})
    users_active_24h = await db.users.count_documents({"last_seen_at": {"$gte": day_ago}})
    users_new_7d = await db.users.count_documents({"created_at": {"$gte": week_ago}})

    orders_total = await db.orders.count_documents({})
    orders_pending = await db.orders.count_documents({"status": "pending"})
    orders_paid = await db.orders.count_documents({"status": "paid", "trade_status": {"$ne": "completed"}})
    orders_completed = await db.orders.count_documents({"trade_status": "completed"})

    listings_active = await db.listings.count_documents({"status": "active"})
    listings_sold = await db.listings.count_documents({"status": "sold"})

    # Revenue (sum amount_usd of paid + completed orders)
    revenue_pipeline = [
        {"$match": {"status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_usd"}}},
    ]
    revenue_docs = await db.orders.aggregate(revenue_pipeline).to_list(1)
    revenue_total = float(revenue_docs[0]["total"]) if revenue_docs else 0.0

    return {
        "users": {"total": users_total, "banned": users_banned,
                  "verified": users_verified, "active_24h": users_active_24h,
                  "new_7d": users_new_7d},
        "orders": {"total": orders_total, "pending": orders_pending,
                   "paid": orders_paid, "completed": orders_completed},
        "listings": {"active": listings_active, "sold": listings_sold},
        "revenue_usd": round(revenue_total, 2),
    }


@api.get("/admin/transactions")
async def admin_transactions(status: Optional[str] = None,
                              q: Optional[str] = None,
                              limit: int = 100,
                              skip: int = 0,
                              _: dict = Depends(get_admin_user)):
    filt = {}
    if status:
        filt["status"] = status
    if q:
        # Search by order id or listing skin_name (case-insensitive)
        filt["$or"] = [
            {"id": q},
            {"listing_snapshot.skin_name": {"$regex": q, "$options": "i"}},
            {"buyer_name": {"$regex": q, "$options": "i"}},
            {"seller_name": {"$regex": q, "$options": "i"}},
        ]
    total = await db.orders.count_documents(filt)
    items = await db.orders.find(filt, {"_id": 0}).sort([("created_at", -1)]).skip(skip).limit(limit).to_list(limit)
    return {"items": items, "total": total, "limit": limit, "skip": skip}


@api.get("/admin/users")
async def admin_users(q: Optional[str] = None,
                       banned: Optional[bool] = None,
                       limit: int = 100,
                       skip: int = 0,
                       _: dict = Depends(get_admin_user)):
    filt = {}
    if banned is not None:
        filt["is_banned"] = banned
    if q:
        filt["$or"] = [
            {"steam_id": {"$regex": q}},
            {"display_name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"last_ip": {"$regex": q}},
        ]
    total = await db.users.count_documents(filt)
    users = await db.users.find(filt, {"_id": 0, "verify_code": 0, "email_code": 0, "admin_password_hash": 0}) \
        .sort([("created_at", -1)]).skip(skip).limit(limit).to_list(limit)

    # Ensure all users have is_admin and is_banned fields (for backward compatibility)
    for u in users:
        if "is_admin" not in u:
            u["is_admin"] = False
        if "is_banned" not in u:
            u["is_banned"] = False
    
    # Attach order counts per user (bulk aggregation to avoid N+1)
    if users:
        ids = [u["id"] for u in users]
        pipeline = [
            {"$match": {"$or": [{"buyer_id": {"$in": ids}}, {"seller_id": {"$in": ids}}]}},
            {"$project": {"buyer_id": 1, "seller_id": 1, "status": 1, "trade_status": 1}},
        ]
        agg_orders = await db.orders.aggregate(pipeline).to_list(20000)
        counts = {uid: {"bought": 0, "sold": 0, "pending": 0, "completed": 0} for uid in ids}
        for o in agg_orders:
            if o.get("buyer_id") in counts:
                counts[o["buyer_id"]]["bought"] += 1
            if o.get("seller_id") in counts:
                counts[o["seller_id"]]["sold"] += 1
            if o.get("status") == "pending":
                for uid in (o.get("buyer_id"), o.get("seller_id")):
                    if uid in counts: counts[uid]["pending"] += 1
            if o.get("trade_status") == "completed":
                for uid in (o.get("buyer_id"), o.get("seller_id")):
                    if uid in counts: counts[uid]["completed"] += 1
        for u in users:
            u["orders_count"] = counts.get(u["id"], {})
    return {"items": users, "total": total, "limit": limit, "skip": skip}


@api.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, _: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": user_id},
                                     {"_id": 0, "verify_code": 0, "email_code": 0, "admin_password_hash": 0})
    if not user:
        raise HTTPException(404, "User not found")
    orders_bought = await db.orders.find({"buyer_id": user_id}, {"_id": 0}).sort([("created_at", -1)]).limit(50).to_list(50)
    orders_sold = await db.orders.find({"seller_id": user_id}, {"_id": 0}).sort([("created_at", -1)]).limit(50).to_list(50)
    listings = await db.listings.find({"seller_id": user_id}, {"_id": 0}).sort([("created_at", -1)]).limit(50).to_list(50)
    favs_count = await db.favorites.count_documents({"user_id": user_id})
    return {"user": user, "orders_bought": orders_bought,
            "orders_sold": orders_sold, "listings": listings,
            "favorites_count": favs_count}


@api.post("/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: str, payload: BanPayload,
                          admin: dict = Depends(get_admin_user)):
    if admin["id"] == user_id:
        raise HTTPException(400, "You cannot ban yourself")
    res = await db.users.update_one({"id": user_id}, {
        "$set": {
            "is_banned": True,
            "ban_reason": (payload.reason or "").strip() or "Terms of Service violation",
            "banned_at": datetime.now(timezone.utc).isoformat(),
            "banned_by": admin["id"],
        }
    })
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    # Also deactivate their active listings so buyers don't hit ghost items
    await db.listings.update_many({"seller_id": user_id, "status": "active"},
                                   {"$set": {"status": "banned_seller"}})
    return {"ok": True, "banned": True}


@api.post("/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: str, _: dict = Depends(get_admin_user)):
    res = await db.users.update_one({"id": user_id}, {
        "$set": {"is_banned": False},
        "$unset": {"ban_reason": "", "banned_at": "", "banned_by": ""},
    })
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    return {"ok": True, "banned": False}


@api.post("/admin/users/{user_id}/moderator")
async def admin_toggle_moderator(user_id: str, payload: ModeratorToggle,
                                   admin: dict = Depends(get_admin_user)):
    """Promote or demote a user's moderator flag (view-only trusted role)."""
    if admin["id"] == user_id and payload.is_moderator is False:
        raise HTTPException(400, "You cannot demote your own moderator role from here")
    res = await db.users.update_one({"id": user_id},
                                      {"$set": {"is_moderator": bool(payload.is_moderator)}})
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    return {"ok": True, "is_moderator": bool(payload.is_moderator)}


# --- Admin support ticket management ---

@api.get("/admin/tickets")
async def admin_tickets(status: Optional[str] = None,
                         q: Optional[str] = None,
                         limit: int = 100,
                         skip: int = 0,
                         _: dict = Depends(get_admin_user)):
    filt = {}
    if status:
        filt["status"] = status
    if q:
        filt["$or"] = [
            {"id": q},
            {"subject": {"$regex": q, "$options": "i"}},
            {"user_name": {"$regex": q, "$options": "i"}},
            {"user_steam_id": {"$regex": q}},
        ]
    total = await db.support_tickets.count_documents(filt)
    items = await db.support_tickets.find(filt, {"_id": 0, "messages": 0}) \
        .sort([("updated_at", -1)]).skip(skip).limit(limit).to_list(limit)
    return {"items": items, "total": total, "limit": limit, "skip": skip}


@api.get("/admin/tickets/{ticket_id}")
async def admin_ticket_detail(ticket_id: str, _: dict = Depends(get_admin_user)):
    doc = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    return doc


@api.post("/admin/tickets/{ticket_id}/reply")
async def admin_reply_ticket(ticket_id: str, payload: TicketMessage,
                              admin: dict = Depends(get_admin_user)):
    body = (payload.body or "").strip()
    if not body or len(body) < 2:
        raise HTTPException(400, "Message too short")
    doc = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0, "user_id": 1})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "id": str(uuid.uuid4()),
        "author_id": admin["id"],
        "author_name": admin.get("display_name") or "Admin",
        "author_role": "admin",
        "body": body[:4000],
        "created_at": now,
    }
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$push": {"messages": msg},
         "$set": {"status": "pending_reply", "updated_at": now}},
    )
    # Notify the ticket owner
    await _create_notification(
        user_id=doc["user_id"],
        ntype="ticket_reply",
        title="Support replied",
        body=body[:120] + ("…" if len(body) > 120 else ""),
        target_type="ticket",
        target_id=ticket_id,
    )
    return {"ok": True, "message": msg}


@api.post("/admin/tickets/{ticket_id}/close")
async def admin_close_ticket(ticket_id: str, _: dict = Depends(get_admin_user)):
    doc = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0, "user_id": 1, "status": 1})
    if not doc:
        raise HTTPException(404, "Ticket not found")
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": "closed", "closed_at": datetime.now(timezone.utc).isoformat(),
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await _create_notification(
        user_id=doc["user_id"],
        ntype="ticket_closed",
        title="Support ticket closed",
        body="Your support ticket was marked resolved and closed. Open a new one if you need more help.",
        target_type="ticket",
        target_id=ticket_id,
    )
    return {"ok": True}


# --- Backup & Restore ---

BACKUP_COLLECTIONS = ["users", "listings", "orders", "favorites", "notifications",
                       "payment_transactions", "market_prices", "wallet_txns",
                       "buy_orders", "offers", "support_tickets"]


@api.get("/admin/backup")
async def admin_backup(_: dict = Depends(get_admin_user)):
    """Full JSON backup of all business collections. Excludes internal Mongo _id."""
    dump = {"generated_at": datetime.now(timezone.utc).isoformat(),
            "version": 1, "collections": {}}
    for coll in BACKUP_COLLECTIONS:
        docs = await db[coll].find({}, {"_id": 0}).to_list(200000)
        dump["collections"][coll] = docs
    from fastapi.responses import Response
    import json as _json
    body = _json.dumps(dump, default=str).encode("utf-8")
    fname = f"skinmrkt-backup-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.json"
    return Response(content=body, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


from fastapi import File, UploadFile, Form

@api.post("/admin/restore")
async def admin_restore(file: UploadFile = File(...),
                         mode: str = Form("merge"),
                         _: dict = Depends(get_admin_user)):
    """Restore from a backup JSON. `mode='replace'` clears collections first;
    `mode='merge'` (default) upserts by the natural key ('id' or 'session_id'
    or 'market_hash_name'). Skips unknown collections silently."""
    if mode not in ("merge", "replace"):
        raise HTTPException(400, "mode must be 'merge' or 'replace'")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    import json as _json
    try:
        dump = _json.loads(raw)
    except Exception as e:
        raise HTTPException(400, f"Invalid JSON: {e}")
    collections = dump.get("collections") or {}
    if not isinstance(collections, dict):
        raise HTTPException(400, "Missing 'collections' object in backup")

    NATURAL_KEYS = {
        "users": "id", "listings": "id", "orders": "id",
        "favorites": "id", "notifications": "id",
        "payment_transactions": "session_id",
        "market_prices": "market_hash_name",
        "wallet_txns": "id", "buy_orders": "id", "offers": "id",
        "support_tickets": "id",
    }

    stats = {}
    for coll, docs in collections.items():
        if coll not in NATURAL_KEYS:
            continue  # skip unknown
        if not isinstance(docs, list):
            continue
        if mode == "replace":
            await db[coll].delete_many({})
        if not docs:
            stats[coll] = {"restored": 0}
            continue
        key = NATURAL_KEYS[coll]
        from pymongo import UpdateOne
        ops = []
        for d in docs:
            d.pop("_id", None)
            if key not in d:
                continue
            ops.append(UpdateOne({key: d[key]}, {"$set": d}, upsert=True))
        if ops:
            res = await db[coll].bulk_write(ops, ordered=False)
            stats[coll] = {"restored": len(ops),
                           "upserted": res.upserted_count or 0,
                           "modified": res.modified_count or 0}
        else:
            stats[coll] = {"restored": 0}
    return {"ok": True, "mode": mode, "stats": stats}


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
