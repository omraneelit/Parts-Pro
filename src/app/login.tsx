import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginScreen() {
  const theme = useTheme();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, name.trim(), phone.trim() || undefined);
      }
      // Navigation is handled by the auth gate in the root layout.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText type="title">Parts Pro</ThemedText>
            <ThemedText themeColor="textSecondary">
              {mode === 'login' ? 'Sign in to your member account' : 'Create your member account'}
            </ThemedText>
          </View>

          {mode === 'register' ? (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="words"
              style={inputStyle}
            />
          ) : null}

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={inputStyle}
          />

          {mode === 'register' ? (
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone (optional)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={inputStyle}
            />
          ) : null}

          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            style={inputStyle}
          />

          {error ? (
            <ThemedText type="small" style={{ color: '#d14343' }}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable onPress={submit} disabled={busy} style={[styles.primaryBtn, busy && { opacity: 0.6 }]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            style={styles.switch}>
            <ThemedText type="small" themeColor="textSecondary">
              {mode === 'login' ? "Don't have an account? " : 'Already a member? '}
              <ThemedText type="smallBold" style={{ color: '#3c87f7' }}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </ThemedText>
            </ThemedText>
          </Pressable>

          {mode === 'register' ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              New accounts are activated by us after payment. You can sign in right away and your
              member pricing unlocks once activated.
            </ThemedText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.three },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#3c87f7',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  switch: { alignItems: 'center', paddingVertical: Spacing.two },
});
