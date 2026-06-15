import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney, regularWholesale } from '@/lib/format';
import type { Product } from '@/lib/types';

type SearchMode = 'part' | 'device';

export default function CatalogScreen() {
  const theme = useTheme();
  const { token, isActive } = useAuth();

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('part');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inactive, setInactive] = useState(false);

  const reqId = useRef(0);

  const load = useCallback(
    async (q: string, m: SearchMode) => {
      if (!token) return;
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const params = m === 'device' ? { device: q } : { q };
        const data = await api.getCatalog(token, params);
        if (id === reqId.current) {
          setProducts(data);
          setInactive(false);
        }
      } catch (e) {
        if (id !== reqId.current) return;
        if (e instanceof ApiError && e.status === 402) {
          setInactive(true);
          setProducts([]);
        } else {
          setError(e instanceof Error ? e.message : 'Something went wrong');
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [token],
  );

  // Refetch whenever the tab regains focus so stock/prices stay live (v1: no
  // websockets — focus refetch is enough, per the build plan).
  useFocusEffect(
    useCallback(() => {
      load(query, mode);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  const onSubmit = () => load(query.trim(), mode);

  const switchMode = (m: SearchMode) => {
    setMode(m);
    load(query.trim(), m);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
          placeholder={mode === 'device' ? 'Search device model, e.g. iPhone 13' : 'Search part name or SKU'}
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundElement },
          ]}
        />
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
                    backgroundColor: selected ? '#3c87f7' : theme.backgroundElement,
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
        <Centered>
          <ActivityIndicator />
        </Centered>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ProductRow product={item} showMember={isActive} />
          )}
          ListEmptyComponent={
            <Centered>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                No parts found. Try a different search.
              </ThemedText>
            </Centered>
          }
          refreshing={loading}
          onRefresh={onSubmit}
        />
      )}
    </SafeAreaView>
  );
}

function ProductRow({ product, showMember }: { product: Product; showMember: boolean }) {
  const theme = useTheme();
  const regular = regularWholesale(product);
  const member = product.member_price;
  const hasMember = showMember && member !== null && member !== undefined && regular !== null;

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
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
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
          style={{ color: out ? '#d14343' : '#2e9e5b' }}>
          {stockLabel}
        </ThemedText>
      </View>
      <View style={styles.priceCol}>
        {hasMember ? (
          <>
            <ThemedText type="smallBold" style={{ color: '#2e9e5b' }}>
              {formatMoney(member)}
            </ThemedText>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.strike}>
              {formatMoney(regular)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              member
            </ThemedText>
          </>
        ) : (
          <ThemedText type="smallBold">{formatMoney(regular)}</ThemedText>
        )}
      </View>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { padding: Spacing.three, gap: Spacing.two },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  segment: { flexDirection: 'row', gap: Spacing.two },
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
  priceCol: { alignItems: 'flex-end', minWidth: 84, gap: 1 },
  strike: { textDecorationLine: 'line-through' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  center: { textAlign: 'center' },
  retry: {
    backgroundColor: '#3c87f7',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
});
