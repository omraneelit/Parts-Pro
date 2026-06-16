// Parts Pro API smoke test.
//
// Exercises the live subscriber flow against the shared backend and exits
// non-zero if any check fails. Run after every backend deploy.
//
//   node scripts/smoke.mjs                 # uses EXPO_PUBLIC_API_URL or the default
//   node scripts/smoke.mjs https://host/api
//   npm run smoke
//
// Admin mode (optional) unlocks the activate -> member-price path AND cleans up
// every leftover *@partspro.test account. Provide an admin JWT or admin creds:
//
//   ADMIN_TOKEN=eyJ... npm run smoke
//   ADMIN_EMAIL=you@store ADMIN_PASSWORD=secret npm run smoke
//
// Without admin mode the test leaves one INACTIVE test subscriber behind (no
// public delete) and skips the member-pricing checks.

const BASE =
  process.argv[2] ||
  process.env.EXPO_PUBLIC_API_URL ||
  'https://backend-earnest-glow-6275.fly.dev/api';

const email = `smoke+${Date.now()}@partspro.test`;
const password = 'test1234';

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Returns { status, body } without throwing on non-2xx.
async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

// Resolve an admin token from ADMIN_TOKEN, or by logging in with ADMIN_EMAIL +
// ADMIN_PASSWORD. Returns null when admin mode isn't configured.
async function resolveAdminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN.trim();
  const e = process.env.ADMIN_EMAIL;
  const p = process.env.ADMIN_PASSWORD;
  if (e && p) {
    const res = await call('/admin/login', { method: 'POST', body: { email: e, password: p } });
    if (res.status === 200 && res.body?.access_token) return res.body.access_token;
    console.log(`  ! admin login failed (status ${res.status}); skipping admin checks`);
  }
  return null;
}

async function main() {
  console.log(`Parts Pro smoke test → ${BASE}`);
  console.log(`Test account: ${email}\n`);

  // --- Public + subscriber flow ---
  const settings = await call('/partspro/settings');
  const discountPct =
    typeof settings.body?.proDiscountPercent === 'number' ? settings.body.proDiscountPercent : null;
  check(
    'GET /partspro/settings returns proDiscountPercent',
    discountPct !== null,
    `status ${settings.status}`,
  );
  check(
    'settings include trialLengthDays + freeTierDailyQuoteLimit',
    typeof settings.body?.trialLengthDays === 'number' &&
      typeof settings.body?.freeTierDailyQuoteLimit === 'number',
  );

  const reg = await call('/partspro/auth/register', {
    method: 'POST',
    body: { email, password, name: 'Smoke Test' },
  });
  const subId = reg.body?.id;
  check(
    'POST register creates an inactive subscriber',
    reg.status === 200 && reg.body?.status === 'inactive',
    `status ${reg.status}`,
  );

  const login = await call('/partspro/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const token = login.body?.access_token;
  check(
    'POST login returns a role=pro token',
    login.status === 200 && !!token && login.body?.role === 'pro',
    `status ${login.status}`,
  );

  const me = await call('/partspro/me', { token });
  check('GET /me returns this subscriber', me.status === 200 && me.body?.email === email, `status ${me.status}`);
  check(
    'GET /me timestamps are timezone-aware (UTC)',
    typeof me.body?.created_at === 'string' && /(Z|\+00:00)$/.test(me.body.created_at),
    me.body?.created_at,
  );
  check('new signup starts on a trial', me.body?.tier === 'trial' && !!me.body?.trial_ends_at, `tier ${me.body?.tier}`);

  // Trial members get full catalog + member pricing (no 402 gate anymore).
  const cat = await call('/partspro/catalog', { token });
  const catItems = Array.isArray(cat.body) ? cat.body : [];
  check('GET /catalog is open to trial members (200)', cat.status === 200 && Array.isArray(cat.body), `status ${cat.status}`);
  check(
    'trial catalog includes member_price',
    catItems.length === 0 || catItems.some((p) => p.member_price != null),
  );

  // Quote usage: trial is unlimited.
  const usage = await call('/partspro/quote-usage', { method: 'POST', token });
  check('POST /quote-usage allows trial unlimited', usage.body?.allowed === true && usage.body?.tier === 'trial', `tier ${usage.body?.tier}`);

  // Order endpoint reachable + validates (empty order -> 400, no real order made).
  const emptyOrder = await call('/partspro/orders', { method: 'POST', token, body: { items: [] } });
  check('POST /orders rejects an empty order (400)', emptyOrder.status === 400, `status ${emptyOrder.status}`);

  const orders = await call('/partspro/orders', { token });
  check(
    'GET /orders returns a list',
    orders.status === 200 && Array.isArray(orders.body),
    `status ${orders.status}`,
  );

  // Saved quotes CRUD (subscriber-scoped; no admin needed)
  const qList0 = await call('/partspro/quotes', { token });
  check('GET /quotes returns a list', qList0.status === 200 && Array.isArray(qList0.body), `status ${qList0.status}`);
  const qCreate = await call('/partspro/quotes', {
    method: 'POST',
    token,
    body: { part_name: 'Test screen', cost: 10, markup_percent: 30, customer_price: 13 },
  });
  const quoteId = qCreate.body?.id;
  check('POST /quotes saves a quote', qCreate.status === 200 && !!quoteId, `status ${qCreate.status}`);
  const qList1 = await call('/partspro/quotes', { token });
  check(
    'saved quote appears in the list',
    Array.isArray(qList1.body) && qList1.body.some((q) => q.id === quoteId),
  );
  if (quoteId) {
    const qDel = await call(`/partspro/quotes/${quoteId}`, { method: 'DELETE', token });
    check('DELETE /quotes/{id} -> 204', qDel.status === 204, `status ${qDel.status}`);
  }

  const wrong = await call('/partspro/auth/login', { method: 'POST', body: { email, password: 'nope' } });
  check('POST login with wrong password -> 401', wrong.status === 401, `status ${wrong.status}`);

  const dup = await call('/partspro/auth/register', { method: 'POST', body: { email, password, name: 'Dup' } });
  check('POST duplicate register -> 409', dup.status === 409, `status ${dup.status}`);

  // Admin endpoints must reject anonymous callers.
  const noAuthList = await call('/admin/partspro/subscribers');
  check(
    'GET /admin/partspro/subscribers without auth -> 401/403',
    noAuthList.status === 401 || noAuthList.status === 403,
    `status ${noAuthList.status}`,
  );

  // --- Admin flow (only when a token is available) ---
  const adminToken = await resolveAdminToken();
  if (!adminToken) {
    console.log('\n  (admin checks skipped — set ADMIN_TOKEN or ADMIN_EMAIL/ADMIN_PASSWORD)');
    console.log(`  (leftover inactive test account: ${email})`);
  } else if (subId) {
    console.log('\n  Admin mode: activation + member pricing');

    const act = await call(`/admin/partspro/subscribers/${subId}/activate?plan=monthly`, {
      method: 'POST',
      token: adminToken,
    });
    check('POST admin activate -> active', act.status === 200 && act.body?.status === 'active', `status ${act.status}`);

    const meActive = await call('/partspro/me', { token });
    check('GET /me reflects active subscription', meActive.body?.status === 'active');

    const catOk = await call('/partspro/catalog', { token });
    const items = Array.isArray(catOk.body) ? catOk.body : [];
    check('GET /catalog returns 200 + list once active', catOk.status === 200 && Array.isArray(catOk.body), `status ${catOk.status}`);

    const priced = items.find((p) => (p.wholesale_final ?? p.wholesale_price) > 0 && p.member_price != null);
    if (priced) {
      const baseW = priced.wholesale_final ?? priced.wholesale_price;
      const expected = Math.round(baseW * (1 - discountPct / 100) * 100) / 100;
      check(
        `member_price = wholesale × (1 - ${discountPct}%)`,
        Math.abs(priced.member_price - expected) <= 0.01,
        `got ${priced.member_price}, expected ${expected}`,
      );
    } else {
      console.log('  ! no priced product found to verify member_price (catalog empty?)');
    }

    const stats = await call('/admin/partspro/stats', { token: adminToken });
    check('GET /admin/partspro/stats counts active >= 1', (stats.body?.active ?? 0) >= 1, `active ${stats.body?.active}`);

    const del = await call(`/admin/partspro/subscribers/${subId}`, { method: 'DELETE', token: adminToken });
    check('DELETE subscriber -> 204', del.status === 204, `status ${del.status}`);

    const gone = await call('/partspro/me', { token });
    check('deleted subscriber token is rejected -> 401', gone.status === 401, `status ${gone.status}`);

    // Sweep: remove every leftover test account from earlier runs.
    const list = await call('/admin/partspro/subscribers', { token: adminToken });
    const stale = (Array.isArray(list.body) ? list.body : []).filter((s) =>
      String(s.email || '').endsWith('@partspro.test'),
    );
    for (const s of stale) {
      await call(`/admin/partspro/subscribers/${s.id}`, { method: 'DELETE', token: adminToken });
    }
    if (stale.length) console.log(`  swept ${stale.length} leftover @partspro.test account(s)`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
