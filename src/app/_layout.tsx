import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';

import { AuthProvider, useAuth } from '@/lib/auth';

function RootNavigator() {
  const { token, loading } = useAuth();
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
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </ThemeProvider>
  );
}
