import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';

const PLAN_LABEL: Record<string, string> = {
  monthly: 'Monthly — $8/mo',
  annual: 'Annual — $80/yr',
};

const TIER_LABEL: Record<string, string> = {
  pro: 'Pro — Active',
  trial: 'Free trial',
  free: 'Free plan',
};

function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function AccountScreen() {
  const theme = useTheme();
  const { token, subscriber, isActive, tier, logout, refresh } = useAuth();

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subscriber?.name ?? '');
  const [phone, setPhone] = useState(subscriber?.phone ?? '');
  const [saving, setSaving] = useState(false);

  // Days until Pro lapses (renewal nudge) or the trial ends.
  const daysLeft = isActive ? daysUntil(subscriber?.expiry_date) : null;
  const expiringSoon = daysLeft !== null && daysLeft <= 7;
  const trialDaysLeft = tier === 'trial' ? daysUntil(subscriber?.trial_ends_at) : null;
  const renewLabel = tier === 'pro' ? 'Renew / extend' : 'Upgrade to Pro';
  const highlight = tier === 'pro' || tier === 'trial';

  const onLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
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
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  // Renew: use self-serve Stripe checkout when the backend has billing enabled,
  // otherwise fall back to a manual-payment prompt.
  const renew = async () => {
    if (!token) return;
    let enabled = false;
    try {
      enabled = (await api.getBillingStatus()).enabled;
    } catch {
      enabled = false;
    }
    if (!enabled) {
      Alert.alert(
        'Renew membership',
        'Contact us to activate or renew your Parts Pro membership (cash or manual payment).',
      );
      return;
    }
    Alert.alert('Choose a plan', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Monthly ($8)', onPress: () => void checkout('monthly') },
      { text: 'Annual ($80)', onPress: () => void checkout('annual') },
    ]);
  };

  const checkout = async (plan: 'monthly' | 'annual') => {
    if (!token) return;
    try {
      const { url } = await api.startCheckout(token, plan);
      if (url) await WebBrowser.openBrowserAsync(url);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not start checkout');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View
          entering={FadeInDown.duration(240)}
          style={[styles.statusCard, { backgroundColor: highlight ? Brand.successBg : theme.backgroundElement }]}>
          <ThemedText type="small" style={{ color: highlight ? Brand.successText : theme.textSecondary }}>
            PLAN
          </ThemedText>
          <ThemedText type="subtitle" style={{ color: highlight ? Brand.successText : theme.text }}>
            {TIER_LABEL[tier] ?? 'Free plan'}
          </ThemedText>
          {tier === 'pro' && subscriber?.plan ? (
            <ThemedText themeColor="textSecondary">{PLAN_LABEL[subscriber.plan] ?? subscriber.plan}</ThemedText>
          ) : null}
          {tier === 'pro' && subscriber?.expiry_date ? (
            <ThemedText themeColor="textSecondary">
              Renews / expires {formatDate(subscriber.expiry_date)}
            </ThemedText>
          ) : null}
          {expiringSoon ? (
            <ThemedText type="smallBold" style={{ color: Brand.danger }}>
              {daysLeft && daysLeft > 0
                ? `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — renew to keep member pricing.`
                : 'Expires today — renew to keep member pricing.'}
            </ThemedText>
          ) : null}
          {tier === 'trial' ? (
            <ThemedText type="smallBold" style={{ color: Brand.successText }}>
              {trialDaysLeft && trialDaysLeft > 0
                ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left of full Pro access`
                : 'Last day of your trial'}
            </ThemedText>
          ) : null}
          {tier === 'free' ? (
            <ThemedText type="small" themeColor="textSecondary">
              Upgrade to Pro for member pricing, unlimited quotes, and saved settings.
            </ThemedText>
          ) : null}
          <PressableScale onPress={renew} style={styles.renewBtn}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {renewLabel}
            </ThemedText>
          </PressableScale>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(240).delay(80)}
          style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.cardHeader}>
            <ThemedText type="small" themeColor="textSecondary">
              PROFILE
            </ThemedText>
            {!editing ? (
              <Pressable onPress={startEdit}>
                <ThemedText type="smallBold" style={{ color: Brand.accent }}>
                  Edit
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          {editing ? (
            <>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone"
                placeholderTextColor={theme.textSecondary}
                keyboardType="phone-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              />
              <View style={styles.editActions}>
                <Pressable onPress={() => setEditing(false)} style={[styles.smallBtn, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">Cancel</ThemedText>
                </Pressable>
                <Pressable
                  onPress={saveProfile}
                  disabled={saving}
                  style={[styles.smallBtn, { backgroundColor: Brand.accent }, saving && { opacity: 0.6 }]}>
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    {saving ? 'Saving…' : 'Save'}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Field label="Name" value={subscriber?.name} />
              <Field label="Email" value={subscriber?.email} />
              <Field label="Phone" value={subscriber?.phone ?? '—'} />
              {subscriber?.start_date ? (
                <Field label="Member since" value={formatDate(subscriber.start_date)} />
              ) : null}
            </>
          )}
        </Animated.View>

        <PressableScale onPress={onRefresh} disabled={busy} style={[styles.btn, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{busy ? 'Refreshing…' : 'Refresh status'}</ThemedText>
        </PressableScale>

        <PressableScale onPress={onLogout} style={[styles.btn, styles.logout]}>
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            Log out
          </ThemedText>
        </PressableScale>
      </ScrollView>
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
});
