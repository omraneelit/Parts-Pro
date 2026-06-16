# Parts Pro — Project Status

_Last updated: 2026-06-16_

A paid subscription mobile app for wholesale repair-shop customers ("Pro members").
It is a thin client over the **existing shared backend** that the HMA store and
accounting apps already use — Parts Pro never keeps its own copy of product,
stock, or price data (single source of truth in MongoDB).

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
  (branch `feat/support-marketing-polish`)

## 2. Tech stack

- Expo SDK 56, Expo Router (file-based, typed routes), TypeScript, React 19 / RN 0.85
- `react-native-reanimated` (animations), `expo-linear-gradient`, `expo-image`,
  `expo-secure-store` (token), `expo-haptics`, `@react-native-community/slider`
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
| Order history | ✅ | ✅ | ✅ |

Admin-editable settings (in `partspro_settings`): `proDiscountPercent` (5),
`trialLengthDays` (14), `freeTierDailyQuoteLimit` (3).

## 4. Backend (Parts Pro endpoints)

Subscriber-facing (JWT `role="pro"`):

| Method | Path | Notes |
|---|---|---|
| POST | `/partspro/auth/register` | starts on a trial |
| POST | `/partspro/auth/login` | rate-limited; token expires (`PARTSPRO_TOKEN_MINUTES`, 30d) |
| POST | `/partspro/auth/forgot-password` | emailed code (generic response) |
| POST | `/partspro/auth/reset-password` | bumps token_version |
| GET/PUT | `/partspro/me[/profile]` | profile + computed `tier`/`trial_ends_at` |
| GET | `/partspro/settings` | public; runtime discount/trial/limit |
| GET | `/partspro/catalog` | `q` (word-prefix), `device`, `category_id`, paged; `member_price` for trial/pro |
| POST | `/partspro/quote-usage` | free daily quote limiter |
| GET/POST/DELETE | `/partspro/quotes[/{id}]` | saved quotes |
| GET/POST | `/partspro/orders` | history + place order (recomputes price server-side) |
| GET | `/partspro/billing/status`, POST `/checkout`, POST `/webhook` | Stripe scaffold (off until keys set) |

Admin-facing (JWT `role=admin`), consumed by the accounting app's admin panel:
`/admin/partspro/subscribers`, `.../{id}/activate|extend|deactivate|tier|delete`,
`/admin/partspro/settings`, `/admin/partspro/stats`, `/admin/partspro/expiring`,
`/admin/partspro/reminders`, `/admin/partspro/subscribers.csv`.

Reused existing endpoints: `/categories` (catalog chips), product data lives in
the shared `products` collection; orders land in the shared `orders` collection
tagged `subscriber_id` + `source=partspro` (visible in the existing admin Orders
screen; stock moves on admin accept, same as store orders).

## 5. App structure (`src/`)

```
app/
  _layout.tsx            root: providers + auth gate + animated splash
  login.tsx              sign in / up / forgot / reset (+ show-password)
  cart.tsx               cart + checkout (modal)
  (tabs)/
    _layout.tsx          Catalog · Quote · Orders · Account
    index.tsx            Catalog: search, category chips, member pricing, add-to-cart
    quote.tsx            markup calculator, custom-part entry, saved quotes
    orders.tsx           order history
    account.tsx          tier status, trial countdown, edit profile, renew CTA
lib/
  api.ts                 centralized fetch client (base-URL fallback)
  auth.tsx               AuthProvider (token, subscriber, tier, isMember)
  cart.tsx               CartProvider
  types.ts  format.ts  storage.ts  haptics.ts
components/
  animated-splash.tsx    branded launch sequence (ported from accounting app)
  skeleton.tsx           shimmer loading placeholders
  pressable-scale.tsx    spring-on-press button wrapper
```

## 6. Admin panel

In the accounting app: `HMA-GROUP12/frontend/app/admin/parts-pro.tsx` (wired into
the admin nav). Tier badges + stats (pro/trial/free, MRR), subscriber search +
sort, Grant Pro / Trial / Free / Extend / Delete actions, CSV export, send
renewal reminders, and editors for discount / trial length / free quote limit.

## 7. Auth & security

- bcrypt passwords; JWT `role="pro"` with expiry + `token_version` revocation
- Login rate-limited (shared limiter with admin login)
- Forgot/reset password via emailed code (needs SMTP configured)
- New accounts start as a trial; Pro requires admin activation or Stripe payment
- Catalog/orders open to all tiers; member discount gated to trial/pro server-side

## 8. Branding & polish

- Launcher icon / adaptive / favicon use the phone-and-wrench **mark only**
  (crisp at small sizes); native splash uses the full logo. Regenerated by
  `scripts/gen_assets.py` (Pillow).
- Branded **animated splash** (dark gradient + grid + logo bloom + progress fill).
- Motion throughout: staggered list entrances, skeleton loaders, slide-in cart
  bar, added-to-cart toast, price/total "pop", press-scale buttons, animated
  empty states, branded pull-to-refresh, and **haptics** on key actions.

## 9. Testing & CI

- **Backend unit tests**: `backend/tests_unit/test_partspro.py` (19 tests, pure
  logic — tiers, expiry, public serialization). `python -m pytest tests_unit/`.
- **API smoke test**: `scripts/smoke.mjs` (`npm run smoke`, 20 checks) against the
  live backend; admin mode (`ADMIN_TOKEN` or `ADMIN_EMAIL`/`ADMIN_PASSWORD`) adds
  activation + member-pricing checks and sweeps `@partspro.test` accounts.
- **CI**: `.github/workflows/smoke.yml` runs the smoke test (manual + daily).

## 10. Deploy & run

- Backend: `cd HMA-GROUP12/backend && fly deploy` (app `backend-earnest-glow-6275`).
- App (JS changes): `cd PartsPro && npx expo start` (Metro reload).
- App (native changes — new icon/splash, haptics): `eas build` (project linked
  via `eas init`; package `com.omrano12.PartsPro`).

## 11. Configuration

App `.env`: `EXPO_PUBLIC_API_URL=https://backend-earnest-glow-6275.fly.dev/api`
(gitignored; see `.env.example`).

Fly secrets (backend):
- `JWT_SECRET` — must be a real secret (not the default)
- `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` — enables reset +
  reminder emails (otherwise those silently no-op)
- `STRIPE_SECRET_KEY` / `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` /
  `STRIPE_WEBHOOK_SECRET` — enables self-serve billing (otherwise 503 / manual
  activation only)

## 12. Open follow-ups

- Set SMTP secrets to turn on password-reset + renewal emails.
- Set Stripe secrets to enable self-serve subscriptions (currently activation is
  manual via the admin panel).
- Push notifications for order status / renewals (app needs to register an Expo
  push token; reminders are email-only today).
- Rebuild via `eas build` to ship the new icon/splash and activate haptics on
  device.

---

_Status: feature-complete against the original build plan **plus** the tiers
add-on, auth hardening, saved quotes, order placement, self-serve-billing
scaffold, branding, full motion/haptics polish, unit tests, and CI. App
typechecks clean; backend unit tests 19/19; live smoke 20/20._
