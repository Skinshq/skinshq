# CS2 Skins Marketplace - PRD

## Original Problem Statement
User wants a marketplace to buy/sell CS2 skins where users login via Steam ID, see their CS2 inventory, browse skins at market prices in USD with multi-currency conversion, and pay via a working payment window.

## User Choices
1. Real Steam OpenID auth (user provides Steam Web API key later)
2. Stripe payments (using sk_test_emergent test key)
3. Free FX API (open.er-api.com)
4. Marketplace = user listings + seeded catalog
5. Mocked escrow/trade flow

## Architecture
- Backend: FastAPI + MongoDB + Motor async driver
- Frontend: React + Tailwind + Shadcn/UI + react-icons
- Payment: Stripe Checkout Sessions (test mode)
- Auth: Steam OpenID 2.0 + JWT tokens

## Implemented (Feb 2026)
- Steam OpenID login flow (real, needs user's Steam API key optional for player summary)
- CS2 inventory fetch from public Steam community endpoint + demo fallback
- Marketplace with filters (rarity, weapon type, wear, price, search) + sort
- Seeded catalog of 24 popular CS2 skins → ~39 listings (varied wear/float)
- User skin listing flow from inventory
- Stripe checkout session for buying
- Order tracking with progression (pending → paid → trade_sent → completed)
- Mocked escrow: "Confirm trade" button releases funds
- Currency conversion: 15+ currencies with live rates
- Landing page, Marketplace, Inventory, Orders, Checkout success/cancel pages

## Live Steam Market Prices (Jul 2026)
- New `price_sync.py` walks the public Steam Community Market
  (`/market/search/render/?appid=730&norender=1`) — no API key needed
- Upserts prices keyed by `market_hash_name` into `market_prices` collection
- Skin cards + detail page prefer live `market_price_usd` over rarity-band midpoint,
  and show "Steam Market · Xh ago · N listed" freshness badge
- Detail page shows per-wear price breakdown when available
- `POST /api/skins/refresh-prices` (admin-only, `X-Admin-Token` header) triggers manual sync
  — supports `?full=true` to walk the entire ~34k catalog
- `GET /api/skins/price-sync-status` public endpoint for progress polling
- Background asyncio scheduler refreshes prices every 6h, defaults to
  top-6000 most-listed items per run (fast + rate-limit friendly)

## Admin Panel (Aug 2026)
- New `is_admin`, `is_banned`, `ban_reason`, `banned_at`, `banned_by`,
  `last_ip`, `ip_history[]`, `last_seen_at` fields on users. Captured
  automatically on every authenticated request via `_client_ip()`
  (X-Forwarded-For aware) and on login endpoints.
- Ban enforcement: `get_current_user` returns 403 for banned users;
  `login_with_steamid` blocks banned users at login; ban also flips
  seller's active listings → `banned_seller` status.
- New `get_admin_user` FastAPI dep gates all admin endpoints.
- Bootstrap: `POST /api/admin/promote?steam_id=…` uses the `ADMIN_TOKEN`
  env once to elevate a Steam account; from then on the admin uses their
  own JWT.
- Admin endpoints:
  - `GET /admin/stats` — dashboard KPIs (users total/banned/verified/active/new, orders total/pending/paid/completed, listings active/sold, revenue_usd)
  - `GET /admin/transactions` — paginated orders with status + search filters
  - `GET /admin/users` — paginated users with server-side aggregated
    order counts (bought/sold/pending/completed) + IP + email
  - `GET /admin/users/{id}` — full user detail with orders + listings + fav count
  - `POST /admin/users/{id}/ban` — body `{reason?}`, prevents self-ban
  - `POST /admin/users/{id}/unban`
  - `GET /admin/backup` — full JSON dump (users, listings, orders,
    favorites, notifications, payment_transactions, market_prices) as
    downloadable file
  - `POST /admin/restore` — multipart upload, `mode=merge|replace`,
    idempotent upserts on natural keys
- Frontend `/admin` page with 4 tabs (Dashboard, Transactions, Users, Backup),
  user detail dialog with ban/unban actions, live download+restore UI.
- Navbar shows an "ADMIN" badge + "Admin panel" menu entry only for admin users.

## Favourites & Notifications (Aug 2026)
- Users can heart any master skin OR any specific listing from the Marketplace and Skin Detail pages.
- Data model:
  - `favorites` collection: `{id, user_id, target_type: "listing"|"skin", target_id, snapshot, created_at}` with unique index on (user_id, target_type, target_id).
  - `notifications` collection: `{id, user_id, type, title, body, target_type, target_id, snapshot, read, created_at}` with indexes on (user_id, created_at desc) + (user_id, read).
- Endpoints:
  - `POST/DELETE/GET /api/favorites` + `GET /api/favorites/check` (bulk heart-state lookup for UI).
  - `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`.
- Triggers:
  - **Listing sold** → notify everyone who favorited that listing (fires from both Stripe webhook AND order-status sync path, skipping the buyer themselves).
  - **New listing created** → notify everyone who favorited the underlying master skin (skipping the seller themselves).
- UI:
  - `HeartButton` component on every marketplace card + skin detail main panel + each seller-listing row (`stopPropagation` so clicking heart inside a wrapping `<Link>` doesn't navigate).
  - `NotificationBell` in navbar with unread badge, opens dropdown, click-to-mark-read + "Mark all read" bulk action.
  - Dedicated `/favorites` page listing all liked items with status pill (Available / Sold / Unavailable), trash-to-remove, live current price.
- `FavoritesContext` provides in-memory heart-state Set + unread count, poll refreshes every 45s while logged in.

## Category Sidebar + Containers (Jul 2026)
- Left-side popup/sidebar (`CategorySidebar.jsx`) with three groups:
  Weapons, Melee & Gear, Containers. Persistent column on desktop,
  slide-out drawer on mobile.
- Each category shows a react-icons/gi icon + item count. Click filters
  the marketplace to that type.
- Extended `skins_catalog.py` to fetch `crates.json` from ByMykel too —
  480 containers now in the master catalog (42 weapon Cases, 99 Sticker
  Capsules, 139 Autograph Capsules, 13 Music Kit Boxes, 7 Patch Capsules,
  4 Pins Capsules, 3 Graffiti Boxes, 150 Souvenir Packages, 14 Souvenir
  Highlights).
- Fixed weapon-type detection: snipers now split from rifles by weapon
  name (AWP/SSG 08/G3SG1/SCAR-20), shotguns split from machineguns
  (Nova/XM1014/Sawed-Off/MAG-7 vs M249/Negev), and gloves no longer
  mis-classified as knives (the ★-prefix heuristic used to hit both).
- New endpoint `GET /api/skins/categories` returns the sidebar structure
  with per-type counts.
- `GET /api/skins/all` now accepts an additional `category` param
  ("weapon" or "container").

## Live Skinport Prices (Jul 2026)
- New `skinport_sync.py` uses Skinport's free public API
  (`https://api.skinport.com/v1/items?app_id=730&currency=USD`), no key needed
- Single HTTP call returns all ~24,800 CS2 items with suggested_price,
  min/max/mean/median prices, and quantity — full sync in ~2 seconds vs.
  6+ minutes for the old Steam Market paginator (which is retained as
  `price_sync.py` fallback but no longer scheduled)
- Requires the `brotli` Python package for httpx to decode responses
- Same `market_prices` collection schema so all existing endpoints and UI
  work with no changes; UI badge updated from "Steam Market" to "Skinport"
- Background scheduler still refreshes every 6h
- Admin: `POST /api/skins/refresh-prices` with `X-Admin-Token` triggers manual sync

## Real per-item Float Values (deferred)
- Getting a specific item's float value requires connecting to Valve's
  CS2 Game Coordinator, which needs a dedicated Steam account with CS2
  owned, phone-verified, and a persistent Node.js daemon (node-globaloffensive).
- Not feasible in this Kubernetes pod (no long-running background workers).
- Path forward: build a standalone `steam-inspect-bot` Node.js service the
  user deploys separately, expose an HTTP endpoint, backend calls it.
- Alternative for MVP: keep float RANGE bar (min_float..max_float per skin)
  which is what CS2 fundamentally allows to be known without an inspection.

## Float Value Display (Jul 2026)
- Reusable `FloatBar` component with 5 color-coded wear-tier segments
  (FN green → BS red), a "dim" mask outside the skin's min_float/max_float
  range, and an optional value marker for a specific listing's float
- Market cards now show a mini float bar + range labels
- Skin detail page has a full-width labelled float range panel + a mini
  bar with value marker in each live listing row

## Endpoints
- GET /api/auth/steam/login, /api/auth/steam/callback, /api/auth/me
- GET /api/inventory/cs2
- GET /api/marketplace/listings (filters), GET /:id, POST, DELETE /:id
- GET /api/my/listings, GET /api/my/orders
- POST /api/checkout/{listing_id}, GET /api/orders/{id}/status, POST /api/orders/{id}/confirm-trade
- GET /api/fx/rates

## P1 Backlog
- Real Steam bot trade offer integration (currently mocked)
- Stripe Connect for direct seller payouts
- Item price history charts
- Watchlist / price alerts
- User ratings & reviews
- Withdrawal to bank via Stripe

## P2 Backlog
- Skin float value verification
- Sticker & pattern detection
- Trade holds / cooldown compliance with Steam
- Multi-language i18n
