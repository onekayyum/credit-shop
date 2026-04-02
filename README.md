# Credit Shop (New Backend)

This project now uses a **portable backend** (Node.js + Express + SQLite) instead of Motoko/ICP canisters.
You can host this on your own server (AWS, DigitalOcean, VPS, local machine), and keep the same UI/features.

---

## What changed

- Frontend still behaves the same (same screens/components).
- Backend is now a REST API you control.
- Data is stored in a local SQLite file (`data/credit_shop.db` by default).
- You can later switch to PostgreSQL/MySQL if needed.

---

## Project structure

- `server.js` → new backend API server.
- `src/frontend` → existing React web app UI.
- `src/frontend/src/httpBackend.ts` → frontend adapter that calls REST API.

---

## 0) Super-simple architecture

- Browser/mobile app calls: `http://YOUR_SERVER:4000/api/...`
- `server.js` processes the request.
- Database saved in: `./data/credit_shop.db`

---

## 1) Run locally (quick start)

From the project root:

```bash
pnpm install
pnpm start:api
```

In a second terminal:

```bash
pnpm dev:frontend
```

Open `http://localhost:5173`.

If backend is on another host, set frontend env:

```bash
VITE_API_BASE_URL="http://YOUR_BACKEND_HOST:4000/api"
pnpm dev:frontend
```

---

## 2) AWS Ubuntu deployment (assume fresh machine)

This section is intentionally very explicit.

### Step A — Create Ubuntu server

1. In AWS EC2, create an Ubuntu instance (22.04 or 24.04).
2. In Security Group, open ports:
   - `22` (SSH)
   - `4000` (API)
   - optional `80/443` (if using nginx/domain)
3. SSH in:

```bash
ssh -i /path/to/your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### Step B — Install system packages

```bash
sudo apt update
sudo apt install -y git curl build-essential
```

### Step C — Install Node 20 + pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm pm2
```

Confirm versions:

```bash
node -v
npm -v
pnpm -v
pm2 -v
```

### Step D — Clone your project

```bash
git clone <YOUR_REPO_URL>
cd credit-shop
```

### Step E — Install dependencies

```bash
pnpm install
```

### Step F — Start backend with PM2 (keeps app alive)

```bash
pm2 start server.js --name credit-shop-api
pm2 save
pm2 startup
```

Check it works:

```bash
curl http://127.0.0.1:4000/api/health
```

You should see:

```json
{"ok":true}
```

### Step G — Build frontend

If frontend and backend are on same host and you reverse proxy `/api`, this is easiest:

```bash
cd src/frontend
pnpm install
pnpm build
```

This creates static files in `src/frontend/dist`.

### Step H — Serve frontend (simple option)

Install serve:

```bash
sudo npm install -g serve
```

From repo root:

```bash
pm2 start "serve -s src/frontend/dist -l 3000" --name credit-shop-web
pm2 save
```

Now web is on `http://YOUR_EC2_PUBLIC_IP:3000`.

---

## 3) Optional nginx setup (recommended for production)

Use nginx so:
- frontend is served on port 80/443
- `/api` forwards to Node backend port 4000

Install nginx:

```bash
sudo apt install -y nginx
```

Create config:

```bash
sudo nano /etc/nginx/sites-available/credit-shop
```

Paste:

```nginx
server {
    listen 80;
    server_name _;

    root /home/ubuntu/credit-shop/src/frontend/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/credit-shop /etc/nginx/sites-enabled/credit-shop
sudo nginx -t
sudo systemctl restart nginx
```

---

## 4) Android APK / Play Store path (SaaS-ready wrapper)

You can package this web app as Android app using Capacitor.

### On your dev machine (not EC2):

1. Install Android Studio.
2. Install Java 17 and Android SDK.
3. In repo root:

```bash
pnpm add -D @capacitor/cli
pnpm add @capacitor/core @capacitor/android
npx cap init "Credit Shop" "com.yourcompany.creditshop" --web-dir=src/frontend/dist
```

4. Build web app:

```bash
cd src/frontend
pnpm build
cd ../..
```

5. Add Android platform and sync:

```bash
npx cap add android
npx cap sync android
```

6. Open Android Studio project:

```bash
npx cap open android
```

7. In Android Studio:
   - Build > Generate Signed Bundle / APK
   - Create keystore
   - Build AAB for Play Store, or APK for direct distribution.

### Important for SaaS backend

Point app to your API URL by setting:

```bash
VITE_API_BASE_URL="https://api.yourdomain.com/api"
```

Then rebuild frontend and run `npx cap sync android` again.

---

## 5) Environment variables

- `PORT` → backend port (default `4000`)
- `DB_PATH` → sqlite file path (default `./data/credit_shop.db`)
- `VITE_API_BASE_URL` → frontend API base URL (default `/api`)

Examples:

```bash
PORT=4000 DB_PATH=./data/credit_shop.db node server.js
```

```bash
VITE_API_BASE_URL="https://api.yourdomain.com/api" pnpm --filter @caffeine/template-frontend build
```

---

## 6) Data backup

Your database is a single file (by default):

```bash
/workspace/credit-shop/data/credit_shop.db
```

Backup:

```bash
cp data/credit_shop.db data/credit_shop.db.backup
```

---

## 7) Notes

- Existing frontend features are preserved via backend method parity.
- IDs/timestamps are exchanged as strings over API and converted to bigint in the client.
- This stack is vendor-neutral and can run almost anywhere.
