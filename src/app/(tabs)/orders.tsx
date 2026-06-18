import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { tapLight } from '@/lib/haptics';
import { formatDate, formatMoney } from '@/lib/format';
import type { Order, Product } from '@/lib/types';

export default function OrdersScreen() {
  const theme = useTheme();
  const { token } = useAuth();
  const { t } = useI18n();
  const cart = useCart();
  const router = useRouter();

  // Rebuild cart lines from a past order and jump to the cart. Only items that
  // still carry a product_id can be re-added (custom/legacy lines are skipped);
  // the server reprices everything at checkout, so the snapshot price is just a
  // preview.
  const reorder = useCallback(
    (order: Order) => {
      const items = order.items ?? [];
      let added = 0;
      for (const it of items) {
        if (!it.product_id) continue;
        const product: Product = {
          id: it.product_id,
          name_en: it.name_en ?? it.name ?? t('ord_item_word'),
          retail_price: it.unit_price ?? 0,
          wholesale_price: null,
          member_price: it.unit_price ?? null,
        };
        cart.add(product, it.qty ?? 1);
        added += 1;
      }
      if (added > 0) {
        tapLight();
        router.push('/cart');
      }
    },
    [cart, router, t],
  );
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
      setError(e instanceof Error ? e.message : t('ord_load_err'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      {loading ? (
        <View style={styles.list}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.rowBetween}>
                <Skeleton width={120} height={14} />
                <Skeleton width={56} height={14} />
              </View>
              <Skeleton width="55%" height={12} />
              <Skeleton width="80%" height={12} />
            </View>
          ))}
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
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={Brand.accent}
              colors={[Brand.accent]}
            />
          }
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.duration(220).delay(Math.min(index, 12) * 40)}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.rowBetween}>
                <ThemedText type="smallBold">{t('ord_order_no', { id: item.id.slice(-6) })}</ThemedText>
                <ThemedText type="smallBold" style={{ color: Brand.success }}>
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
                    .map((it) => `${it.qty ?? 1}× ${it.name_en ?? it.name ?? t('ord_item_word')}`)
                    .join(', ')}
                </ThemedText>
              ) : null}
              {item.items?.some((it) => it.product_id) ? (
                <Pressable onPress={() => reorder(item)} style={styles.reorderBtn} hitSlop={6}>
                  <Ionicons name="repeat" size={15} color={Brand.accent} />
                  <ThemedText type="smallBold" style={{ color: Brand.accent }}>
                    {t('ord_reorder')}
                  </ThemedText>
                </Pressable>
              ) : null}
            </Animated.View>
          )}
          ListEmptyComponent={
            <Animated.View entering={FadeIn.duration(260)} style={styles.centered}>
              <Ionicons name="receipt-outline" size={48} color={theme.textSecondary} />
              <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
                {t('ord_empty_title')}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
                {t('ord_empty_sub')}
              </ThemedText>
            </Animated.View>
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
  reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: Spacing.one },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
});
