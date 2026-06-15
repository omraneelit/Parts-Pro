// Parts Pro API smoke test.
//
// Exercises the live subscriber flow against the shared backend and exits
// non-zero if any check fails. Run after every backend deploy.
//
//   node scripts/smoke.mjs                 # uses EXPO_PUBLIC_API_URL or the default
//   node scripts/smoke.mjs https://host/api
//   npm run smoke
//
// Note: registering leaves one INACTIVE test subscriber behind (there is no
// public delete). The created email is printed so you can remove it from the
// admin "Parts Pro" tab. The active-catalog path needs an admin activation and
// is intentionally not covered here.

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

async function main() {
  console.log(`Parts Pro smoke test → ${BASE}`);
  console.log(`Test account: ${email}\n`);

  // Public settings
  const settings = await call('/partspro/settings');
  check(
    'GET /partspro/settings returns proDiscountPercent',
    settings.status === 200 && typeof settings.body?.proDiscountPercent === 'number',
    `status ${settings.status}`,
  );

  // Register -> inactive
  const reg = await call('/partspro/auth/register', {
    method: 'POST',
    body: { email, password, name: 'Smoke Test' },
  });
  check(
    'POST register creates an inactive subscriber',
    reg.status === 200 && reg.body?.status === 'inactive',
    `status ${reg.status}`,
  );

  // Login -> pro token
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

  // /me
  const me = await call('/partspro/me', { token });
  check(
    'GET /me returns this subscriber',
    me.status === 200 && me.body?.email === email,
    `status ${me.status}`,
  );
  check(
    'GET /me timestamps are timezone-aware (UTC)',
    typeof me.body?.created_at === 'string' && /(Z|\+00:00)$/.test(me.body.created_at),
    me.body?.created_at,
  );

  // Catalog gated while inactive
  const cat = await call('/partspro/catalog', { token });
  check('GET /catalog is gated (402) while inactive', cat.status === 402, `status ${cat.status}`);

  // Orders -> array
  const orders = await call('/partspro/orders', { token });
  check(
    'GET /orders returns a list',
    orders.status === 200 && Array.isArray(orders.body),
    `status ${orders.status}`,
  );

  // Wrong password -> 401
  const wrong = await call('/partspro/auth/login', {
    method: 'POST',
    body: { email, password: 'nope' },
  });
  check('POST login with wrong password -> 401', wrong.status === 401, `status ${wrong.status}`);

  // Duplicate register -> 409
  const dup = await call('/partspro/auth/register', {
    method: 'POST',
    body: { email, password, name: 'Dup' },
  });
  check('POST duplicate register -> 409', dup.status === 409, `status ${dup.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e);
  process.exit(1);
});
