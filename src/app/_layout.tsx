import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';

import { AnimatedSplash } from '@/components/animated-splash';
import { AuthProvider, useAuth } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { FavoritesProvider } from '@/lib/favorites';
import { LanguageProvider, useI18n } from '@/lib/i18n';
import { ThemeModeProvider, useThemeMode } from '@/lib/theme-mode';
import { addNotificationResponseHandler, registerForPush } from '@/lib/push';

function RootNavigator() {
  const { token, loading } = useAuth();
  const { t } = useI18n();
  const segments = useSegments();
  const router = useRouter();

  // Redirect based on auth state: unauthenticated users go to /login, and a
  // signed-in user who lands on /login is bounced into the tabs.
  useEffect(() => {
    if (loading) return;
    const onLogin = segments[0] === 'login';
    if (!token && !onLogin) {
      router.replace('/login');
    } else if (token && onLogin) {
      router.replace('/');
    }
  }, [token, loading, segments, router]);

  // Register this device for push once the subscriber is signed in (best-effort;
  // no-ops in Expo Go / before the native module is bundled via eas build).
  useEffect(() => {
    if (token) void registerForPush(token);
  }, [token]);

  // Route a tapped notification (renewal reminder, order update, back-in-stock)
  // to the screen named in its payload. No-ops without the native module.
  useEffect(() => {
    if (!token) return;
    return addNotificationResponseHandler((path) => router.push(path as never));
  }, [token, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="cart" options={{ headerShown: true, title: t('cart_title'), presentation: 'modal' }} />
    </Stack>
  );
}

// Inside ThemeModeProvider so the navigation theme + status bar follow the
// user's resolved colour scheme (System / Light / Dark).
function ThemedRoot() {
  const { scheme } = useThemeMode();
  const [splashDone, setSplashDone] = useState(false);
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <RootNavigator />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {!splashDone ? <AnimatedSplash onFinish={() => setSplashDone(true)} /> : null}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeModeProvider>
      <LanguageProvider>
        <AuthProvider>
          <FavoritesProvider>
            <CartProvider>
              <ThemedRoot />
            </CartProvider>
          </FavoritesProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeModeProvider>
  );
}
