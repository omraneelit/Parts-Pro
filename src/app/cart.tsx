import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { formatMoney, regularWholesale } from '@/lib/format';

export default function CartScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token } = useAuth();
  const { lines, total, count, setQty, remove, clear } = useCart();
  const [placing, setPlacing] = useState(false);

  const placeOrder = async () => {
    if (!token || lines.length === 0) return;
    setPlacing(true);
    try {
      await api.placeOrder(
        token,
        lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
      );
      clear();
      Alert.alert('Order placed', 'Your order was sent. Track it on the Orders tab.', [
        {
          text: 'OK',
          onPress: () => {
            router.back();
            router.push('/orders');
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Could not place order', e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <FlatList
        data={lines}
        keyExtractor={(l) => l.product.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const unit = item.product.member_price ?? regularWholesale(item.product);
          return (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold" numberOfLines={2}>
                  {item.product.name_en}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatMoney(unit)} each
                </ThemedText>
              </View>
              <View style={styles.qtyRow}>
                <Pressable
                  onPress={() => setQty(item.product.id, item.qty - 1)}
                  style={[styles.qtyBtn, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">−</ThemedText>
                </Pressable>
                <ThemedText type="smallBold" style={styles.qtyText}>
                  {item.qty}
                </ThemedText>
                <Pressable
                  onPress={() => setQty(item.product.id, item.qty + 1)}
                  style={[styles.qtyBtn, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">+</ThemedText>
                </Pressable>
              </View>
              <Pressable onPress={() => remove(item.product.id)} style={styles.removeBtn} hitSlop={6}>
                <ThemedText type="small" style={{ color: Brand.danger }}>
                  Remove
                </ThemedText>
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              Your cart is empty
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Add parts from the Catalog to start an order.
            </ThemedText>
          </View>
        }
      />

      {count > 0 ? (
        <View style={[styles.footer, { borderTopColor: theme.backgroundElement }]}>
          <View style={styles.totalRow}>
            <ThemedText type="smallBold">Total</ThemedText>
            <ThemedText type="subtitle" style={{ color: Brand.success }}>
              {formatMoney(total)}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Final pricing is confirmed by the seller. Order is placed as pending.
          </ThemedText>
          <Pressable
            onPress={placeOrder}
            disabled={placing}
            style={[styles.placeBtn, placing && { opacity: 0.6 }]}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {placing ? 'Placing…' : 'Place order'}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { minWidth: 24, textAlign: 'center' },
  removeBtn: { paddingLeft: Spacing.two },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  footer: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderTopWidth: 1,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeBtn: {
    backgroundColor: Brand.accent,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
