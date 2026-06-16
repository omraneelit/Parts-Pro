// Types mirror the real MongoDB shapes returned by the shared backend
// (HMA-GROUP12/backend/server.py), not assumptions. Parts Pro never stores a
// copy of this data — it reads it live from the shared API.

export type Plan = 'monthly' | 'annual';
export type Tier = 'trial' | 'free' | 'pro';

export interface Product {
  id: string;
  name_en: string;
  name_ar?: string;
  category_id?: string;
  retail_price: number;
  wholesale_price: number | null;
  // Promo-discounted prices (set by the backend when a discount applies).
  retail_final?: number | null;
  wholesale_final?: number | null;
  wholesale_discount_label?: string | null;
  // Parts Pro member price = effective wholesale x (1 - proDiscountPercent/100).
  member_price?: number | null;
  stock_qty?: number | null; // null = untracked/unlimited
  in_stock?: boolean;
  sku?: string;
  image?: string | null;
  images?: string[];
  compatible_models?: string[];
}

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  status: 'active' | 'inactive';
  tier?: Tier | null;
  plan?: Plan | null;
  start_date?: string | null;
  expiry_date?: string | null;
  trial_ends_at?: string | null;
  created_at?: string | null;
}

export interface Category {
  id: string;
  name_en: string;
  name_ar?: string;
}

export interface PartsProSettings {
  proDiscountPercent: number;
  trialLengthDays: number;
  freeTierDailyQuoteLimit: number;
}

export interface QuoteUsage {
  allowed: boolean;
  remaining: number | null;
  tier: Tier;
  limit?: number;
}

export interface OrderItem {
  product_id?: string;
  name?: string;
  name_en?: string;
  qty?: number;
  unit_price?: number;
}

export interface Order {
  id: string;
  status?: string;
  total?: number;
  created_at?: string;
  items?: OrderItem[];
}

export interface SavedQuote {
  id: string;
  product_id?: string | null;
  part_name: string;
  cost: number;
  markup_percent: number;
  customer_price: number;
  note?: string | null;
  created_at?: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  role: string;
  name?: string;
}
