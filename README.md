## Credit Shop (Offline-First, No ICP)

This project now runs with a **local offline-first backend** using IndexedDB and has **no ICP / Motoko runtime dependency** in the app flow.

## What changed

- React UI/UX is preserved (same screens/components and navigation flow).
- Backend calls are replaced by a local service (`LocalBackend`) that matches the previous API shape.
- Data persists in IndexedDB and works fully offline.
- Camera barcode flow remains the same UX and now requests camera permission on native Capacitor builds.
- Optional sync API (Node + Express + MySQL) is available in `sync-api/`.

## Run frontend locally

```bash
pnpm install
pnpm --filter @caffeine/template-frontend build
```

For development:

```bash
cd src/frontend
pnpm install
pnpm vite
```

## Local persistence

- Database name: `credit-shop-db`
- Engine: IndexedDB (browser native API)
- Stores:
  - `customers`
  - `products`
  - `transactions`

## Optional REST sync backend

### 1) Start API

```bash
cd sync-api
npm install
# create MySQL DB and run schema.sql
node server.js
```

### 2) Endpoints

- `GET /health`
- `POST /sync/push`
- `GET /sync/pull`

## Capacitor Android + APK

From `src/frontend`:

```bash
pnpm install
pnpm build
npx capacitor add android
pnpm cap:sync
```

### Camera permissions

Add camera permissions in Android project before building:

- `android.permission.CAMERA`
- Runtime camera permission request in app flow

### Build APK (debug)

```bash
cd src/frontend
pnpm apk:debug
```

Output typically:

- `src/frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### Build signed release APK

```bash
cd src/frontend/android
keytool -genkey -v -keystore credit-shop.keystore -alias creditshop -keyalg RSA -keysize 2048 -validity 10000
```

Create/update `android/gradle.properties`:

```properties
RELEASE_STORE_FILE=credit-shop.keystore
RELEASE_KEY_ALIAS=creditshop
RELEASE_STORE_PASSWORD=your_password
RELEASE_KEY_PASSWORD=your_password
```

Then:

```bash
./gradlew assembleRelease
```

Release output:

- `src/frontend/android/app/build/outputs/apk/release/app-release.apk`
