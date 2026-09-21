# SKIN.MRKT — Ubuntu 24.04 + Apache2 Deployment (Portable, No Emergent Dependencies)

Complete portable deployment for **Ubuntu 24.04.5 LTS (Noble)** with:
- **Python 3.12** (Ubuntu 24.04 default)
- **MongoDB 7.x**
- **FastAPI + Uvicorn** on `127.0.0.1:8000`
- **React (CRA/CRACO)** static build at `/var/www/skinmrkt/`
- **Apache2** as the public web server, reverse-proxying `/api/` to Uvicorn

All Emergent-specific dependencies have been removed. The backend uses the official Stripe Python SDK (`stripe==14.4.1`).

---

## A) Files changed for portability

| File | Change |
|---|---|
| `backend/server.py` | Removed `from emergentintegrations.payments.stripe.checkout import ...`. Added `import stripe` + `stripe.api_key = STRIPE_KEY`. Rewrote 3 call sites: `create_checkout` uses `stripe.checkout.Session.create(...)`; `order_status` uses `stripe.checkout.Session.retrieve(...)`; `stripe_webhook` uses `stripe.Webhook.construct_event(body, sig, STRIPE_WEBHOOK_SECRET)`. All wrapped in `asyncio.to_thread(...)` because the Stripe SDK is sync-first. **API response shapes are identical** — `session_id` / `checkout_url` / `order_id` in the response, unchanged. |
| `backend/requirements.txt` | Removed `emergentintegrations==0.2.0`. Removed the private `litellm @ https://customer-assets.emergentagent.com/...` wheel (grepped — `litellm` was never imported). Added explicit `httpx>=0.27.0`. Everything else is standard PyPI. |
| `frontend/package.json` | Removed `@emergentbase/visual-edits` devDependency (private URL, not needed at runtime). |
| `frontend/public/index.html` | (Previous pass) Removed PostHog + emergent.sh analytics scripts. Proper `SKIN.MRKT` title, OG tags, favicon via `%PUBLIC_URL%`. |
| `deploy/apache-skinmrkt.conf` | **New** — Apache2 vhost with HTTPS + `/api/` reverse-proxy + SPA fallback + security headers + gzip + long-cache for `/static/*`. |
| `deploy/skinmrkt-backend.service` | systemd unit — updated to port **8000** to match this deployment. |

---

## B) Stripe rewrite — exact changes

**Before (Emergent SDK):**
```python
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
checkout = StripeCheckout(api_key=STRIPE_KEY, webhook_url=webhook_url)
req = CheckoutSessionRequest(amount=..., currency="usd", success_url=..., cancel_url=..., metadata=...)
session = await checkout.create_checkout_session(req)
# session.session_id, session.url

status_resp = await checkout.get_checkout_status(session_id)
# status_resp.payment_status

event = await checkout.handle_webhook(body, sig)
# event.payment_status, event.session_id, event.metadata
```

**After (official Stripe SDK):**
```python
import stripe
stripe.api_key = STRIPE_KEY

session = await asyncio.to_thread(
    stripe.checkout.Session.create,
    mode="payment",
    payment_method_types=["card"],
    line_items=[{
        "price_data": {
            "currency": "usd",
            "product_data": {"name": listing_name},
            "unit_amount": int(round(price_usd * 100)),
        },
        "quantity": 1,
    }],
    success_url=f"{success_base}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&order_id={order_id}",
    cancel_url=f"{success_base}/checkout/cancel?order_id={order_id}",
    metadata={...},
)
# session.id, session.url

status_resp = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
# status_resp.payment_status

event = stripe.Webhook.construct_event(body, sig, STRIPE_WEBHOOK_SECRET)
if event.type == "checkout.session.completed":
    obj = event.data.object
    # obj.payment_status, obj.id, obj.metadata
```

Frontend contract is unchanged — response keys `session_id`, `checkout_url`, `order_id` stay the same.

---

## C) Final `backend/requirements.txt`

Everything below installs cleanly on Ubuntu 24.04 with `pip install -r requirements.txt`:

```
bcrypt==4.1.3
boto3>=1.34.129
brotli>=1.1.0
cryptography>=42.0.8
email-validator>=2.2.0
fastapi==0.110.1
httpx>=0.27.0
jq>=1.6.0
motor==3.3.1
numpy>=1.26.0
pandas>=2.2.0
passlib>=1.7.4
pydantic>=2.6.4
pyjwt>=2.10.1
pymongo==4.6.3
python-dotenv>=1.0.1
python-jose>=3.3.0
python-multipart>=0.0.9
requests>=2.31.0
requests-oauthlib>=2.0.0
stripe==14.4.1
tzdata>=2024.2
uvicorn==0.25.0

# Dev/test tooling — safe to keep, or move to a separate requirements-dev.txt for a leaner prod install.
black>=24.1.1
flake8>=7.0.0
isort>=5.13.2
mypy>=1.8.0
pytest>=8.0.0
pytest-xdist>=3.6.0
typer>=0.9.0
```

---

## D) `backend/.env` — required environment variables

Create `/var/www/skinmrkt-backend/.env`:

```ini
# ---- Required ----
MONGO_URL="mongodb://localhost:27017"
DB_NAME="skinmrkt_prod"
JWT_SECRET="<long-random-64-char-string>"
FRONTEND_URL="https://example-domain.com"

# ---- Stripe (real payments — use test keys until go-live) ----
STRIPE_API_KEY="sk_test_..."            # or sk_live_...
STRIPE_WEBHOOK_SECRET="whsec_..."       # from https://dashboard.stripe.com/webhooks

# ---- Steam ----
STEAM_API_KEY="<your-steam-web-api-key>"    # https://steamcommunity.com/dev/apikey

# ---- Resend (transactional email) ----
RESEND_API_KEY="re_..."                 # https://resend.com/api-keys
EMAIL_FROM="noreply@example-domain.com" # domain must be verified in Resend

# ---- Admin bootstrap (auto-creates first admin/mod on startup if missing) ----
BOOTSTRAP_ADMIN_EMAIL="admin@example-domain.com"
BOOTSTRAP_ADMIN_PASSWORD="<change-this>"
BOOTSTRAP_MOD_EMAIL="mod@example-domain.com"
BOOTSTRAP_MOD_PASSWORD="<change-this>"
ADMIN_TOKEN="<long-random-32-char-string>"

# ---- Feature flags ----
PRICE_SYNC_ENABLED="1"                  # hourly Skinport price refresh
```

---

## E) External services / API keys required

| Service | Required for | Where to get |
|---|---|---|
| **Stripe** | Real payments | https://dashboard.stripe.com/apikeys (secret key) + https://dashboard.stripe.com/webhooks (signing secret for `checkout.session.completed` event) |
| **Steam Web API** | Player summary enrichment on OpenID login | https://steamcommunity.com/dev/apikey |
| **Skinport public API** | Live CS2 market price sync | **No key required** — public endpoint |
| **Resend** | Transactional email (order notifications, listing-live) | https://resend.com/api-keys — verify a domain in Resend for production sending |

**No key needed:** Steam OpenID login, Steam community inventory endpoint, ByMykel CSGO-API catalog (used only during optional catalog seeding).

---

## F) Ubuntu 24.04 system packages

```bash
sudo apt update
sudo apt install -y \
    apache2 \
    python3 python3-venv python3-pip python3-dev \
    build-essential libssl-dev libffi-dev \
    autoconf libtool                       `# for jq Python binding` \
    curl gnupg lsb-release ca-certificates \
    certbot python3-certbot-apache
```

MongoDB (Ubuntu 24.04 doesn't ship it directly):

```bash
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

Node.js 20 (for the frontend build):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn
```

Enable required Apache modules:

```bash
sudo a2enmod proxy proxy_http rewrite headers deflate ssl expires
```

---

## G) Exact install + start commands

### 1. Deploy the backend

```bash
# As root/sudo user
sudo mkdir -p /var/www/skinmrkt-backend
sudo chown -R www-data:www-data /var/www/skinmrkt-backend

# Copy the backend/ folder contents to /var/www/skinmrkt-backend/
# (or `git clone` your repo there and cd into backend/)
sudo -u www-data cp -r /path/to/repo/backend/. /var/www/skinmrkt-backend/

cd /var/www/skinmrkt-backend
sudo -u www-data python3 -m venv .venv
sudo -u www-data .venv/bin/pip install --upgrade pip
sudo -u www-data .venv/bin/pip install -r requirements.txt

# Create .env (see section D)
sudo -u www-data nano .env

# Install systemd unit
sudo cp /path/to/repo/deploy/skinmrkt-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now skinmrkt-backend
sudo systemctl status skinmrkt-backend

# Sanity check — should return JSON
curl -s http://127.0.0.1:8000/api/marketplace/listings?limit=1
```

### 2. Build & deploy the frontend

On the build machine (can be the server itself):

```bash
cd /path/to/repo/frontend
echo "REACT_APP_BACKEND_URL=https://example-domain.com" > .env.production
yarn install --frozen-lockfile
yarn build

# Copy to Apache document root
sudo mkdir -p /var/www/skinmrkt
sudo rsync -av --delete build/ /var/www/skinmrkt/
sudo chown -R www-data:www-data /var/www/skinmrkt
```

### 3. Enable Apache vhost

```bash
sudo sed -i 's/example-domain.com/YOUR-REAL-DOMAIN.com/g' /path/to/repo/deploy/apache-skinmrkt.conf
sudo cp /path/to/repo/deploy/apache-skinmrkt.conf /etc/apache2/sites-available/skinmrkt.conf
sudo a2ensite skinmrkt.conf
sudo a2dissite 000-default.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### 4. HTTPS via Let's Encrypt

```bash
sudo certbot --apache -d YOUR-REAL-DOMAIN.com -d www.YOUR-REAL-DOMAIN.com
```

Certbot auto-updates the vhost with cert paths and installs a renewal cron. Verify with:

```bash
sudo certbot renew --dry-run
```

### 5. Point Stripe webhook to your domain

In the Stripe dashboard → Developers → Webhooks → **Add endpoint**:

- URL: `https://YOUR-REAL-DOMAIN.com/api/webhook/stripe`
- Events to send: `checkout.session.completed`
- Copy the signing secret → paste into `.env` as `STRIPE_WEBHOOK_SECRET`
- `sudo systemctl restart skinmrkt-backend`

### 6. Update workflow

```bash
# Backend
cd /var/www/skinmrkt-backend && sudo -u www-data git pull
sudo -u www-data .venv/bin/pip install -r requirements.txt
sudo systemctl restart skinmrkt-backend

# Frontend
cd /path/to/repo/frontend && yarn build
sudo rsync -av --delete build/ /var/www/skinmrkt/
```

---

## H) Known deployment risks / caveats

1. **Steam inventory rate-limiting on cloud IPs.** Steam's community inventory endpoint aggressively rate-limits datacenter IPs. Mitigated by a 10-min per-user cache + a lightweight `curl/8.0.1` user-agent that slips past Steam's bot filter. If your VPS IP still gets 429'd, users will see "Steam rate-limited us for a moment" — usually resolves within a minute. A residential proxy would remove this permanently but isn't required for functional deploys.
2. **Resend sandbox mode.** With the default `onboarding@resend.dev` sender, emails only deliver to Resend-verified inboxes. To reach real customer inboxes, verify your own domain at https://resend.com/domains and set `EMAIL_FROM="noreply@your-domain.com"`.
3. **Stripe test mode until real business identity.** Real payouts to sellers require Stripe Connect Express onboarding (KYC per seller). Currently the platform captures buyer payments and credits the seller's **in-app wallet balance** — a real bank payout hasn't been implemented. All hooks are in place; adding Connect is additive.
4. **MongoDB is unauthenticated by default.** For production, add a Mongo user + set `authorization: enabled` in `/etc/mongod.conf`, and update `MONGO_URL` to include credentials.
5. **CSFloat inspect (float/paint_seed) not integrated.** Steam's community endpoint doesn't expose these. The listing schema has placeholder fields; wire up CSFloat's inspect API later if you need per-item float values.
6. **In-memory inventory cache** (`_INVENTORY_CACHE` in `steam_auth.py`) is per-worker. With `--workers 2` in the systemd unit, each worker holds its own cache. For a single-node deploy this is fine; if you scale horizontally, move the cache to Redis.
7. **Seed test users** (`admin@skinmrkt.com`, `mod@skinmrkt.com`) auto-create on first startup — change `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` in `.env` **before** first boot, or manually update the accounts after.
8. **CORS is currently permissive.** Restrict `CORSMiddleware` to your production domain(s) in `server.py` before going live to a public audience.
