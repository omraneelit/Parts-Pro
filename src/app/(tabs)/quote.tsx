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

import { BarcodeScanner } from '@/components/barcode-scanner';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { formatDate, formatMoney, regularWholesale } from '@/lib/format';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { MARKUP_KEY, storageGet, storageSet } from '@/lib/storage';
import type { Product, SavedQuote } from '@/lib/types';

export default function QuoteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token, isMember, tier } = useAuth();
  const { t } = useI18n();

  const quoteText = useCallback(
    (q: { part_name: string; cost: number; markup_percent: number; customer_price: number }): string =>
      `${t('q_share_head', { name: q.part_name })}\n` +
      `${t('q_share_cost', { price: formatMoney(q.cost) })}\n` +
      `${t('q_share_markup', { m: q.markup_percent })}\n` +
      `${t('q_share_price', { price: formatMoney(q.customer_price) })}`,
    [t],
  );

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
  const [savedSearch, setSavedSearch] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
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
            t('q_limit_title'),
            t('q_limit_msg', { n: usage.limit ?? t('q_limit_few') }),
            [
              { text: t('q_not_now'), style: 'cancel' },
              { text: t('q_upgrade'), onPress: () => router.push('/account') },
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
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Cost basis: member price (what the shop pays) for members, else wholesale —
  // or the manually-entered cost when quoting a custom part.
  const title = selected ? selected.name_en : manualName.trim() || t('q_custom_part');
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
      Alert.alert(t('q_saved_title'), t('q_saved_msg'));
    } catch (e) {
      Alert.alert(t('error'), e instanceof ApiError ? e.message : t('q_save_err'));
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
    Alert.alert(t('q_del_title'), t('q_del_msg', { name: q.part_name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('q_delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteQuote(token, q.id);
            setSavedQuotes((prev) => prev.filter((x) => x.id !== q.id));
          } catch (e) {
            Alert.alert(t('error'), e instanceof ApiError ? e.message : t('q_del_err'));
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
              {t('q_pick_another')}
            </ThemedText>
          </Pressable>

          {manual ? (
            <>
              <TextInput
                value={manualName}
                onChangeText={setManualName}
                placeholder={t('q_ph_part_name')}
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <TextInput
                value={manualCost}
                onChangeText={setManualCost}
                placeholder={t('q_ph_cost')}
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
            </>
          ) : (
            <>
              <ThemedText type="subtitle">{selected!.name_en}</ThemedText>
              {selected!.sku ? (
                <ThemedText themeColor="textSecondary">{t('cat_sku', { sku: selected!.sku })}</ThemedText>
              ) : null}
            </>
          )}

          <Animated.View
            entering={FadeInDown.duration(240)}
            style={[styles.costBox, { backgroundColor: theme.backgroundElement }]}>
            <Row label={memberCost ? t('q_your_cost_member') : t('q_your_cost')}>
              <ThemedText type="smallBold">{formatMoney(cost)}</ThemedText>
            </Row>
            <Row label={t('q_markup_pct', { m: markup })}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                +{formatMoney(cost != null ? cost * (markup / 100) : null)}
              </ThemedText>
            </Row>
            <View style={styles.divider} />
            <Row label={t('q_suggested')}>
              <Animated.View style={priceStyle}>
                <ThemedText type="subtitle" style={{ color: Brand.success }}>
                  {formatMoney(suggested)}
                </ThemedText>
              </Animated.View>
            </Row>
          </Animated.View>

          <ThemedText type="smallBold">{t('q_markup_label', { m: markup })}</ThemedText>
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
            {t('q_markup_saved')}
          </ThemedText>

          <View style={styles.actionRow}>
            <PressableScale
              onPress={saveCurrent}
              disabled={saving}
              style={[styles.actionBtn, { backgroundColor: Brand.accent }, saving && { opacity: 0.6 }]}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                {saving ? t('q_saving') : t('q_save_quote')}
              </ThemedText>
            </PressableScale>
            <PressableScale
              onPress={shareCurrent}
              style={[styles.actionBtn, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{t('q_share')}</ThemedText>
            </PressableScale>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <ThemedText type="smallBold">{t('q_pick_part')}</ThemedText>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            placeholder={t('cat_search_part')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
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
        <Pressable onPress={() => setManual(true)} style={styles.manualBtn}>
          <ThemedText type="smallBold" style={{ color: Brand.accent }}>
            {t('q_custom_btn')}
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
                    {t('cat_sku', { sku: item.sku })}
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
                  {t('q_no_match')}
                </ThemedText>
              </View>
            ) : savedQuotes.length > 0 ? (
              <View style={styles.savedWrap}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.savedHeader}>
                  {t('q_saved_header')}
                </ThemedText>
                {savedQuotes.length > 4 ? (
                  <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="search" size={16} color={theme.textSecondary} />
                    <TextInput
                      value={savedSearch}
                      onChangeText={setSavedSearch}
                      autoCorrect={false}
                      placeholder={t('q_search_saved')}
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.searchInput, { color: theme.text }]}
                    />
                    {savedSearch.length > 0 ? (
                      <Pressable onPress={() => setSavedSearch('')} hitSlop={10}>
                        <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                {savedQuotes
                  .filter((q) =>
                    savedSearch.trim()
                      ? q.part_name.toLowerCase().includes(savedSearch.trim().toLowerCase())
                      : true,
                  )
                  .map((q, i) => (
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
                        {t('q_share')}
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => deleteSaved(q)} style={styles.savedAction}>
                      <ThemedText type="small" style={{ color: Brand.danger }}>
                        {t('q_delete')}
                      </ThemedText>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            ) : (
              <Animated.View entering={FadeInDown.duration(260)} style={styles.centered}>
                <Ionicons name="calculator-outline" size={48} color={theme.textSecondary} />
                <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  {t('q_start_hint')}
                </ThemedText>
              </Animated.View>
            )
          }
        />
      )}

      <BarcodeScanner
        visible={scanOpen}
        onScan={(code) => {
          setScanOpen(false);
          setQuery(code);
        }}
        onClose={() => setScanOpen(false)}
      />
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
