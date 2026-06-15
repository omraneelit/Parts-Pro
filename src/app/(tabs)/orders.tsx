import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import type { Order } from '@/lib/types';

export default function OrdersScreen() {
  const theme = useTheme();
  const { token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(await api.getOrders(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <ThemedText style={{ textAlign: 'center' }}>{error}</ThemedText>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.rowBetween}>
                <ThemedText type="smallBold">Order #{item.id.slice(-6)}</ThemedText>
                <ThemedText type="smallBold" style={{ color: '#2e9e5b' }}>
                  {formatMoney(item.total)}
                </ThemedText>
              </View>
              <View style={styles.rowBetween}>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDate(item.created_at)}
                </ThemedText>
                {item.status ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.status}
                  </ThemedText>
                ) : null}
              </View>
              {item.items && item.items.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {item.items
                    .map((it) => `${it.qty ?? 1}× ${it.name_en ?? it.name ?? 'item'}`)
                    .join(', ')}
                </ThemedText>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
                No orders yet
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Orders you place through Parts Pro will show up here.
              </ThemedText>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
});
