## Credit Shop (Offline-first, No ICP)

This project keeps the original React UI/UX and replaces ICP/Motoko with a local IndexedDB backend.

## What changed

- ICP canister and Motoko backend removed.
- App data layer now uses IndexedDB (persistent, offline-first).
- Existing screens/components are preserved; only data plumbing was swapped.
- Camera flow stays the same UI-wise and now requests native camera permission when running in Capacitor.
- Optional sync API added (`src/api`) using Node.js + Express + MySQL.

## Local app (frontend)

```bash
pnpm install
pnpm --filter @caffeine/template-frontend build
```

For type checks:

```bash
pnpm --filter @caffeine/template-frontend typecheck
```

## Optional sync API (Node + Express + MySQL)

1. Create MySQL DB (default: `credit_shop`).
2. Apply schema:

```bash
mysql -u root -p credit_shop < src/api/schema.sql
```

3. Start API:

```bash
cd src/api
npm install
MYSQL_HOST=localhost MYSQL_USER=root MYSQL_PASSWORD=secret MYSQL_DB=credit_shop PORT=4100 npm run dev
```

Endpoints:
- `GET /health`
- `POST /sync/push`
- `GET /sync/pull`

## Capacitor Android APK

From `src/frontend`:

```bash
pnpm install
pnpm build
pnpm cap:sync
pnpm cap:open
```

In Android Studio:
1. Let Gradle sync complete.
2. Set signing config (`Build > Generate Signed Bundle / APK`).
3. Choose **APK**.
4. Create/select keystore.
5. Build release APK.

Generated output (typical):

`src/frontend/android/app/build/outputs/apk/release/app-release.apk`

## Offline-first behavior

- Customers/products/transactions persist in IndexedDB.
- App works without network.
- Optional backend sync can be run when connectivity is available.

