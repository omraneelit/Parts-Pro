import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ProductSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { formatMoney, regularWholesale } from '@/lib/format';
import type { Category, Product } from '@/lib/types';

type SearchMode = 'part' | 'device';

export default function CatalogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token, isMember, tier, subscriber } = useAuth();
  const cart = useCart();

  // Bump the cart bar whenever the item count changes (tactile "added" feedback).
  const bump = useSharedValue(1);
  useEffect(() => {
    if (cart.count > 0) {
      bump.value = withSequence(withTiming(1.06, { duration: 110 }), withTiming(1, { duration: 130 }));
    }
  }, [cart.count, bump]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  const [discountPct, setDiscountPct] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('part');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inactive, setInactive] = useState(false);

  const reqId = useRef(0);
  const pageRef = useRef(1);
  // Keep the latest search in refs so the focus refetch uses the current query
  // instead of a stale closure (otherwise refocus silently resets to the full list).
  const queryRef = useRef(query);
  queryRef.current = query;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const catRef = useRef<string | null>(selectedCat);
  catRef.current = selectedCat;

  const load = useCallback(
    async (q: string, m: SearchMode) => {
      if (!token) return;
      const id = ++reqId.current;
      pageRef.current = 1;
      setLoading(true);
      setError(null);
      try {
        const params = m === 'device' ? { device: q } : { q };
        const data = await api.getCatalog(token, {
          ...params,
          category_id: catRef.current ?? undefined,
          page: 1,
        });
        if (id === reqId.current) {
          setProducts(data);
          setHasMore(data.length === api.CATALOG_PAGE_SIZE);
          setInactive(false);
        }
      } catch (e) {
        if (id !== reqId.current) return;
        if (e instanceof ApiError && e.status === 402) {
          setInactive(true);
          setProducts([]);
          setHasMore(false);
        } else {
          setError(e instanceof Error ? e.message : 'Something went wrong');
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [token],
  );

  // Append the next page when the list nears its end.
  const loadMore = useCallback(async () => {
    if (!token || loadingMore || !hasMore || loading) return;
    const id = reqId.current; // tie to the active search; abort if it changes
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const m = modeRef.current;
      const q = queryRef.current.trim();
      const params = m === 'device' ? { device: q } : { q };
      const data = await api.getCatalog(token, {
        ...params,
        category_id: catRef.current ?? undefined,
        page: nextPage,
      });
      if (id === reqId.current) {
        pageRef.current = nextPage;
        setProducts((prev) => [...prev, ...data]);
        setHasMore(data.length === api.CATALOG_PAGE_SIZE);
      }
    } catch {
      /* keep what we have; user can pull to refresh */
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, loading]);

  // Refetch whenever the tab regains focus so stock/prices stay live (v1: no
  // websockets — focus refetch is enough, per the build plan).
  useFocusEffect(
    useCallback(() => {
      load(queryRef.current.trim(), modeRef.current);
    }, [load]),
  );

  // The member-discount percent (for the upgrade banner copy).
  useEffect(() => {
    api
      .getSettings()
      .then((s) => setDiscountPct(s.proDiscountPercent))
      .catch(() => {});
    api
      .getCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  const setCategory = (id: string | null) => {
    setSelectedCat(id);
    catRef.current = id;
    load(query.trim(), mode);
  };

  const addToCart = (item: Product) => {
    cart.add(item);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(`Added ${item.name_en}`);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const trialDaysLeft =
    tier === 'trial' && subscriber?.trial_ends_at
      ? Math.ceil((new Date(subscriber.trial_ends_at).getTime() - Date.now()) / 86400000)
      : null;

  const onSubmit = () => load(query.trim(), mode);

  const switchMode = (m: SearchMode) => {
    setMode(m);
    load(query.trim(), m);
  };

  // Live search: debounce typing so results update without hitting Enter. Skip
  // the initial mount (the focus effect already does the first load).
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const t = setTimeout(() => load(query.trim(), modeRef.current), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, load]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoCorrect={false}
            placeholder={mode === 'device' ? 'Search device model, e.g. iPhone 13' : 'Search part name or SKU'}
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.segment}>
          {(['part', 'device'] as SearchMode[]).map((m) => {
            const selected = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: selected ? Brand.accent : theme.backgroundElement,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={{ color: selected ? '#fff' : theme.textSecondary }}>
                  {m === 'part' ? 'Part / SKU' : 'Device model'}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {[{ id: '', name_en: 'All' }, ...categories].map((c, i) => {
            const id = c.id || null;
            const selected = selectedCat === id;
            return (
              <Animated.View key={c.id || 'all'} entering={FadeIn.duration(200).delay(Math.min(i, 10) * 30)}>
                <PressableScale
                  onPress={() => setCategory(id)}
                  down={0.94}
                  style={[
                    styles.chip,
                    { backgroundColor: selected ? Brand.accent : theme.backgroundElement },
                  ]}>
                  <ThemedText type="small" style={{ color: selected ? '#fff' : theme.textSecondary }}>
                    {c.name_en}
                  </ThemedText>
                </PressableScale>
              </Animated.View>
            );
          })}
        </ScrollView>
      ) : null}

      {tier === 'free' ? (
        <Pressable onPress={() => router.push('/account')} style={[styles.banner, { backgroundColor: Brand.accent }]}>
          <ThemedText type="small" style={{ color: '#fff', flex: 1 }}>
            {discountPct != null
              ? `Pro members save ${discountPct}% on every order. Upgrade →`
              : 'Upgrade to Pro for member pricing →'}
          </ThemedText>
        </Pressable>
      ) : trialDaysLeft != null && trialDaysLeft <= 2 ? (
        <Pressable onPress={() => router.push('/account')} style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" style={{ flex: 1 }}>
            {trialDaysLeft > 0
              ? `Your trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} — subscribe to keep member pricing →`
              : 'Your trial ends today — subscribe to keep member pricing →'}
          </ThemedText>
        </Pressable>
      ) : null}

      {inactive ? (
        <Centered>
          <ThemedText type="subtitle" style={styles.center}>
            Membership inactive
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Your Parts Pro subscription isn&apos;t active yet. Once activated you&apos;ll see the
            live member catalog with discounted prices.
          </ThemedText>
        </Centered>
      ) : error ? (
        <Centered>
          <ThemedText style={styles.center}>{error}</ThemedText>
          <Pressable onPress={onSubmit} style={styles.retry}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              Retry
            </ThemedText>
          </Pressable>
        </Centered>
      ) : loading && products.length === 0 ? (
        <View style={styles.list}>
          {Array.from({ length: 7 }).map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <ProductRow
              product={item}
              index={index}
              showMember={isMember}
              onAdd={() => addToCart(item)}
            />
          )}
          ListEmptyComponent={
            <Centered>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                No parts found. Try a different search.
              </ThemedText>
            </Centered>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator />
              </View>
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshing={loading}
          onRefresh={onSubmit}
        />
      )}

      {toast ? (
        <Animated.View
          key={toast}
          entering={FadeInDown.duration(200)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.toast, { bottom: cart.count > 0 ? 78 : Spacing.four }]}
          pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color="#fff" />
          <ThemedText type="small" style={{ color: '#fff' }} numberOfLines={1}>
            {toast}
          </ThemedText>
        </Animated.View>
      ) : null}

      {cart.count > 0 ? (
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          exiting={SlideOutDown.duration(180)}
          style={[styles.cartBarWrap, bumpStyle]}>
          <Pressable style={styles.cartBar} onPress={() => router.push('/cart')}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              View cart · {cart.count} item{cart.count === 1 ? '' : 's'}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {formatMoney(cart.total)}
            </ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

function ProductRow({
  product,
  index,
  showMember,
  onAdd,
}: {
  product: Product;
  index: number;
  showMember: boolean;
  onAdd: () => void;
}) {
  const theme = useTheme();
  const regular = regularWholesale(product);
  const member = product.member_price;
  const hasMember = showMember && member !== null && member !== undefined && regular !== null;
  const savings =
    hasMember && regular && regular > 0 ? Math.round((1 - (member as number) / regular) * 100) : 0;

  const stockLabel =
    product.stock_qty === null || product.stock_qty === undefined
      ? product.in_stock === false
        ? 'Out of stock'
        : 'In stock'
      : product.stock_qty > 0
        ? `${product.stock_qty} in stock`
        : 'Out of stock';
  const out = stockLabel === 'Out of stock';

  return (
    <Animated.View
      entering={FadeInDown.duration(220).delay(Math.min(index, 12) * 35)}
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      {product.image ? (
        <Image source={{ uri: product.image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]} />
      )}
      <View style={styles.cardBody}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {product.name_en}
        </ThemedText>
        {product.sku ? (
          <ThemedText type="small" themeColor="textSecondary">
            SKU {product.sku}
          </ThemedText>
        ) : null}
        {product.compatible_models && product.compatible_models.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            Fits: {product.compatible_models.join(', ')}
          </ThemedText>
        ) : null}
        <ThemedText
          type="small"
          style={{ color: out ? Brand.danger : Brand.success }}>
          {stockLabel}
        </ThemedText>
      </View>
      <View style={styles.priceCol}>
        {hasMember ? (
          <>
            <ThemedText type="smallBold" style={{ color: Brand.success }}>
              {formatMoney(member)}
            </ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.strike}>
              {formatMoney(regular)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {savings > 0 ? `member · save ${savings}%` : 'member'}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="smallBold">{formatMoney(regular)}</ThemedText>
        )}
        {showMember && !out ? (
          <PressableScale onPress={onAdd} style={styles.addBtn} hitSlop={6} down={0.9}>
            <ThemedText type="small" style={{ color: '#fff' }}>
              + Add
            </ThemedText>
          </PressableScale>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { padding: Spacing.three, gap: Spacing.two },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  searchInput: { flex: 1, paddingVertical: Spacing.three, fontSize: 16 },
  banner: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  segment: { flexDirection: 'row', gap: Spacing.two },
  chips: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.two },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two },
  card: {
    flexDirection: 'row',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
    alignItems: 'center',
  },
  thumb: { width: 56, height: 56, borderRadius: Spacing.two },
  cardBody: { flex: 1, gap: 2 },
  priceCol: { alignItems: 'flex-end', minWidth: 84, gap: 2 },
  strike: { textDecorationLine: 'line-through' },
  addBtn: {
    marginTop: 4,
    backgroundColor: Brand.accent,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  cartBarWrap: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: '86%',
    backgroundColor: 'rgba(20,26,38,0.95)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
  },
  cartBar: {
    backgroundColor: Brand.accent,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  center: { textAlign: 'center' },
  footer: { paddingVertical: Spacing.three },
  retry: {
    backgroundColor: Brand.accent,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
});
