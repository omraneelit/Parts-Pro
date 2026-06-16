import Slider from '@react-native-community/slider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
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
import { formatDate, formatMoney, regularWholesale } from '@/lib/format';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { MARKUP_KEY, storageGet, storageSet } from '@/lib/storage';
import type { Product, SavedQuote } from '@/lib/types';

function quoteText(q: { part_name: string; cost: number; markup_percent: number; customer_price: number }): string {
  return (
    `Repair quote — ${q.part_name}\n` +
    `Part cost: ${formatMoney(q.cost)}\n` +
    `Markup: ${q.markup_percent}%\n` +
    `Customer price: ${formatMoney(q.customer_price)}`
  );
}

export default function QuoteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token, isMember, tier } = useAuth();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [markup, setMarkup] = useState(30);
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([]);
  const [saving, setSaving] = useState(false);
  // Manual quote: price a part that isn't in the catalog.
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualCost, setManualCost] = useState('');
  const reqId = useRef(0);

  const loadQuotes = useCallback(async () => {
    if (!token) return;
    try {
      setSavedQuotes(await api.getQuotes(token));
    } catch {
      /* non-fatal */
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadQuotes();
    }, [loadQuotes]),
  );

  // Restore the saved default markup — only for members (trial/pro). Free users
  // get a fresh default each session (saved markup is a member perk).
  useEffect(() => {
    if (!isMember) return;
    (async () => {
      const saved = await storageGet(MARKUP_KEY);
      const n = saved ? Number(saved) : NaN;
      if (!Number.isNaN(n)) setMarkup(n);
    })();
  }, [isMember]);

  const persistMarkup = useCallback(
    (value: number) => {
      setMarkup(value);
      if (isMember) void storageSet(MARKUP_KEY, String(value));
    },
    [isMember],
  );

  // Free tier: each generated quote counts against the daily limit. Trial/Pro
  // are unlimited. Returns true if the quote may proceed.
  const selectPart = async (item: Product) => {
    if (tier === 'free' && token) {
      try {
        const usage = await api.quoteUsage(token);
        if (!usage.allowed) {
          Alert.alert(
            'Daily quote limit reached',
            `Free members get ${usage.limit ?? 'a few'} quotes per day. Upgrade to Pro for unlimited quotes.`,
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Upgrade', onPress: () => router.push('/account') },
            ],
          );
          return;
        }
      } catch {
        /* network hiccup — don't block the user */
      }
    }
    tapLight();
    setSelected(item);
  };

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

  // Cost basis: member price (what the shop pays) for members, else wholesale —
  // or the manually-entered cost when quoting a custom part.
  const title = selected ? selected.name_en : manualName.trim() || 'Custom part';
  const cost = selected
    ? (isMember && selected.member_price != null ? selected.member_price : regularWholesale(selected))
    : manual
      ? Number(manualCost) || 0
      : null;
  const suggested = cost != null ? cost * (1 + markup / 100) : null;

  // Pop the suggested price whenever it changes (markup slider / cost edit).
  const priceScale = useSharedValue(1);
  useEffect(() => {
    priceScale.value = withSequence(withTiming(1.08, { duration: 110 }), withTiming(1, { duration: 130 }));
  }, [suggested, priceScale]);
  const priceStyle = useAnimatedStyle(() => ({ transform: [{ scale: priceScale.value }] }));

  const closeDetail = () => {
    setSelected(null);
    setManual(false);
    setManualName('');
    setManualCost('');
  };

  const saveCurrent = async () => {
    if (!token || cost == null || suggested == null) return;
    setSaving(true);
    try {
      await api.saveQuote(token, {
        product_id: selected?.id,
        part_name: title,
        cost: Math.round(cost * 100) / 100,
        markup_percent: markup,
        customer_price: Math.round(suggested * 100) / 100,
      });
      await loadQuotes();
      notifySuccess();
      Alert.alert('Saved', 'Quote saved. Find it under "Saved quotes".');
    } catch (e) {
      Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not save quote');
    } finally {
      setSaving(false);
    }
  };

  const shareCurrent = () => {
    if (cost == null || suggested == null) return;
    Share.share({
      message: quoteText({ part_name: title, cost, markup_percent: markup, customer_price: suggested }),
    });
  };

  const deleteSaved = (q: SavedQuote) => {
    if (!token) return;
    Alert.alert('Delete quote', `Delete the quote for ${q.part_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteQuote(token, q.id);
            setSavedQuotes((prev) => prev.filter((x) => x.id !== q.id));
          } catch (e) {
            Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not delete');
          }
        },
      },
    ]);
  };

  if (selected || manual) {
    const memberCost = !!selected && isMember && selected.member_price != null;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
        <View style={styles.detail}>
          <Pressable onPress={closeDetail} style={styles.back}>
            <ThemedText type="smallBold" style={{ color: Brand.accent }}>
              ← Pick another part
            </ThemedText>
          </Pressable>

          {manual ? (
            <>
              <TextInput
                value={manualName}
                onChangeText={setManualName}
                placeholder="Part name"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <TextInput
                value={manualCost}
                onChangeText={setManualCost}
                placeholder="Your cost (e.g. 12.50)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
            </>
          ) : (
            <>
              <ThemedText type="subtitle">{selected!.name_en}</ThemedText>
              {selected!.sku ? (
                <ThemedText themeColor="textSecondary">SKU {selected!.sku}</ThemedText>
              ) : null}
            </>
          )}

          <Animated.View
            entering={FadeInDown.duration(240)}
            style={[styles.costBox, { backgroundColor: theme.backgroundElement }]}>
            <Row label={memberCost ? 'Your cost (member)' : 'Your cost'}>
              <ThemedText type="smallBold">{formatMoney(cost)}</ThemedText>
            </Row>
            <Row label={`Markup ${markup}%`}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                +{formatMoney(cost != null ? cost * (markup / 100) : null)}
              </ThemedText>
            </Row>
            <View style={styles.divider} />
            <Row label="Suggested customer price">
              <Animated.View style={priceStyle}>
                <ThemedText type="subtitle" style={{ color: Brand.success }}>
                  {formatMoney(suggested)}
                </ThemedText>
              </Animated.View>
            </Row>
          </Animated.View>

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

          <View style={styles.actionRow}>
            <PressableScale
              onPress={saveCurrent}
              disabled={saving}
              style={[styles.actionBtn, { backgroundColor: Brand.accent }, saving && { opacity: 0.6 }]}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                {saving ? 'Saving…' : 'Save quote'}
              </ThemedText>
            </PressableScale>
            <PressableScale
              onPress={shareCurrent}
              style={[styles.actionBtn, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">Share</ThemedText>
            </PressableScale>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <ThemedText type="smallBold">Pick a part to quote</ThemedText>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            placeholder="Search part name or SKU"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => setManual(true)} style={styles.manualBtn}>
          <ThemedText type="smallBold" style={{ color: Brand.accent }}>
            + Quote a custom part
          </ThemedText>
        </Pressable>
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
              onPress={() => selectPart(item)}
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
                {formatMoney(isMember &&item.member_price != null ? item.member_price : regularWholesale(item))}
              </ThemedText>
            </Pressable>
          )}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.centered}>
                <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  No matching parts.
                </ThemedText>
              </View>
            ) : savedQuotes.length > 0 ? (
              <View style={styles.savedWrap}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.savedHeader}>
                  SAVED QUOTES
                </ThemedText>
                {savedQuotes.map((q, i) => (
                  <Animated.View
                    key={q.id}
                    entering={FadeInDown.duration(220).delay(Math.min(i, 10) * 40)}
                    exiting={FadeOut.duration(180)}
                    layout={LinearTransition.springify().damping(18)}
                    style={[styles.savedCard, { backgroundColor: theme.backgroundElement }]}>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {q.part_name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {formatMoney(q.cost)} +{q.markup_percent}% → {formatMoney(q.customer_price)}
                      </ThemedText>
                      {q.created_at ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          {formatDate(q.created_at)}
                        </ThemedText>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => Share.share({ message: quoteText(q) })}
                      style={styles.savedAction}>
                      <ThemedText type="small" style={{ color: Brand.accent }}>
                        Share
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => deleteSaved(q)} style={styles.savedAction}>
                      <ThemedText type="small" style={{ color: Brand.danger }}>
                        Delete
                      </ThemedText>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            ) : (
              <Animated.View entering={FadeInDown.duration(260)} style={styles.centered}>
                <Ionicons name="calculator-outline" size={48} color={theme.textSecondary} />
                <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  Search for a part to start a quote.
                </ThemedText>
              </Animated.View>
            )
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  searchInput: { flex: 1, paddingVertical: Spacing.three, fontSize: 16 },
  manualBtn: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
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
  actionRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  savedWrap: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  savedHeader: { letterSpacing: 1, marginBottom: Spacing.one },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  savedAction: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  back: { paddingVertical: Spacing.one },
  costBox: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(128,128,128,0.25)', marginVertical: Spacing.one },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
});
