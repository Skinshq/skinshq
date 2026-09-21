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

## Latest Changes (Feb 2026, this session)
- Democratized "Email notifications" toggle in Member Panel → no longer premium-gated (all users can enable email alerts)
- Fixed toggle knob overflow bug in Profile Visibility + Notifications tabs (knob was rendering 18px outside the pill track when ON — added explicit `left-0.5` + `p-0` to constrain positioning against browser default button padding)
- **Portable Ubuntu 24.04 + Apache2 deploy (removed all Emergent-only deps)**: (a) Rewrote every Stripe call site to use the official `stripe==14.4.1` Python SDK — `stripe.checkout.Session.create/retrieve` + `stripe.Webhook.construct_event` (with new required `STRIPE_WEBHOOK_SECRET` env var). Sync SDK calls wrapped in `asyncio.to_thread`. Frontend response contract (`session_id`, `checkout_url`, `order_id`) unchanged. (b) Deleted `emergentintegrations==0.2.0` and the private `litellm @ customer-assets.emergentagent.com` wheel from `backend/requirements.txt` — grepped, `litellm` was never imported. All remaining deps are stock PyPI, installable on a clean Ubuntu 24.04 venv. (c) Removed `@emergentbase/visual-edits` private tarball from `frontend/package.json` (unused devDep). (d) New `deploy/apache-skinmrkt.conf` — Apache2 vhost with HTTPS + `/api/` reverse-proxy to `127.0.0.1:8000` + SPA fallback via mod_rewrite + security headers + gzip + long-cache for `/static/*`. (e) systemd unit now targets port 8000 (matches user's spec). (f) New `deploy/UBUNTU_APACHE_DEPLOY.md` — full portable deploy guide covering system packages (Mongo 7.0 + Python 3.12 + Node 20 + Apache modules), env vars, exact install commands, Stripe webhook setup, HTTPS via certbot, update workflow, and known caveats (Steam IP rate-limiting, Resend sandbox, in-memory cache scaling, CORS restriction, Mongo auth).

- **Deployment-ready for both Ubuntu 26.04 self-host and Netlify**: (a) Cleaned up `frontend/public/index.html` — proper `SKIN.MRKT` title + OG tags + favicon paths use `%PUBLIC_URL%`, removed PostHog + emergent.sh tracking scripts (production-friendly). (b) `netlify.toml` at repo root with SPA fallback redirect, hashed-static long-cache headers, security headers, `CI=false` + `NODE_VERSION=20` so builds pass. (c) `frontend/public/_redirects` as backup SPA fallback. (d) `/app/deploy/nginx-skinmrkt.conf` — full Ubuntu Nginx config for `/var/www/skinmrkt`: HTTP→HTTPS redirect, `/api/*` reverse-proxy to `127.0.0.1:8001`, SPA fallback via `try_files $uri $uri/ /index.html`, HSTS + X-Frame-Options + gzip + CRA static-bundle long-cache. (e) `/app/deploy/skinmrkt-backend.service` — hardened systemd unit for the FastAPI backend under `www-data`. (f) `/app/deploy/README.md` — complete step-by-step deploy guide covering both options including certbot HTTPS and update workflow.

- **Trade delivery UX + Trade URL ownership check + state rename**: (a) Backend now validates a submitted Trade URL by parsing `partner=` and confirming it equals `SteamID64 - 76561197960265728` — users can only save their own trade URL, blocking impersonation/scam listings. Member Panel adds a live client-side hint ("✓ matches your account" vs "✕ belongs to a different account"). (b) State `TRADE_OFFER_SENT` renamed to `TRADE_OFFER_REPORTED` throughout to reflect that the seller is only *reporting* the send, not proving it; the alias is retained in `order_states.py` so historical orders still resolve. (c) Seller order page redesigned with a **prominent blue "Open Steam & Send Trade to [Buyer]" CTA** that opens the buyer's Steam trade URL in a new tab, plus a `steam://openurl/…` deep-link for desktop clients, buyer identity + Steam profile link, and an exact-item card. The "I have sent the trade offer" button is now visually separated below and correctly does NOT mark COMPLETED — it just flips state to `TRADE_OFFER_REPORTED` so inventory verification can run. (d) New global `PendingSalesBanner` polls `/my/orders` every 30s — anywhere on the site, the seller sees a yellow "Action needed: You sold X — send the Steam trade now" banner until they act.

- **Full P2P trade flow LIVE (CSFloat-style, no fake completions)**: End-to-end state machine backed by `order_states.py` + append-only `state_history` audit log on every order. Payment is intentionally skipped this pass (Stripe Connect payout is deferred).
  - Buyer clicks Buy → `POST /api/orders/reserve` → atomically flips listing to `reserved` + creates order in `AWAITING_SELLER_TRADE` + notifies seller (in-app + email) with the buyer's Steam trade URL. Requires buyer's `trade_url` to be set. Reserved listings vanish from public marketplace (filter now also excludes `is_catalog`).
  - Seller opens `/order/:id` → sees buyer trade URL (click-to-open + copy), the exact item to send (name + image + asset_id), and a 24h deadline. Clicks "I sent the trade offer" → snapshots seller's current inventory count of the (`class_id`, `instance_id`) pair as `seller_baseline_count` (used later to detect the decrement) → state → `TRADE_OFFER_SENT` + buyer notified.
  - Buyer accepts the trade in Steam (out-of-band) → clicks "I accepted the trade — verify" → backend runs `trade_verification.verify_trade` which force-refreshes both Steam inventories and checks (a) buyer now has ≥1 item matching `(class_id, instance_id)`, and (b) seller's count dropped below baseline. Verified → `COMPLETED` + seller wallet credited (in-app balance) + 7-day CS2 trade protection countdown + emails to both. Not verified → `VERIFICATION_PENDING` (up to 6 retries, then auto-`MANUAL_REVIEW`).
  - Full state machine: `AWAITING_SELLER_TRADE → TRADE_OFFER_SENT → AWAITING_BUYER_ACCEPTANCE → TRADE_VERIFICATION → COMPLETED`; failure paths `CANCELLED` (buyer cancels while awaiting seller), `SELLER_TIMEOUT` (lazy sweep on `/my/orders` reads), `VERIFICATION_PENDING`, `MANUAL_REVIEW`, `DISPUTED`, `REFUND_PENDING`. Every transition validates via `OS.can_transition` and appends to `state_history`.
  - Verification identity: matches by (`class_id`, `instance_id`) — the stable pair — because Steam re-assigns `asset_id` after every trade. `seller_baseline_count` handles the duplicate-item edge case.
  - New backend files: `/app/backend/order_states.py`, `/app/backend/trade_verification.py`. New Mongo collection: `trade_verification_audit` (append-only). Retry-safe: force-refresh option on `fetch_cs2_inventory` bypasses the 10-min cache during verification.
  - New frontend page `/order/:orderId` (OrderDetailPage.jsx) with role-aware timeline, seller trade-instruction panel, buyer accept/dispute panel, retry-verification panel, completed panel with wallet-credit note + 7-day CS2 trade-protection countdown, expandable state-history audit view. Marketplace + Skin detail Buy buttons now route through `/orders/reserve` instead of Stripe checkout.
  - Verified live via curl: full happy path + double-reserve rejection + reserved-listing hidden from public + cancel-window enforcement + auto-escalation to MANUAL_REVIEW after 6 failed retries. Frontend screenshot of MANUAL_REVIEW state renders correctly with detail from audit log.

- **Server-authoritative P2P listing flow (CSFloat-style, step 1 of the trade redesign)**: Sellers can no longer inject fake metadata via the listing API. `POST /api/marketplace/listings` now takes only `{ asset_id, price_usd, currency }` — the server fetches the seller's live Steam CS2 inventory, locates the exact asset, validates tradability, and snapshots authoritative identity: `asset_id`, `class_id`, `instance_id`, `market_hash_name`, `name`, `weapon`, `type`, `rarity`, `wear`, `image` (Steam CDN), `icon_url`, `inspect_link`, `stickers`, `tradable`, `currency`. Placeholders retained for `float_value` and `paint_seed` pending a CS inspect-bot. DB-level partial-unique index `(seller_id, asset_id) where status=active and !is_catalog` prevents double-listing. Only `auth_method=steam_openid` accounts can list. Verified: (a) owning-list succeeds, (b) double-list rejected 409, (c) non-owned asset rejected 404, (d) fake `skin_name`/`rarity`/`image` in payload are silently overwritten by the real Steam values.

- **Fixed "Read-only mode" bug on Steam OpenID login**: Existing user records that were previously created via SteamID64-manual entry weren't being upgraded when the same account then completed a proper Steam OpenID sign-in. Callback now always sets `auth_method="steam_openid"` and `is_verified=True` on OpenID success (both new and existing users).
- **Real Steam inventory now loading (was showing demo)**: Steam's inventory endpoint was 429'ing our cloud-IP requests when using a Chrome UA. Discovered Steam's inventory bot filter actually accepts a lightweight curl-style UA — switched to `User-Agent: curl/8.0.1` + `Accept: */*`. Added a 10-min per-steam_id in-memory cache to further reduce load. Verified: 219 real skins now render for a public inventory.

- **CS2-style 7-day trade lock on all purchases**: Every paid order now gets `trade_locked_until = paid_at + 7d`. Buyer sees the item under **Your Inventory → Recently purchased** with a lock overlay + live "🔒 LOCKED · Xd Yh Zm" countdown, plus a "tradable {date}" hint. Orders page shows the same badge. When the timer hits zero, badge flips to green "✓ Tradable". Admin can skip the wait via `POST /api/admin/orders/{id}/force-unlock` (tested end-to-end).

- **P2P Transaction Emails via Resend LIVE**: Two flows wired to `POST /api/marketplace/listings` (seller gets "Your listing is live") and `POST /api/orders/{id}/confirm-trade` (buyer + seller each get "Trade completed"). Gated by user's `email_notifications` pref (now `True` by default for all users). Uses `asyncio.create_task` for fire-and-forget non-blocking sends. Sandbox sender `onboarding@resend.dev` — deliverable only to email addresses verified on the Resend account until a custom domain is added.


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

## Moderator Access + Support Tickets (Aug 2026)
- New `is_moderator` field on users. New `get_moderator_user` dep allows
  admin OR moderator (read-only).
- New `support_tickets` collection with embedded messages array.
- **User endpoints** (support): `POST/GET /support/tickets`,
  `GET /support/tickets/{id}`, `POST /support/tickets/{id}/messages`.
  Users can open tickets, add follow-ups, view the full thread.
- **Moderator endpoints (VIEW-ONLY)**: `GET /mod/stats`,
  `GET /mod/transactions`, `GET /mod/tickets`, `GET /mod/tickets/{id}`.
- **Admin write endpoints**: `GET/POST /admin/tickets`,
  `POST /admin/tickets/{id}/reply`, `POST /admin/tickets/{id}/close`,
  `POST /admin/users/{id}/moderator` (promote/demote).
- Admin reply auto-notifies the ticket owner (`ticket_reply`
  notification); closing sends `ticket_closed`.
- New pages:
  - `/support` — user help centre, open/list/thread view for own tickets.
  - `/mod` — Moderator panel with Trades + Support Tickets tabs,
    both read-only. Header includes live-trades and open-tickets counters.
    Ticket detail page displays "🔒 Moderators have read-only access.
    Only admins can reply or close." disclosure.
- Admin User detail dialog now has a "Make moderator / Remove moderator"
  toggle button.
- Navbar: "Support" link for logged-in users, "Moderator panel" link for
  mods/admins, "Mod" badge next to display name when user is moderator
  (Admin badge takes precedence when both).
- Backup + restore extended to include `support_tickets` collection.

## Member Panel (Aug 2026)
- New `/me` page with 6 tabs:
  - **Profile** — Steam Trade URL (regex-validated), bio (280 chars),
    5 social links (Twitter, Discord, Instagram, YouTube, Twitch),
    trader stats grid, badges list.
  - **Wallet** — big balance card, green Deposit / red Withdraw buttons,
    ledger history table. **MOCKED** — real Stripe wallet top-ups deferred.
  - **Trades** — my purchases + my sales tables.
  - **Buy Orders** — post-a-buy-order form (skin, max price, optional wear,
    note). Requires wallet balance to cover max price. Shows live-listing
    match count per row.
  - **Offers** — sent / received tabs. Sellers can accept (drops listing
    price to offer price) or reject.
  - **Notifications** — 8 toggle preferences; 3 gated behind `is_premium`
    with visible Premium badges + lock disclosure.
- **Badge system** — 8 auto-computed badges from user stats:
  First Trade, Regular (10+), Veteran Trader (50+), Whale ($1k+),
  Big Spender ($5k+), Prolific Seller (10+ sold), Verified, Veteran (30d+),
  plus platform badges Premium and Admin. Tiered visual styling
  (normal/rare/epic/platform).
- **New collections**: `wallet_txns`, `buy_orders`, `offers` with proper indexes.
- **Endpoints** (all under /api):
  - `GET/PATCH /me/profile`, `PATCH /me/notifications`
  - `GET /me/wallet`, `POST /me/wallet/deposit|withdraw`
  - `GET /me/orders`
  - `POST/GET /buy-orders`, `DELETE /buy-orders/{id}`
  - `POST /offers`, `GET /offers?direction=received|sent`,
    `POST /offers/{id}/accept|reject`
- **Buy-order matching**: on new listing creation, backend fans out
  notifications to every open buy order whose criteria match
  (skin_name + price ≤ max_price + wear filter). Full auto-execute
  (pre-authorized Stripe charge) is deferred.
- **Offer flow**: creating an offer notifies the seller. Accepting drops
  the listing price to the offer amount, auto-rejects any competing pending
  offers, and notifies the buyer to complete a normal checkout.
- Trade URL validated to standard steamcommunity `/tradeoffer/new/?partner=…&token=…` shape.
- Premium prefs are 403-guarded server-side so users can't force them on.

## Admin Login Window (Aug 2026)
- Password-based admin login endpoint `POST /api/admin/login` (email +
  bcrypt-hashed password on the user doc) returns the same JWT shape as
  Steam login. Rejects banned users, non-admins, and wrong passwords.
- Bootstrap seed on startup: creates an admin user for
  `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` env vars if none
  exists yet (default placeholder: admin@skinmrkt.com / admin1234).
- New frontend page `/admin/login` — email + password form. `/admin`
  redirects here when the visitor is not logged in as admin.
- `admin_password_hash` field is stripped from every admin panel
  response so it never leaks over the wire.

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
