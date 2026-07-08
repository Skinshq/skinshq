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
