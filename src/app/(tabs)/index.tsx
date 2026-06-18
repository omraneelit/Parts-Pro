import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
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

import { BarcodeScanner } from '@/components/barcode-scanner';
import { PressableScale } from '@/components/pressable-scale';
import { ProductSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { readCatalogCache, saveCatalogCache } from '@/lib/catalog-cache';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { useI18n } from '@/lib/i18n';
import { formatMoney, regularWholesale } from '@/lib/format';
import { tapLight, tapSelection } from '@/lib/haptics';
import type { Category, Product } from '@/lib/types';

type SearchMode = 'part' | 'device';

export default function CatalogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token, isMember, tier, subscriber } = useAuth();
  const { t, isAr } = useI18n();
  const cart = useCart();
  const favorites = useFavorites();

  // Favorites view: when on, the list shows the subscriber's saved parts instead
  // of search results.
  const [showFavorites, setShowFavorites] = useState(false);
  const [favProducts, setFavProducts] = useState<Product[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

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
  const [offline, setOffline] = useState(false);

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
      // The default browse (no query, no category) is the view we cache for offline.
      const isDefaultBrowse = !q.trim() && !catRef.current;
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
          setOffline(false);
        }
        if (isDefaultBrowse) void saveCatalogCache(data);
      } catch (e) {
        if (id !== reqId.current) return;
        if (e instanceof ApiError && e.status === 402) {
          setInactive(true);
          setProducts([]);
          setHasMore(false);
        } else {
          // Network failure on the default browse: fall back to the last-known
          // catalog so the tab isn't empty in the field. Searches still error.
          const cached = isDefaultBrowse ? await readCatalogCache() : null;
          if (id !== reqId.current) return;
          if (cached) {
            setProducts(cached);
            setHasMore(false);
            setOffline(true);
          } else {
            setError(e instanceof Error ? e.message : 'Something went wrong');
          }
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
    tapSelection();
    setSelectedCat(id);
    catRef.current = id;
    load(query.trim(), mode);
  };

  const addToCart = (item: Product) => {
    cart.add(item);
    tapLight();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t('cat_added', { name: item.name_en }));
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

  const enterFavorites = useCallback(() => {
    if (!token) return;
    setShowFavorites(true);
    setFavLoading(true);
    api
      .getFavorites(token)
      .then(setFavProducts)
      .catch(() => setFavProducts([]))
      .finally(() => setFavLoading(false));
  }, [token]);

  const toggleFavoritesView = () => {
    tapSelection();
    if (showFavorites) setShowFavorites(false);
    else enterFavorites();
  };

  const onScanned = (code: string) => {
    setScanOpen(false);
    setShowFavorites(false);
    setMode('part');
    setQuery(code);
    load(code, 'part');
  };

  // Parts shown in the Favorites view, kept in sync if the user unfavorites one.
  const favView = favProducts.filter((p) => favorites.isFavorite(p.id));

  const switchMode = (m: SearchMode) => {
    tapSelection();
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
            placeholder={mode === 'device' ? t('cat_search_device') : t('cat_search_part')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }, isAr && { textAlign: 'right' }]}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => setScanOpen(true)} hitSlop={8}>
            <Ionicons name="barcode-outline" size={20} color={Brand.accent} />
          </Pressable>
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
                  {m === 'part' ? t('cat_mode_part') : t('cat_mode_device')}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}>
        <PressableScale
          onPress={toggleFavoritesView}
          down={0.94}
          style={[
            styles.chip,
            styles.favChip,
            { backgroundColor: showFavorites ? Brand.accent : theme.backgroundElement },
          ]}>
          <Ionicons
            name={showFavorites ? 'heart' : 'heart-outline'}
            size={14}
            color={showFavorites ? '#fff' : Brand.danger}
          />
          <ThemedText type="small" style={{ color: showFavorites ? '#fff' : theme.textSecondary }}>
            {t('cat_favorites')}
          </ThemedText>
        </PressableScale>
        {categories.length > 0 ? (
          [{ id: '', name_en: 'All' }, ...categories].map((c, i) => {
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
                    {c.id ? c.name_en : t('cat_all')}
                  </ThemedText>
                </PressableScale>
              </Animated.View>
            );
          })
        ) : null}
      </ScrollView>

      {tier === 'free' ? (
        <Pressable onPress={() => router.push('/account')} style={[styles.banner, { backgroundColor: Brand.accent }]}>
          <ThemedText type="small" style={{ color: '#fff', flex: 1 }}>
            {discountPct != null ? t('cat_banner_save', { pct: discountPct }) : t('cat_banner_upgrade')}
          </ThemedText>
        </Pressable>
      ) : trialDaysLeft != null && trialDaysLeft <= 2 ? (
        <Pressable onPress={() => router.push('/account')} style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" style={{ flex: 1 }}>
            {trialDaysLeft > 0 ? t('cat_trial_ends_in', { n: trialDaysLeft }) : t('cat_trial_ends_today')}
          </ThemedText>
        </Pressable>
      ) : null}

      {offline ? (
        <View style={[styles.offlineBar, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('cat_offline')}
          </ThemedText>
        </View>
      ) : null}

      {inactive ? (
        <Centered>
          <ThemedText type="subtitle" style={styles.center}>
            {t('cat_inactive_title')}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {t('cat_inactive_body')}
          </ThemedText>
        </Centered>
      ) : error ? (
        <Centered>
          <ThemedText style={styles.center}>{error}</ThemedText>
          <Pressable onPress={onSubmit} style={styles.retry}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {t('retry')}
            </ThemedText>
          </Pressable>
        </Centered>
      ) : (showFavorites ? favLoading : loading) && (showFavorites ? favView : products).length === 0 ? (
        <View style={styles.list}>
          {Array.from({ length: 7 }).map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={showFavorites ? favView : products}
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
            <Animated.View entering={FadeIn.duration(260)} style={styles.centered}>
              <Ionicons
                name={showFavorites ? 'heart-outline' : 'cube-outline'}
                size={48}
                color={theme.textSecondary}
              />
              <ThemedText themeColor="textSecondary" style={styles.center}>
                {showFavorites ? t('cat_fav_empty') : t('cat_empty')}
              </ThemedText>
            </Animated.View>
          }
          ListFooterComponent={
            loadingMore && !showFavorites ? (
              <View style={styles.footer}>
                <ActivityIndicator color={Brand.accent} />
              </View>
            ) : null
          }
          onEndReached={showFavorites ? undefined : loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={showFavorites ? favLoading : loading}
              onRefresh={showFavorites ? enterFavorites : onSubmit}
              tintColor={Brand.accent}
              colors={[Brand.accent]}
            />
          }
        />
      )}

      <BarcodeScanner visible={scanOpen} onScan={onScanned} onClose={() => setScanOpen(false)} />

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
              {t('cat_view_cart', { n: cart.count })}
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
  const { t } = useI18n();
  const { token } = useAuth();
  const favorites = useFavorites();
  const faved = favorites.isFavorite(product.id);
  const [notified, setNotified] = useState(false);
  const regular = regularWholesale(product);
  const member = product.member_price;
  const hasMember = showMember && member !== null && member !== undefined && regular !== null;
  const savings =
    hasMember && regular && regular > 0 ? Math.round((1 - (member as number) / regular) * 100) : 0;

  const out =
    product.stock_qty === null || product.stock_qty === undefined
      ? product.in_stock === false
      : product.stock_qty <= 0;
  const stockLabel = out
    ? t('cat_out_stock')
    : product.stock_qty === null || product.stock_qty === undefined
      ? t('cat_in_stock')
      : t('cat_n_in_stock', { n: product.stock_qty });

  return (
    <Animated.View
      entering={FadeInDown.duration(220).delay(Math.min(index, 12) * 35)}
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      {product.image ? (
        <Image source={{ uri: product.image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]} />
      )}
      <Pressable
        onPress={() => {
          tapLight();
          favorites.toggle(product.id);
        }}
        hitSlop={8}
        style={styles.favHeart}
        accessibilityRole="button">
        <Ionicons name={faved ? 'heart' : 'heart-outline'} size={20} color={faved ? Brand.danger : theme.textSecondary} />
      </Pressable>
      <View style={styles.cardBody}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {product.name_en}
        </ThemedText>
        {product.sku ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('cat_sku', { sku: product.sku })}
          </ThemedText>
        ) : null}
        {product.compatible_models && product.compatible_models.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {t('cat_fits', { models: product.compatible_models.join(', ') })}
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
              {savings > 0 ? t('cat_member_save', { pct: savings }) : t('cat_member')}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="smallBold">{formatMoney(regular)}</ThemedText>
        )}
        {out ? (
          <PressableScale
            onPress={() => {
              if (notified || !token) return;
              setNotified(true);
              tapLight();
              api.notifyWhenInStock(token, product.id).catch(() => setNotified(false));
            }}
            style={[styles.notifyBtn, { borderColor: Brand.accent }]}
            hitSlop={6}
            down={0.9}>
            <Ionicons
              name={notified ? 'checkmark' : 'notifications-outline'}
              size={13}
              color={Brand.accent}
            />
            <ThemedText type="small" style={{ color: Brand.accent }}>
              {notified ? t('cat_notify_set') : t('cat_notify_me')}
            </ThemedText>
          </PressableScale>
        ) : showMember ? (
          <PressableScale onPress={onAdd} style={styles.addBtn} hitSlop={6} down={0.9}>
            <ThemedText type="small" style={{ color: '#fff' }}>
              {t('cat_add')}
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
  offlineBar: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
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
  // Keep the chip row at its natural height — without this the horizontal
  // ScrollView gets vertically shrunk by the list below and the labels clip.
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
  },
  favChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  favHeart: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    padding: 3,
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
  notifyBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
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
