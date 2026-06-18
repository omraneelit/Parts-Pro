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
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { notifyError, notifySuccess } from '@/lib/haptics';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function LoginScreen() {
  const theme = useTheme();
  const { login, register, resetPassword } = useAuth();
  const { t } = useI18n();

  const SUBTITLE: Record<Mode, string> = {
    login: t('lg_sub_login'),
    register: t('lg_sub_register'),
    forgot: t('lg_sub_forgot'),
    reset: t('lg_sub_reset'),
  };
  const CTA: Record<Mode, string> = {
    login: t('lg_cta_login'),
    register: t('lg_cta_register'),
    forgot: t('lg_cta_forgot'),
    reset: t('lg_cta_reset'),
  };

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      notifySuccess();
      // Successful auth navigations are handled by the root layout's gate.
    } catch (e) {
      notifyError();
      setError(e instanceof ApiError ? e.message : t('lg_generic_err'));
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
              placeholder={t('lg_name')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="words"
              style={inputStyle}
            />
          ) : null}

          <Animated.View entering={FadeInDown.duration(380).delay(120)}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('lg_email')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              style={inputStyle}
            />
          </Animated.View>

          {mode === 'register' ? (
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder={t('lg_phone')}
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={inputStyle}
            />
          ) : null}

          {mode === 'reset' ? (
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder={t('lg_ph_code')}
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={inputStyle}
            />
          ) : null}

          {mode !== 'forgot' ? (
            <Animated.View
              entering={FadeInDown.duration(380).delay(200)}
              style={[styles.passwordRow, { backgroundColor: theme.backgroundElement }]}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={mode === 'reset' ? t('lg_ph_newpass') : t('lg_password')}
                placeholderTextColor={theme.textSecondary}
                secureTextEntry={!showPassword}
                style={[styles.passwordInput, { color: theme.text }]}
              />
              <Pressable
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={10}
                style={styles.eyeBtn}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? t('lg_a11y_hide') : t('lg_a11y_show')}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={theme.textSecondary}
                />
              </Pressable>
            </Animated.View>
          ) : null}

          {mode === 'login' ? (
            <Pressable onPress={() => go('forgot')} style={styles.forgotLink}>
              <ThemedText type="small" style={{ color: Brand.accent }}>
                {t('lg_forgot')}
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
                {mode === 'login' ? t('lg_no_account') : t('lg_have_account')}
                <ThemedText type="smallBold" style={{ color: Brand.accent }}>
                  {mode === 'login' ? t('lg_signup_word') : t('lg_signin_word')}
                </ThemedText>
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable onPress={() => go('login')} style={styles.switch}>
              <ThemedText type="smallBold" style={{ color: Brand.accent }}>
                {t('lg_back_signin')}
              </ThemedText>
            </Pressable>
          )}

          {mode === 'register' ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {t('lg_register_note')}
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.three,
    paddingRight: Spacing.three,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  eyeBtn: { padding: Spacing.one },
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
