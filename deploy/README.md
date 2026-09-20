# SKIN.MRKT — Production deployment

This directory contains everything needed to deploy the site on **Ubuntu 26.04 (Resolute)** with Nginx at `/var/www/`, or on **Netlify** for the frontend-only side. In both cases the backend (FastAPI + MongoDB) is hosted separately.

---

## Option A — Ubuntu 26.04 + Nginx (self-hosted, full stack)

### 1. Prerequisites on the server

```bash
sudo apt update
sudo apt install -y nginx python3.12 python3.12-venv python3-pip \
                    mongodb-org nodejs npm certbot python3-certbot-nginx
sudo npm install -g yarn
```

### 2. Deploy the FastAPI backend

```bash
sudo mkdir -p /var/www/skinmrkt-backend
sudo chown -R www-data:www-data /var/www/skinmrkt-backend
sudo -u www-data git clone <your-repo> /var/www/skinmrkt-backend
cd /var/www/skinmrkt-backend
sudo -u www-data python3.12 -m venv .venv
sudo -u www-data .venv/bin/pip install -r backend/requirements.txt
```

Create `/var/www/skinmrkt-backend/.env` with production values (Mongo URL, Resend key, etc.):

```
MONGO_URL=mongodb://localhost:27017
DB_NAME=skinmrkt_prod
CORS_ORIGINS=https://example-domain.com
STRIPE_API_KEY=sk_test_or_live_key
STEAM_API_KEY=your-steam-web-api-key
JWT_SECRET=change-me-to-a-long-random-string
FRONTEND_URL=https://example-domain.com
RESEND_API_KEY=re_your_key
EMAIL_FROM=noreply@example-domain.com
ADMIN_TOKEN=another-long-random-string
PRICE_SYNC_ENABLED=1
```

Install the systemd unit:

```bash
sudo cp deploy/skinmrkt-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now skinmrkt-backend
sudo systemctl status skinmrkt-backend
```

### 3. Build & deploy the React frontend

On your **build machine** (or the server itself):

```bash
cd frontend
# CRA bakes REACT_APP_* into the JS bundle at build time
echo "REACT_APP_BACKEND_URL=https://example-domain.com" > .env.production
yarn install --frozen-lockfile
yarn build
```

Copy the build to `/var/www/skinmrkt`:

```bash
sudo mkdir -p /var/www/skinmrkt
sudo rsync -av --delete frontend/build/ /var/www/skinmrkt/
sudo chown -R www-data:www-data /var/www/skinmrkt
```

### 4. Enable the Nginx site

```bash
# Replace example-domain.com in the config first!
sudo sed -i 's/example-domain.com/your-real-domain.com/g' deploy/nginx-skinmrkt.conf
sudo cp deploy/nginx-skinmrkt.conf /etc/nginx/sites-available/skinmrkt.conf
sudo ln -s /etc/nginx/sites-available/skinmrkt.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Get HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d your-real-domain.com -d www.your-real-domain.com
# Certbot auto-updates the SSL cert paths in the site config and sets up renewal.
```

### 6. Deploy updates later

```bash
# frontend
cd frontend && yarn build && sudo rsync -av --delete build/ /var/www/skinmrkt/

# backend
cd /var/www/skinmrkt-backend && sudo -u www-data git pull
sudo -u www-data .venv/bin/pip install -r backend/requirements.txt
sudo systemctl restart skinmrkt-backend
```

---

## Option B — Netlify (frontend only, backend hosted elsewhere)

The `netlify.toml` at the repo root is already configured.

### 1. Push the repo to GitHub / GitLab

### 2. Import into Netlify
- New site → Import from Git → pick the repo
- Netlify will pick up `netlify.toml` automatically

### 3. Set the backend URL environment variable
Site settings → Environment variables → add:

```
REACT_APP_BACKEND_URL = https://api.your-domain.com
```

(CRA reads `REACT_APP_*` at build time — after adding, trigger a redeploy.)

### 4. First deploy runs automatically
Every push to the connected branch triggers a rebuild + redeploy.

**Note:** Netlify only hosts the static frontend. Your FastAPI backend still needs a host (Fly.io, Railway, DigitalOcean droplet, AWS ECS, or the Ubuntu server from Option A). Point `REACT_APP_BACKEND_URL` at wherever it lives.

---

## Files in this directory

| File | Purpose |
|---|---|
| `nginx-skinmrkt.conf` | Nginx site config — SPA fallback, `/api` proxy, gzip, SSL, cache headers |
| `skinmrkt-backend.service` | systemd unit to run FastAPI under `www-data` with hardening |

Related files at the repo root:
- `netlify.toml` — Netlify build + SPA redirect config
- `frontend/public/_redirects` — Netlify SPA fallback (backup for `netlify.toml`)
- `frontend/public/index.html` — cleaned up for prod (no dev tracking scripts, proper meta tags)
