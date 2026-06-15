import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export default function AccountScreen() {
  const theme = useTheme();
  const { token, subscriber, isActive, logout, refresh } = useAuth();

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subscriber?.name ?? '');
  const [phone, setPhone] = useState(subscriber?.phone ?? '');
  const [saving, setSaving] = useState(false);

  // Days until the membership lapses (for an "expiring soon" nudge).
  const daysLeft =
    isActive && subscriber?.expiry_date
      ? Math.ceil((new Date(subscriber.expiry_date).getTime() - Date.now()) / 86400000)
      : null;
  const expiringSoon = daysLeft !== null && daysLeft <= 7;

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
        <View style={[styles.statusCard, { backgroundColor: isActive ? Brand.successBg : theme.backgroundElement }]}>
          <ThemedText type="small" style={{ color: isActive ? Brand.successText : theme.textSecondary }}>
            SUBSCRIPTION
          </ThemedText>
          <ThemedText type="subtitle" style={{ color: isActive ? Brand.successText : theme.text }}>
            {isActive ? 'Pro — Active' : 'Inactive'}
          </ThemedText>
          {subscriber?.plan ? (
            <ThemedText themeColor="textSecondary">{PLAN_LABEL[subscriber.plan] ?? subscriber.plan}</ThemedText>
          ) : null}
          {isActive && subscriber?.expiry_date ? (
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
          {!isActive ? (
            <ThemedText type="small" themeColor="textSecondary">
              Activate your membership to unlock member pricing.
            </ThemedText>
          ) : null}
          <Pressable onPress={renew} style={styles.renewBtn}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {isActive ? 'Renew / extend' : 'Activate membership'}
            </ThemedText>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
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
        </View>

        <Pressable onPress={onRefresh} disabled={busy} style={[styles.btn, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{busy ? 'Refreshing…' : 'Refresh status'}</ThemedText>
        </Pressable>

        <Pressable onPress={onLogout} style={[styles.btn, styles.logout]}>
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            Log out
          </ThemedText>
        </Pressable>
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
