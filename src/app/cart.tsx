import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { formatMoney, regularWholesale } from '@/lib/format';
import { notifyError, notifySuccess, tapLight, tapSelection } from '@/lib/haptics';

export default function CartScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useI18n();
  const { lines, total, count, setQty, remove, clear } = useCart();
  const [placing, setPlacing] = useState(false);

  // Pop the total whenever it changes.
  const totalScale = useSharedValue(1);
  useEffect(() => {
    totalScale.value = withSequence(withTiming(1.07, { duration: 110 }), withTiming(1, { duration: 130 }));
  }, [total, totalScale]);
  const totalStyle = useAnimatedStyle(() => ({ transform: [{ scale: totalScale.value }] }));

  const changeQty = (productId: string, qty: number) => {
    tapSelection();
    setQty(productId, qty);
  };
  const removeLine = (productId: string) => {
    tapLight();
    remove(productId);
  };

  const placeOrder = async () => {
    if (!token || lines.length === 0) return;
    setPlacing(true);
    try {
      await api.placeOrder(
        token,
        lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
      );
      clear();
      notifySuccess();
      Alert.alert(t('cart_placed_title'), t('cart_placed_msg'), [
        {
          text: t('ok'),
          onPress: () => {
            router.back();
            router.push('/orders');
          },
        },
      ]);
    } catch (e) {
      notifyError();
      Alert.alert(t('cart_place_err'), e instanceof ApiError ? e.message : t('try_again'));
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
            <Animated.View
              entering={FadeIn.duration(180)}
              exiting={FadeOut.duration(180)}
              layout={LinearTransition.springify().damping(18)}
              style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold" numberOfLines={2}>
                  {item.product.name_en}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('cart_each', { price: formatMoney(unit) })}
                </ThemedText>
              </View>
              <View style={styles.qtyRow}>
                <Pressable
                  onPress={() => changeQty(item.product.id, item.qty - 1)}
                  style={[styles.qtyBtn, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">−</ThemedText>
                </Pressable>
                <ThemedText type="smallBold" style={styles.qtyText}>
                  {item.qty}
                </ThemedText>
                <Pressable
                  onPress={() => changeQty(item.product.id, item.qty + 1)}
                  style={[styles.qtyBtn, { backgroundColor: theme.background }]}>
                  <ThemedText type="smallBold">+</ThemedText>
                </Pressable>
              </View>
              <Pressable onPress={() => removeLine(item.product.id)} style={styles.removeBtn} hitSlop={6}>
                <ThemedText type="small" style={{ color: Brand.danger }}>
                  {t('cart_remove')}
                </ThemedText>
              </Pressable>
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          <Animated.View entering={FadeIn.duration(260)} style={styles.empty}>
            <Ionicons name="cart-outline" size={52} color={theme.textSecondary} />
            <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
              {t('cart_empty_title')}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {t('cart_empty_sub')}
            </ThemedText>
          </Animated.View>
        }
      />

      {count > 0 ? (
        <View style={[styles.footer, { borderTopColor: theme.backgroundElement }]}>
          <View style={styles.totalRow}>
            <ThemedText type="smallBold">{t('cart_total')}</ThemedText>
            <Animated.View style={totalStyle}>
              <ThemedText type="subtitle" style={{ color: Brand.success }}>
                {formatMoney(total)}
              </ThemedText>
            </Animated.View>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {t('cart_disclaimer')}
          </ThemedText>
          <PressableScale
            onPress={placeOrder}
            disabled={placing}
            style={[styles.placeBtn, placing && { opacity: 0.6 }]}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {placing ? t('cart_placing') : t('cart_place')}
            </ThemedText>
          </PressableScale>
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
