// Offline cache for the *default* catalog browse (no search, no category), so the
// Catalog tab still shows the last-known parts when the device drops its
// connection — repair shops often work in basements/warehouses with poor signal.
// Searches and filtered views always hit the network; only the default browse is
// cached. Backed by AsyncStorage (non-secret, and far larger payloads than
// expo-secure-store's ~2KB limit allows), loaded via a guarded require so a
// missing native module can't break the bundle (same pattern as push/pdf).
import type { Product } from './types';

function loadAsyncStorage(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    return null;
  }
}

const KEY = 'partspro_catalog_cache_v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days — stale beats an empty screen

export async function saveCatalogCache(products: Product[]): Promise<void> {
  const AS = loadAsyncStorage();
  if (!AS || products.length === 0) return;
  try {
    await AS.setItem(KEY, JSON.stringify({ at: Date.now(), products }));
  } catch {
    /* best-effort: never block the UI on caching */
  }
}

/** Last-known default-browse products, or null if absent/expired/unavailable. */
export async function readCatalogCache(): Promise<Product[] | null> {
  const AS = loadAsyncStorage();
  if (!AS) return null;
  try {
    const raw = await AS.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; products: Product[] };
    if (!parsed?.products?.length) return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed.products;
  } catch {
    return null;
  }
}
