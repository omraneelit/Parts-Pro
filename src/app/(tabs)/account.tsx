import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';

const PLAN_LABEL: Record<string, string> = {
  monthly: 'Monthly — $8/mo',
  annual: 'Annual — $80/yr',
};

export default function AccountScreen() {
  const theme = useTheme();
  const { subscriber, isActive, logout, refresh } = useAuth();
  const [busy, setBusy] = useState(false);

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
          {!isActive ? (
            <ThemedText type="small" themeColor="textSecondary">
              Contact us to activate your membership and unlock member pricing.
            </ThemedText>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            PROFILE
          </ThemedText>
          <Field label="Name" value={subscriber?.name} />
          <Field label="Email" value={subscriber?.email} />
          <Field label="Phone" value={subscriber?.phone ?? '—'} />
          {subscriber?.start_date ? (
            <Field label="Member since" value={formatDate(subscriber.start_date)} />
          ) : null}
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
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  btn: { padding: Spacing.three, borderRadius: Spacing.three, alignItems: 'center' },
  logout: { backgroundColor: Brand.danger },
});
