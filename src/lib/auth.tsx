// Auth state for Parts Pro. Holds the JWT (persisted via secure storage) and the
// signed-in subscriber's profile, and exposes login/register/logout/refresh.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import * as api from './api';
import { storageDelete, storageGet, storageSet, TOKEN_KEY } from './storage';
import type { Subscriber } from './types';

interface AuthState {
  token: string | null;
  subscriber: Subscriber | null;
  loading: boolean; // initial token restore in progress
  isActive: boolean; // subscription active (gates member pricing/catalog)
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, phone?: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [subscriber, setSubscriber] = useState<Subscriber | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a persisted session on launch and validate it against the backend.
  useEffect(() => {
    (async () => {
      try {
        const saved = await storageGet(TOKEN_KEY);
        if (saved) {
          try {
            const me = await api.getMe(saved);
            setToken(saved);
            setSubscriber(me);
          } catch {
            // Token invalid/expired — clear it so the user lands on login.
            await storageDelete(TOKEN_KEY);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await storageSet(TOKEN_KEY, res.access_token);
    const me = await api.getMe(res.access_token);
    setToken(res.access_token);
    setSubscriber(me);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string, phone?: string) => {
      await api.register(email, password, name, phone);
      // New accounts start inactive (admin activates after payment); log them in
      // so they can see their pending status on the Account tab.
      await login(email, password);
    },
    [login],
  );

  const resetPassword = useCallback(
    async (email: string, code: string, newPassword: string) => {
      const res = await api.resetPassword(email, code, newPassword);
      await storageSet(TOKEN_KEY, res.access_token);
      const me = await api.getMe(res.access_token);
      setToken(res.access_token);
      setSubscriber(me);
    },
    [],
  );

  const logout = useCallback(async () => {
    await storageDelete(TOKEN_KEY);
    setToken(null);
    setSubscriber(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setSubscriber(await api.getMe(token));
    } catch {
      /* leave existing state; a hard failure surfaces elsewhere */
    }
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      subscriber,
      loading,
      isActive: subscriber?.status === 'active',
      login,
      register,
      resetPassword,
      logout,
      refresh,
    }),
    [token, subscriber, loading, login, register, resetPassword, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
