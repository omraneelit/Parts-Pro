import Slider from '@react-native-community/slider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatMoney, regularWholesale } from '@/lib/format';
import { MARKUP_KEY, storageGet, storageSet } from '@/lib/storage';
import type { Product } from '@/lib/types';

export default function QuoteScreen() {
  const theme = useTheme();
  const { token, isActive } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [markup, setMarkup] = useState(30);
  const reqId = useRef(0);

  // Restore the user's preferred default markup (persisted per device).
  useEffect(() => {
    (async () => {
      const saved = await storageGet(MARKUP_KEY);
      const n = saved ? Number(saved) : NaN;
      if (!Number.isNaN(n)) setMarkup(n);
    })();
  }, []);

  const persistMarkup = useCallback((value: number) => {
    setMarkup(value);
    void storageSet(MARKUP_KEY, String(value));
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (!token || !q.trim()) {
        setResults([]);
        return;
      }
      const id = ++reqId.current;
      setLoading(true);
      try {
        const data = await api.getCatalog(token, { q: q.trim() });
        if (id === reqId.current) setResults(data);
      } catch (e) {
        if (id === reqId.current && !(e instanceof ApiError && e.status === 402)) {
          setResults([]);
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [token],
  );

  // Debounce the part search so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  // Cost basis: the member price (what the shop pays) when active, else wholesale.
  const cost = selected
    ? (isActive && selected.member_price != null ? selected.member_price : regularWholesale(selected))
    : null;
  const suggested = cost != null ? cost * (1 + markup / 100) : null;

  if (selected) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
        <View style={styles.detail}>
          <Pressable onPress={() => setSelected(null)} style={styles.back}>
            <ThemedText type="smallBold" style={{ color: Brand.accent }}>
              ← Pick another part
            </ThemedText>
          </Pressable>

          <ThemedText type="subtitle">{selected.name_en}</ThemedText>
          {selected.sku ? (
            <ThemedText themeColor="textSecondary">SKU {selected.sku}</ThemedText>
          ) : null}

          <View style={[styles.costBox, { backgroundColor: theme.backgroundElement }]}>
            <Row label={isActive && selected.member_price != null ? 'Your cost (member)' : 'Your cost'}>
              <ThemedText type="smallBold">{formatMoney(cost)}</ThemedText>
            </Row>
            <Row label={`Markup ${markup}%`}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                +{formatMoney(cost != null ? cost * (markup / 100) : null)}
              </ThemedText>
            </Row>
            <View style={styles.divider} />
            <Row label="Suggested customer price">
              <ThemedText type="subtitle" style={{ color: Brand.success }}>
                {formatMoney(suggested)}
              </ThemedText>
            </Row>
          </View>

          <ThemedText type="smallBold">Markup: {markup}%</ThemedText>
          <Slider
            minimumValue={0}
            maximumValue={200}
            step={1}
            value={markup}
            onValueChange={persistMarkup}
            minimumTrackTintColor={Brand.accent}
            maximumTrackTintColor={theme.backgroundSelected}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Your markup is saved as the default for next time.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <ThemedText type="smallBold">Pick a part to quote</ThemedText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search part name or SKU"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelected(item)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.name_en}
                </ThemedText>
                {item.sku ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    SKU {item.sku}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="smallBold">
                {formatMoney(isActive && item.member_price != null ? item.member_price : regularWholesale(item))}
              </ThemedText>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
                {query.trim() ? 'No matching parts.' : 'Search for a part to start a quote.'}
              </ThemedText>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.rowBetween}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      {children}
    </View>
  );
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
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  detail: { padding: Spacing.three, gap: Spacing.three },
  back: { paddingVertical: Spacing.one },
  costBox: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(128,128,128,0.25)', marginVertical: Spacing.one },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
});
