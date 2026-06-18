# Parts Pro — Project Status

_Last updated: 2026-06-18_

> **Branch policy:** `master` is the single canonical branch — always commit/push
> there, never feature branches.

### Session update (2026-06-18)
- Re-registered under the **elhagmeos-organization** Expo account (new projectId
  `ff86276f-…`); old `omrano12` project abandoned.
- **Offline catalog cache** (`lib/catalog-cache.ts`, AsyncStorage) for the default
  browse, with an offline banner (en/ar) — survives a dropped connection in the field.
- **Push deep-linking** — tapped notifications (renewal / order / back-in-stock)
  route to the right screen instead of just opening the app.
- **Animation polish** — active tab icon springs on focus; catalog thumbnails fade
  in (expo-image transition).
- Confirmed the free-tier quote limit is server-enforced and the quote-limit upsell
  already exists.
- Pending: `eas build` to bundle the new native module (AsyncStorage) + push/scan/PDF.

A paid subscription mobile app for wholesale repair-shop customers ("Pro members").
It is a thin client over the **existing shared backend** that the HMA store and
accounting apps already use — Parts Pro never keeps its own copy of product,
stock, or price data (single source of truth in MongoDB).

> **Deploy state:** backend is **deployed** on `backend-earnest-glow-6275`
> (price-list, favorites, push, stock alerts, device-search, Parts Pro email
> sender, **editable plan prices**, and **gift/VIP code redemption** are all
> live). App-side JS changes are live on a Metro reload; native features (push,
> scanning, PDF) need an `eas build`.

---

## 1. Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────────────┐
│  Store app  │     │ Accounting  │     │  Parts Pro (this app)    │
│  (HMA)      │     │ app (HMA)   │     │  Expo / React Native     │
└──────┬──────┘     └──────┬──────┘     └─────────────┬────────────┘
       │                   │                          │
       └───────────────────┴──────────────┬───────────┘
                                           │  HTTPS (/api)
                              ┌────────────▼─────────────┐
                              │  FastAPI backend (Fly.io) │
                              │  backend-earnest-glow-6275│
                              │  MongoDB: hma_production   │
                              └───────────────────────────┘
```

- **Backend**: `HMA-GROUP12/backend/server.py` (FastAPI, single file). All routes
  are under the `/api` prefix. Deployed on Fly.io app `backend-earnest-glow-6275`.
- **Base URL**: `https://backend-earnest-glow-6275.fly.dev/api`
- **App repo**: https://github.com/omraneelit/Parts-Pro (branch `master`)
- **Backend/admin repo**: https://github.com/omraneelit/HMA-GROUP12

## 2. Tech stack

- Expo SDK 56, Expo Router (file-based, typed routes), TypeScript, React 19 / RN 0.85
- `react-native-reanimated` (animations), `expo-linear-gradient`, `expo-image`,
  `expo-secure-store` (token + language), `expo-haptics`, `@react-native-community/slider`
- Native add-ons (need an `eas build` to run): `expo-notifications` (push),
  `expo-camera` (barcode scan), `expo-print` + `expo-sharing` (price-list PDF)
- In-app i18n (English + Arabic, RTL) via `src/lib/i18n.tsx` (no third-party lib)
- Backend: Python FastAPI + Motor (async MongoDB) on Fly.io
- `EXPO_PUBLIC_API_URL` env var (with a hardcoded prod fallback in `lib/api.ts`)

## 3. Subscription tiers (Trial → Free → Pro)

`tier` is **computed** (no cron): paid-active = `pro` > within trial window =
`trial` > otherwise `free`. New sign-ups get an automatic trial.

| Feature | Trial (14d) | Free | Pro ($8/mo · $80/yr) |
|---|---|---|---|
| Catalog & compatibility search | Full | Full | Full |
| Member discount on orders | ✅ | ❌ (regular price) | ✅ |
| Quote calculator | Unlimited | N/day limit | Unlimited |
| Saved default markup | ✅ | ❌ (per session) | ✅ |
| Price List Maker, Favorites, Order history | ✅ | ✅ | ✅ |

Admin-editable settings (in `partspro_settings`, edited from the **Control App**):
`proDiscountPercent` (5), `trialLengthDays` (14), `freeTierDailyQuoteLimit` (3),
and the plan prices `monthlyPrice` ($8), `annualPrice` ($80) — the account screen
shows these live. A redeemed gift code can also grant a per-subscriber
`bonus_discount` (stacks on the member %).

## 4. Backend (Parts Pro endpoints)

Subscriber-facing (JWT `role="pro"`):

| Method | Path | Notes |
|---|---|---|
| POST | `/partspro/auth/register` | starts on a trial |
| POST | `/partspro/auth/login` | rate-limited; token expires (`PARTSPRO_TOKEN_MINUTES`, 30d) |
| POST | `/partspro/auth/forgot-password` | emailed code via the **Parts Pro mailbox** |
| POST | `/partspro/auth/reset-password` | bumps token_version |
| GET/PUT | `/partspro/me[/profile]` | profile + computed `tier`/`trial_ends_at` |
| GET | `/partspro/settings` | public; runtime discount/trial/limit |
| GET | `/partspro/catalog` | `q` (word-prefix), `device` (now matches name too), `category_id`, paged; `member_price` for trial/pro |
| GET/PUT | `/partspro/pricelist` | per-subscriber markup % / rounding / per-item overrides (Price List Maker) |
| GET/POST/DELETE | `/partspro/favorites[/{id}]` | saved parts (full product docs, member-priced) |
| POST | `/partspro/push-token` | register Expo push token for this device |
| POST | `/partspro/products/{id}/notify-me` | back-in-stock waitlist |
| POST | `/partspro/quote-usage` | free daily quote limiter |
| POST | `/partspro/redeem` | redeem a one-time VIP/gift code (VIP days + bonus discount) |
| GET/POST/DELETE | `/partspro/quotes[/{id}]` | saved quotes |
| GET/POST | `/partspro/orders` | history + place order (recomputes price server-side) |
| GET | `/partspro/billing/status`, POST `/checkout`, POST `/webhook` | Stripe scaffold (off until keys set) |

Admin-facing (JWT `role=admin`), consumed by the accounting app's admin panel:
`/admin/partspro/subscribers`, `.../{id}/activate|extend|deactivate|tier|delete`,
`/admin/partspro/settings`, `/admin/partspro/stats`, `/admin/partspro/expiring`,
`/admin/partspro/reminders` (push + email), `/admin/partspro/subscribers.csv`.

Reused existing endpoints: `/categories` (catalog chips); product data lives in
the shared `products` collection; orders land in the shared `orders` collection
tagged `subscriber_id` + `source=partspro`. Order **status changes push the
subscriber** (`_set_order_status` → `PARTSPRO_STATUS_PUSH`); **restock** reuses
the store `stock_subscriptions` waitlist (now also pushes subscribers).

## 5. App structure (`src/`)

```
app/
  _layout.tsx            root: Language + Auth + Favorites + Cart providers, auth gate, splash, push register
  login.tsx              sign in / up / forgot / reset (localized)
  cart.tsx               cart + checkout (modal, localized)
  (tabs)/
    _layout.tsx          Catalog · Price List · Quote · Orders · Account (localized titles)
    index.tsx            Catalog: search (+ barcode scan), category chips, Favorites filter, member pricing, add-to-cart, notify-me
    catalog.tsx          Price List Maker: markup/rounding/overrides editor + share (PDF→text fallback)
    quote.tsx            markup calculator, custom-part entry, saved quotes (+ search), barcode scan
    orders.tsx           order history + Reorder
    account.tsx          tier status, trial countdown, edit profile, renew CTA, language toggle (EN/AR)
lib/
  api.ts                 centralized fetch client (base-URL fallback)
  auth.tsx               AuthProvider (token, subscriber, tier, isMember)
  cart.tsx               CartProvider
  favorites.tsx          FavoritesProvider (saved-part IDs, optimistic toggle)
  i18n.tsx               LanguageProvider, useI18n, t(), en/ar dictionary, RTL, persisted lang
  push.ts                Expo push registration (guarded, no-op without the native module)
  pdf.ts                 share HTML as PDF (guarded) + escapeHtml
  types.ts  format.ts  storage.ts  haptics.ts
components/
  animated-splash.tsx    branded launch sequence
  barcode-scanner.tsx    full-screen camera scanner (expo-camera)
  skeleton.tsx  pressable-scale.tsx  themed-text.tsx
```

## 6. Feature set

- **Catalog** — part/SKU + device search, category chips, member vs regular
  pricing, add-to-cart, barcode scan into search, Favorites filter, notify-me on
  out-of-stock parts.
- **Price List Maker** (`catalog.tsx`, "Price List" tab) — build a customer price
  list off the wholesale catalog: a markup % with rounding applied to the buy
  price, per-part overrides, share as PDF (text fallback). Config saved
  per-subscriber.
- **Favorites** — heart any part; synced server-side; Favorites filter view.
- **Quote** — markup calculator with saved default (member perk), custom-part
  quoting, saved quotes with search, share, barcode scan, free-tier daily limit.
- **Reorder** — one tap on a past order rebuilds the cart.
- **Orders** — history with status + items.
- **Account** — tier/trial status (live plan prices), renew/upgrade CTA, **redeem
  a gift/VIP code**, profile editing, **language toggle (EN/العربية)**, and an
  **appearance toggle (System / Light / Dark)**.
- **Localization** — every screen translated (en/ar); RTL applied on restart
  (no `expo-updates`, so direction flips need an app relaunch; text swaps live).
- **Dark mode** — persisted System/Light/Dark preference (`lib/theme-mode.tsx`)
  driving the existing dark palette; toggled from Account.

## 7. Notifications & email

- **Push** (`expo-notifications`): device registers a token on sign-in; backend
  pushes on order-status changes and renewal reminders, and on back-in-stock.
  Needs an `eas build` to function on device.
- **Email** — Parts Pro sends from its **own mailbox**, separate from the
  store/accounting/Clear Books senders. Backend `PARTSPRO_SMTP_*` env vars (fall
  back to the shared `SMTP_*`); only the subscriber password-reset code and
  renewal reminders use it (`send_partspro_email`). Sender =
  `partsproo12@gmail.com` (Gmail, smtp.gmail.com:587 STARTTLS, app password). The
  five `PARTSPRO_SMTP_*` Fly secrets are **staged** — live on next deploy.

## 8. Auth & security

- bcrypt passwords; JWT `role="pro"` with expiry + `token_version` revocation
- Login rate-limited (shared limiter with admin login)
- Forgot/reset password via emailed code (Parts Pro mailbox)
- New accounts start as a trial; Pro requires admin activation or Stripe payment
- Catalog/orders open to all tiers; member discount gated to trial/pro server-side

## 9. Branding & polish

- Launcher icon / adaptive / favicon use the phone-and-wrench **mark only**;
  native splash uses the full logo. Regenerated by `scripts/gen_assets.py`.
- Branded **animated splash**, staggered list entrances, skeleton loaders,
  slide-in cart bar, added-to-cart toast, price/total "pop", press-scale buttons,
  animated empty states, branded pull-to-refresh, and **haptics** on key actions.

## 10. Testing & CI

- **Backend unit tests**: `backend/tests_unit/test_partspro.py` (pure logic —
  tiers, expiry, public serialization). `python -m pytest tests_unit/`.
- **API smoke test**: `scripts/smoke.mjs` (`npm run smoke`) against the live
  backend; admin mode adds activation + member-pricing checks.
- **CI**: `.github/workflows/smoke.yml` (manual + daily).
- All three frontends + backend currently typecheck / parse clean.

## 11. Deploy & run

- Backend: `cd HMA-GROUP12/backend && fly deploy` (app `backend-earnest-glow-6275`).
  This single deploy ships the price-list, favorites, push, stock-alert,
  device-search and email changes, and activates the staged `PARTSPRO_SMTP_*`
  secrets.
- App (JS changes): `cd PartsPro && npx expo start` (Metro reload).
- App (native changes — push, barcode scan, PDF, icon/splash, haptics):
  `eas build` (project linked; package `com.omrano12.PartsPro`).

## 12. Configuration

App `.env`: `EXPO_PUBLIC_API_URL=https://backend-earnest-glow-6275.fly.dev/api`
(gitignored; see `.env.example`).

Fly secrets (backend):
- `JWT_SECRET` — must be a real secret (not the default)
- `PARTSPRO_SMTP_HOST/PORT/USER/PASSWORD/FROM` — Parts Pro email sender
  (**staged**, activates on next deploy)
- `SMTP_*` — shared sender for store/accounting (separate from Parts Pro)
- `STRIPE_SECRET_KEY` / `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` /
  `STRIPE_WEBHOOK_SECRET` — enables self-serve billing (otherwise 503 / manual
  activation only)

## 13. Open follow-ups

- **`eas build`** to enable push, barcode scanning, the Parts Pro price-list PDF,
  and the icon/splash/haptics on device.
- Confirm `partsproo12@gmail.com` uses a Google **App Password** (2-Step required)
  and verify a real Parts Pro password-reset email arrives after deploy.
- Set **Stripe** secrets to enable self-serve subscriptions (currently manual
  activation via the admin panel).
- RTL direction currently needs an app restart; add `expo-updates` +
  `reloadAsync()` if instant flipping is wanted.

---

_Status: feature-complete against the original build plan **plus** tiers,
auth hardening, saved quotes, order placement, billing scaffold, branding, full
motion/haptics polish — **plus** the Price List Maker (markup/overrides), full
Arabic localization with a language toggle, favorites, reorder, quote-history
search, push notifications, barcode scanning, back-in-stock alerts, and a
dedicated Parts Pro email sender. Apps typecheck clean; backend parses clean.
Pending: one backend deploy + an eas build._
