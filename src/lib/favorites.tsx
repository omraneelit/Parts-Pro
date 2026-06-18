// Per-subscriber favorite parts. Holds just the favorited product IDs (loaded
// once on sign-in) so any screen can show a filled/empty heart and toggle it
// optimistically. The full product details for the Favorites view are fetched
// on demand via api.getFavorites.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as api from './api';
import { useAuth } from './auth';

interface FavoritesState {
  ids: Set<string>;
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
  refresh: () => void;
  count: number;
}

const FavoritesContext = createContext<FavoritesState | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!token) {
      setIds(new Set());
      return;
    }
    api
      .getFavorites(token)
      .then((products) => setIds(new Set(products.map((p) => p.id))))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    (productId: string) => {
      if (!token) return;
      setIds((prev) => {
        const next = new Set(prev);
        const has = next.has(productId);
        if (has) next.delete(productId);
        else next.add(productId);
        // Fire-and-forget; reconcile from the server if it fails.
        const call = has ? api.removeFavorite(token, productId) : api.addFavorite(token, productId);
        call.catch(() => refresh());
        return next;
      });
    },
    [token, refresh],
  );

  const value = useMemo<FavoritesState>(
    () => ({
      ids,
      isFavorite: (id: string) => ids.has(id),
      toggle,
      refresh,
      count: ids.size,
    }),
    [ids, toggle, refresh],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesState {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider');
  return ctx;
}
