// Centralized API layer. ALL backend calls go through here (per the build plan)
// so the single-source-of-truth contract with the shared backend stays in one
// place. The base URL comes from EXPO_PUBLIC_API_URL and already includes /api.
import {
  AuthTokenResponse,
  Order,
  PartsProSettings,
  Plan,
  Product,
  QuoteUsage,
  SavedQuote,
  Subscriber,
} from './types';

// Fall back to the production backend if EXPO_PUBLIC_API_URL wasn't embedded at
// build time (env vars are inlined by Metro; a stale/cleared build would
// otherwise leave this empty and every request would fail with "Network error").
const FALLBACK_API_URL = 'https://backend-earnest-glow-6275.fly.dev/api';
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim() || FALLBACK_API_URL;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  query?: Record<string, string | number | undefined>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, query } = opts;

  let url = `${BASE_URL}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const detail =
      (data && typeof data === 'object' && 'detail' in data && (data as any).detail) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, String(detail));
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- Auth ----
export function login(email: string, password: string) {
  return request<AuthTokenResponse>('/partspro/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function register(email: string, password: string, name: string, phone?: string) {
  return request<Subscriber>('/partspro/auth/register', {
    method: 'POST',
    body: { email, password, name, phone },
  });
}

export function forgotPassword(email: string) {
  return request<{ message: string }>('/partspro/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export function resetPassword(email: string, code: string, newPassword: string) {
  return request<AuthTokenResponse>('/partspro/auth/reset-password', {
    method: 'POST',
    body: { email, code, new_password: newPassword },
  });
}

export function getMe(token: string) {
  return request<Subscriber>('/partspro/me', { token });
}

export function updateProfile(token: string, updates: { name?: string; phone?: string }) {
  return request<Subscriber>('/partspro/me/profile', {
    method: 'PUT',
    body: updates,
    token,
  });
}

// ---- Settings (member discount, fetched at runtime) ----
export function getSettings() {
  return request<PartsProSettings>('/partspro/settings');
}

// ---- Catalog (live products from the shared collection) ----
export const CATALOG_PAGE_SIZE = 30;

export function getCatalog(
  token: string,
  params: { q?: string; device?: string; page?: number } = {},
) {
  return request<Product[]>('/partspro/catalog', {
    token,
    query: {
      q: params.q,
      device: params.device,
      page: params.page ?? 1,
      limit: CATALOG_PAGE_SIZE,
    },
  });
}

// ---- Orders ----
export function getOrders(token: string) {
  return request<Order[]>('/partspro/orders', { token });
}

export function placeOrder(token: string, items: { product_id: string; qty: number }[]) {
  return request<Order>('/partspro/orders', { method: 'POST', body: { items }, token });
}

// ---- Saved quotes ----
export function getQuotes(token: string) {
  return request<SavedQuote[]>('/partspro/quotes', { token });
}

export function saveQuote(
  token: string,
  quote: {
    product_id?: string;
    part_name: string;
    cost: number;
    markup_percent: number;
    customer_price: number;
    note?: string;
  },
) {
  return request<SavedQuote>('/partspro/quotes', { method: 'POST', body: quote, token });
}

export function deleteQuote(token: string, id: string) {
  return request<void>(`/partspro/quotes/${id}`, { method: 'DELETE', token });
}

// Free-tier daily quote limiter (trial/pro always allowed).
export function quoteUsage(token: string) {
  return request<QuoteUsage>('/partspro/quote-usage', { method: 'POST', token });
}

// ---- Self-serve billing (Stripe; disabled until configured server-side) ----
export function getBillingStatus() {
  return request<{ enabled: boolean }>('/partspro/billing/status');
}

export function startCheckout(token: string, plan: 'monthly' | 'annual') {
  return request<{ url: string }>('/partspro/billing/checkout', {
    method: 'POST',
    body: { plan },
    token,
  });
}

export type {
  AuthTokenResponse,
  Order,
  PartsProSettings,
  Plan,
  Product,
  QuoteUsage,
  SavedQuote,
  Subscriber,
};
