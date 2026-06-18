// Expo push registration. Kept dependency-soft on purpose: `expo-notifications`
// is a native module, so it's loaded via require() inside a try/catch. In Expo
// Go or before an `eas build` that bundles the module, this silently no-ops
// instead of crashing — the rest of the app is unaffected.
import { Platform } from 'react-native';

import * as api from './api';

// Lazily resolve the optional native modules so a missing dep can't break the
// bundle. Returns null when notifications aren't available in this build.
function loadNotifications(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
}

function loadConstants(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-constants').default;
  } catch {
    return null;
  }
}

/**
 * Ask for notification permission, fetch the Expo push token, and register it
 * with the backend for this subscriber. Best-effort: any failure (no module, no
 * permission, simulator) resolves quietly.
 */
export async function registerForPush(authToken: string): Promise<void> {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  try {
    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance?.DEFAULT ?? 3,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const Constants = loadConstants();
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const pushToken = tokenResp?.data;
    if (pushToken) await api.savePushToken(authToken, pushToken);
  } catch {
    /* best-effort: never block the app on push setup */
  }
}

// Map the backend's `data.screen` payload (renewal reminders send "account",
// order-status pushes send "orders", etc.) to an in-app route.
const SCREEN_ROUTES: Record<string, string> = {
  account: '/account',
  orders: '/orders',
  catalog: '/',
  index: '/',
  quote: '/quote',
};

/**
 * Route a tapped push notification to the screen named in its `data.screen`.
 * Handles both the warm case (tapped while running) and the cold start (app
 * launched by the tap). Guarded like {@link registerForPush}: no-ops when the
 * native module isn't bundled. Returns an unsubscribe function.
 */
export function addNotificationResponseHandler(navigate: (path: string) => void): () => void {
  const Notifications = loadNotifications();
  if (!Notifications?.addNotificationResponseReceivedListener) return () => {};

  const route = (data: any) => {
    const screen = typeof data?.screen === 'string' ? data.screen : '';
    const path = SCREEN_ROUTES[screen];
    if (path) navigate(path);
  };

  try {
    // Cold start: opened by tapping a notification while the app was killed.
    Notifications.getLastNotificationResponseAsync?.()
      .then((resp: any) => {
        const data = resp?.notification?.request?.content?.data;
        if (data) route(data);
      })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((resp: any) => {
      route(resp?.notification?.request?.content?.data);
    });
    return () => {
      try {
        sub?.remove?.();
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}
