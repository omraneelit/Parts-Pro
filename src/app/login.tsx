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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const SUBTITLE: Record<Mode, string> = {
  login: 'Sign in to your member account',
  register: 'Create your member account',
  forgot: 'Reset your password',
  reset: 'Enter the code we emailed you',
};

const CTA: Record<Mode, string> = {
  login: 'Sign in',
  register: 'Create account',
  forgot: 'Send reset code',
  reset: 'Reset password',
};

export default function LoginScreen() {
  const theme = useTheme();
  const { login, register, resetPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else if (mode === 'register') {
        await register(email.trim(), password, name.trim(), phone.trim() || undefined);
      } else if (mode === 'forgot') {
        const res = await api.forgotPassword(email.trim());
        setInfo(res.message);
        setMode('reset');
      } else {
        await resetPassword(email.trim(), code.trim(), password);
      }
      // Successful auth navigations are handled by the root layout's gate.
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
          <Animated.View style={styles.header} entering={FadeInDown.duration(300)}>
            <ThemedText type="title">Parts Pro</ThemedText>
            <ThemedText themeColor="textSecondary">{SUBTITLE[mode]}</ThemedText>
          </Animated.View>

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

          {mode === 'reset' ? (
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Reset code"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={inputStyle}
            />
          ) : null}

          {mode !== 'forgot' ? (
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'reset' ? 'New password' : 'Password'}
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              style={inputStyle}
            />
          ) : null}

          {mode === 'login' ? (
            <Pressable onPress={() => go('forgot')} style={styles.forgotLink}>
              <ThemedText type="small" style={{ color: Brand.accent }}>
                Forgot password?
              </ThemedText>
            </Pressable>
          ) : null}

          {info ? (
            <ThemedText type="small" style={{ color: Brand.success }}>
              {info}
            </ThemedText>
          ) : null}
          {error ? (
            <ThemedText type="small" style={{ color: Brand.danger }}>
              {error}
            </ThemedText>
          ) : null}

          <PressableScale onPress={submit} disabled={busy} style={[styles.primaryBtn, busy && { opacity: 0.6 }]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                {CTA[mode]}
              </ThemedText>
            )}
          </PressableScale>

          {mode === 'login' || mode === 'register' ? (
            <Pressable onPress={() => go(mode === 'login' ? 'register' : 'login')} style={styles.switch}>
              <ThemedText type="small" themeColor="textSecondary">
                {mode === 'login' ? "Don't have an account? " : 'Already a member? '}
                <ThemedText type="smallBold" style={{ color: Brand.accent }}>
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </ThemedText>
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable onPress={() => go('login')} style={styles.switch}>
              <ThemedText type="smallBold" style={{ color: Brand.accent }}>
                Back to sign in
              </ThemedText>
            </Pressable>
          )}

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
  forgotLink: { alignSelf: 'flex-end' },
  primaryBtn: {
    backgroundColor: Brand.accent,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  switch: { alignItems: 'center', paddingVertical: Spacing.two },
});
