import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaymentMethodsModal, type PaymentInfo } from '@/components/payment-methods';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type Lang } from '@/lib/i18n';
import { useThemeMode, type ThemePref } from '@/lib/theme-mode';
import { formatDate } from '@/lib/format';

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

// Whole numbers show bare ($8); fractional prices keep two decimals ($7.50).
const fmtPrice = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// Fallbacks match the backend defaults until /partspro/settings loads.
const DEFAULT_PRICES = { monthly: 8, annual: 80 };

export default function AccountScreen() {
  const theme = useTheme();
  const { token, subscriber, isActive, tier, logout, refresh } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { preference, setPreference } = useThemeMode();

  const THEME_OPTS: { key: ThemePref; label: string }[] = [
    { key: 'system', label: t('acc_theme_system') },
    { key: 'light', label: t('acc_theme_light') },
    { key: 'dark', label: t('acc_theme_dark') },
  ];

  const TIER_LABEL: Record<string, string> = {
    pro: t('acc_tier_pro'),
    trial: t('acc_tier_trial'),
    free: t('acc_tier_free'),
  };
  // Live plan prices + manual-payment numbers (admin-editable in the Control
  // App); falls back to the backend defaults until the settings call resolves.
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [payInfo, setPayInfo] = useState<PaymentInfo>({});
  const [payOpen, setPayOpen] = useState(false);
  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setPrices({ monthly: s.monthlyPrice, annual: s.annualPrice });
        setPayInfo({
          whishNumber: s.whishNumber,
          omtNumber: s.omtNumber,
          bobNumber: s.bobNumber,
          developerContact: s.developerContact,
        });
      })
      .catch(() => {});
  }, []);

  const PLAN_LABEL: Record<string, string> = {
    monthly: t('acc_plan_monthly', { price: fmtPrice(prices.monthly) }),
    annual: t('acc_plan_annual', { price: fmtPrice(prices.annual) }),
  };

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subscriber?.name ?? '');
  const [phone, setPhone] = useState(subscriber?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const redeemGift = async () => {
    if (!token || !code.trim()) return;
    setRedeeming(true);
    try {
      const res = await api.redeemCode(token, code.trim());
      await refresh();
      setCode('');
      const lines: string[] = [];
      if (res.vip_days > 0) lines.push(t('acc_redeem_days', { n: res.vip_days }));
      if (res.discount_percent > 0) lines.push(t('acc_redeem_disc', { n: res.discount_percent }));
      Alert.alert(t('acc_redeem_ok_title'), lines.join('\n'));
    } catch (e) {
      Alert.alert(t('error'), e instanceof ApiError ? e.message : t('acc_redeem_err'));
    } finally {
      setRedeeming(false);
    }
  };

  // Days until Pro lapses (renewal nudge) or the trial ends.
  const daysLeft = isActive ? daysUntil(subscriber?.expiry_date) : null;
  const expiringSoon = daysLeft !== null && daysLeft <= 7;
  const trialDaysLeft = tier === 'trial' ? daysUntil(subscriber?.trial_ends_at) : null;
  const renewLabel = tier === 'pro' ? t('acc_renew') : t('acc_upgrade');
  const highlight = tier === 'pro' || tier === 'trial';

  const onLogout = () => {
    Alert.alert(t('acc_logout'), t('acc_logout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('acc_logout'), style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const onRefresh = async () => {
    setBusy(true);
    await refresh();
    setBusy(false);
  };

  const startEdit = () => {
    setName(subscriber?.name ?? '');
    setPhone(subscriber?.phone ?? '');
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await api.updateProfile(token, { name: name.trim(), phone: phone.trim() });
      await refresh();
      setEditing(false);
    } catch (e) {
      Alert.alert(t('error'), e instanceof ApiError ? e.message : t('acc_save_err'));
    } finally {
      setSaving(false);
    }
  };

  // Upgrade / Renew: there is no card processor wired up, so we open the
  // manual-payment sheet (Whish / OMT / BOB numbers + developer contact) instead
  // of hitting a checkout endpoint that 500s. Numbers come from /partspro/settings.
  const renew = () => setPayOpen(true);

  // Both plan prices on one localized line for the payment sheet header.
  const planLine = `${t('acc_plan_monthly_opt', { price: fmtPrice(prices.monthly) })} · ${t('acc_plan_annual_opt', { price: fmtPrice(prices.annual) })}`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View
          entering={FadeInDown.duration(240)}
          style={[styles.statusCard, { backgroundColor: highlight ? Brand.successBg : theme.backgroundElement }]}>
          <ThemedText type="small" style={{ color: highlight ? Brand.successText : theme.textSecondary }}>
            {t('acc_plan')}
          </ThemedText>
          <ThemedText type="subtitle" style={{ color: highlight ? Brand.successText : theme.text }}>
            {TIER_LABEL[tier] ?? t('acc_tier_free')}
          </ThemedText>
          {tier === 'pro' && subscriber?.plan ? (
            <ThemedText themeColor="textSecondary">{PLAN_LABEL[subscriber.plan] ?? subscriber.plan}</ThemedText>
          ) : null}
          {tier === 'pro' && subscriber?.expiry_date ? (
            <ThemedText themeColor="textSecondary">
              {t('acc_renews_expires', { date: formatDate(subscriber.expiry_date) })}
            </ThemedText>
          ) : null}
          {expiringSoon ? (
            <ThemedText type="smallBold" style={{ color: Brand.danger }}>
              {daysLeft && daysLeft > 0 ? t('acc_expires_in', { n: daysLeft }) : t('acc_expires_today')}
            </ThemedText>
          ) : null}
          {tier === 'trial' ? (
            <ThemedText type="smallBold" style={{ color: Brand.successText }}>
              {trialDaysLeft && trialDaysLeft > 0 ? t('acc_trial_left', { n: trialDaysLeft }) : t('acc_trial_last')}
            </ThemedText>
          ) : null}
          {tier === 'free' ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('acc_free_blurb')}
            </ThemedText>
          ) : null}
          {tier !== 'pro' ? (
            <ThemedText type="small" style={{ color: highlight ? Brand.successText : theme.textSecondary }}>
              {t('acc_plan_monthly', { price: fmtPrice(prices.monthly) })} · {t('acc_plan_annual', { price: fmtPrice(prices.annual) })}
            </ThemedText>
          ) : null}
          <PressableScale onPress={renew} style={styles.renewBtn}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {renewLabel}
            </ThemedText>
          </PressableScale>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(240).delay(60)}
          style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('acc_redeem_title')}
          </ThemedText>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={t('acc_redeem_ph')}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
          />
          <PressableScale
            onPress={redeemGift}
            disabled={redeeming || !code.trim()}
            style={[styles.renewBtn, (redeeming || !code.trim()) && { opacity: 0.6 }]}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {redeeming ? t('acc_redeem_busy') : t('acc_redeem_btn')}
            </ThemedText>
          </PressableScale>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(240).delay(80)}
          style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.cardHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('acc_profile')}
            </ThemedText>
            {!editing ? (
              <Pressable onPress={startEdit}>
                <ThemedText type="smallBold" style={{ color: Brand.accent }}>
                  {t('acc_edit')}
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          {editing ? (
            <>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('acc_ph_name')}
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder={t('acc_ph_phone')}
                placeholderTextColor={theme.textSecondary}
                keyboardType="phone-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              />
              <View style={styles.editActions}>
                <Pressable onPress={() => setEditing(false)} style={[styles.smallBtn, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">{t('cancel')}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={saveProfile}
                  disabled={saving}
                  style={[styles.smallBtn, { backgroundColor: Brand.accent }, saving && { opacity: 0.6 }]}>
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    {saving ? t('acc_saving') : t('save')}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Field label={t('acc_field_name')} value={subscriber?.name} />
              <Field label={t('acc_field_email')} value={subscriber?.email} />
              <Field label={t('acc_field_phone')} value={subscriber?.phone ?? '—'} />
              {subscriber?.start_date ? (
                <Field label={t('acc_field_since')} value={formatDate(subscriber.start_date)} />
              ) : null}
            </>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(240).delay(140)}
          style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('acc_appearance')}
          </ThemedText>
          <View style={styles.langRow}>
            {THEME_OPTS.map((opt) => {
              const sel = preference === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setPreference(opt.key)}
                  style={[styles.langBtn, { backgroundColor: sel ? Brand.accent : theme.background }]}>
                  <ThemedText type="smallBold" style={{ color: sel ? '#fff' : theme.text }}>
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(240).delay(180)}
          style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('acc_language')}
          </ThemedText>
          <View style={styles.langRow}>
            {(['en', 'ar'] as Lang[]).map((l) => {
              const sel = lang === l;
              return (
                <Pressable
                  key={l}
                  onPress={() => setLang(l)}
                  style={[
                    styles.langBtn,
                    { backgroundColor: sel ? Brand.accent : theme.background },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: sel ? '#fff' : theme.text }}>
                    {l === 'en' ? t('acc_lang_en') : t('acc_lang_ar')}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        <PressableScale onPress={onRefresh} disabled={busy} style={[styles.btn, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{busy ? t('acc_refreshing') : t('acc_refresh')}</ThemedText>
        </PressableScale>

        <PressableScale onPress={onLogout} style={[styles.btn, styles.logout]}>
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            {t('acc_logout')}
          </ThemedText>
        </PressableScale>
      </ScrollView>

      <PaymentMethodsModal
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        info={payInfo}
        planLine={planLine}
      />
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.field}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold">{value || '—'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  statusCard: { padding: Spacing.four, borderRadius: Spacing.three, gap: Spacing.one },
  renewBtn: {
    marginTop: Spacing.three,
    backgroundColor: Brand.accent,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  editActions: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'flex-end' },
  smallBtn: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: Spacing.two },
  btn: { padding: Spacing.three, borderRadius: Spacing.three, alignItems: 'center' },
  logout: { backgroundColor: Brand.danger },
  langRow: { flexDirection: 'row', gap: Spacing.two },
  langBtn: { flex: 1, paddingVertical: Spacing.three, borderRadius: Spacing.two, alignItems: 'center' },
});
