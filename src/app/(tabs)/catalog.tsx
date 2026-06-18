import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { formatMoney, regularWholesale } from '@/lib/format';
import { escapeHtml, sharePdfFromHtml } from '@/lib/pdf';
import type { Product } from '@/lib/types';

// Price List Maker: the subscriber builds their own customer price list off the
// wholesale catalog. A markup % (with optional rounding) is applied to their buy
// price for every part, and any part can get an explicit override that wins over
// the markup. Config persists per-subscriber via /partspro/pricelist. "Share"
// sends a plain-text price list through the OS share sheet.
const ROUND_RULES = ['', '0.99', '0.5', '1', '5', '10'];

function roundPrice(v: number, rule: string): number {
  if (!Number.isFinite(v) || v < 0) v = 0;
  if (!rule) return Math.round(v * 100) / 100;
  if (rule === '0.99') return Math.max(0, Math.ceil(v - 1e-9) - 0.01);
  const step = parseFloat(rule);
  if (!step) return Math.round(v * 100) / 100;
  return Math.round(v / step) * step;
}

// The subscriber's buy price for a part: member price if they have one, else the
// regular wholesale, else retail.
function buyPrice(p: Product): number {
  if (p.member_price != null) return p.member_price;
  const w = regularWholesale(p);
  if (w != null) return w;
  return p.retail_price ?? 0;
}

export default function PriceListScreen() {
  const theme = useTheme();
  const { token } = useAuth();
  const { t, isAr } = useI18n();

  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [markup, setMarkup] = useState(0);
  const [round, setRound] = useState('');
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inactive, setInactive] = useState(false);

  const [pricingOpen, setPricingOpen] = useState(false);
  const [markupDraft, setMarkupDraft] = useState('0');
  const [roundDraft, setRoundDraft] = useState('');
  const [overrideItem, setOverrideItem] = useState<Product | null>(null);
  const [overrideDraft, setOverrideDraft] = useState('');
  const [savingCfg, setSavingCfg] = useState(false);

  const reqId = useRef(0);
  const pageRef = useRef(1);
  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(
    async (q: string) => {
      if (!token) return;
      const id = ++reqId.current;
      pageRef.current = 1;
      setLoading(true);
      setError(null);
      try {
        const data = await api.getCatalog(token, { q, page: 1 });
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
          setError(e instanceof Error ? e.message : t('error'));
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [token, t],
  );

  const loadMore = useCallback(async () => {
    if (!token || loadingMore || !hasMore || loading) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const data = await api.getCatalog(token, { q: queryRef.current.trim(), page: nextPage });
      if (id === reqId.current) {
        pageRef.current = nextPage;
        setProducts((prev) => [...prev, ...data]);
        setHasMore(data.length === api.CATALOG_PAGE_SIZE);
      }
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  }, [token, loadingMore, hasMore, loading]);

  // Load the saved markup/rounding/overrides once.
  useEffect(() => {
    if (!token) return;
    api
      .getPriceList(token)
      .then((cfg) => {
        setMarkup(Number(cfg.markup_percent) || 0);
        setRound(cfg.round || '');
        setOverrides(cfg.overrides || {});
      })
      .catch(() => {});
  }, [token]);

  // Initial load + debounced search.
  const didMount = useRef(false);
  useEffect(() => {
    if (!token) return;
    if (!didMount.current) {
      didMount.current = true;
      load(query.trim());
      return;
    }
    const tm = setTimeout(() => load(query.trim()), 220);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, load, token]);

  const effective = useCallback(
    (p: Product) => {
      const ov = overrides[p.id];
      if (ov != null) return ov;
      return roundPrice(buyPrice(p) * (1 + markup / 100), round);
    },
    [overrides, markup, round],
  );

  const roundLabelOf = useCallback((r: string) => (r === '' ? t('pl_round_none') : r), [t]);

  const savePricing = useCallback(async () => {
    if (!token) return;
    const m = Math.max(0, parseFloat(markupDraft) || 0);
    setSavingCfg(true);
    try {
      await api.savePriceList(token, { markup_percent: m, round: roundDraft });
      setMarkup(m);
      setRound(roundDraft);
      setPricingOpen(false);
    } catch (e) {
      Alert.alert(t('pl_save_err'), e instanceof Error ? e.message : undefined);
    } finally {
      setSavingCfg(false);
    }
  }, [token, markupDraft, roundDraft, t]);

  const saveOverride = useCallback(
    async (clear: boolean) => {
      if (!token || !overrideItem) return;
      const next = { ...overrides };
      if (clear) {
        delete next[overrideItem.id];
      } else {
        const v = parseFloat(overrideDraft);
        if (!Number.isFinite(v) || v < 0) {
          Alert.alert(t('pl_invalid_price'));
          return;
        }
        next[overrideItem.id] = Math.round(v * 100) / 100;
      }
      setSavingCfg(true);
      try {
        await api.savePriceList(token, { overrides: next });
        setOverrides(next);
        setOverrideItem(null);
      } catch (e) {
        Alert.alert(t('pl_save_err'), e instanceof Error ? e.message : undefined);
      } finally {
        setSavingCfg(false);
      }
    },
    [token, overrideItem, overrideDraft, overrides, t],
  );

  const shareList = useCallback(async () => {
    if (!products.length) return;
    const date = new Date().toLocaleDateString(isAr ? 'ar' : undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const note = markup ? t('pl_pdf_markup_note', { m: markup }) : '';

    // Try a real PDF first (needs the native print/sharing modules); fall back to
    // a plain-text share when they aren't available in this build.
    const rows = products
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.name_en)}</td><td class="p">${escapeHtml(formatMoney(effective(p)))}</td></tr>`,
      )
      .join('');
    const html = `<html dir="${isAr ? 'rtl' : 'ltr'}"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
      * { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; }
      body { padding: 24px; color: #111827; }
      h1 { font-size: 22px; margin: 0; }
      .sub { color: #6B7280; font-size: 12px; margin: 4px 0 18px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: ${isAr ? 'right' : 'left'}; font-size: 11px; text-transform: uppercase;
           color: #6B7280; border-bottom: 2px solid #E5E7EB; padding: 8px 6px; }
      td { padding: 9px 6px; border-bottom: 1px solid #F3F4F6; font-size: 13px; }
      td.p, th.p { text-align: ${isAr ? 'left' : 'right'}; white-space: nowrap; }
    </style></head><body>
      <h1>${escapeHtml(t('pl_pdf_title'))}</h1>
      <div class="sub">${escapeHtml(t('pl_pdf_meta', { date, count: products.length }))}${escapeHtml(note)}</div>
      <table><thead><tr><th>${escapeHtml(t('pl_col_product'))}</th><th class="p">${escapeHtml(t('pl_col_price'))}</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </body></html>`;

    const sharedPdf = await sharePdfFromHtml(html, t('pl_pdf_title'));
    if (sharedPdf) return;

    const lines = products.map((p) => `${p.name_en} — ${formatMoney(effective(p))}`);
    const body =
      `${t('pl_pdf_title')}\n${t('pl_pdf_meta', { date, count: products.length })}${note}\n\n` +
      lines.join('\n');
    try {
      await Share.share({ message: body, title: t('pl_pdf_title') });
    } catch {
      /* user dismissed */
    }
  }, [products, effective, markup, isAr, t]);

  if (!token) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary">{t('pl_log_in')}</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => load(query.trim())}
            returnKeyType="search"
            autoCorrect={false}
            placeholder={t('pl_search')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }, isAr && styles.rtl]}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable onPress={shareList} hitSlop={8} style={styles.shareBtn}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {t('pl_share')}
            </ThemedText>
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            setMarkupDraft(String(markup));
            setRoundDraft(round);
            setPricingOpen(true);
          }}
          style={[styles.cfgRow, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" style={{ flex: 1 }}>
            {t('pl_cfg_summary', { m: markup, r: roundLabelOf(round) })}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: Brand.accent }}>
            {t('pl_edit')} ›
          </ThemedText>
        </Pressable>
      </View>

      {inactive ? (
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {t('cat_inactive_body')}
          </ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <ThemedText style={styles.center}>{error}</ThemedText>
          <Pressable onPress={() => load(query.trim())} style={styles.retry}>
            <ThemedText type="smallBold" style={{ color: '#fff' }}>
              {t('retry')}
            </ThemedText>
          </Pressable>
        </View>
      ) : loading && products.length === 0 ? (
        <View style={styles.list}>
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            products.length ? (
              <ThemedText type="small" themeColor="textSecondary" style={[styles.hint, isAr && styles.rtl]}>
                {t('pl_tap_hint')}
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => {
            const isOverride = overrides[item.id] != null;
            return (
              <Pressable
                onPress={() => {
                  setOverrideItem(item);
                  setOverrideDraft(isOverride ? String(overrides[item.id]) : '');
                }}
                style={[styles.row, { borderBottomColor: theme.backgroundElement }]}>
                <View style={styles.rowBody}>
                  <ThemedText type="smallBold" numberOfLines={2} style={isAr && styles.rtl}>
                    {item.name_en}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={isAr && styles.rtl}>
                    {t('pl_cost', { price: formatMoney(buyPrice(item)) })}
                  </ThemedText>
                </View>
                <View style={styles.priceCol}>
                  <ThemedText type="smallBold" style={{ color: Brand.accent }}>
                    {formatMoney(effective(item))}
                  </ThemedText>
                  {isOverride ? (
                    <ThemedText type="small" style={{ color: Brand.success }}>
                      ✏︎ {t('pl_custom')}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="cube-outline" size={48} color={theme.textSecondary} />
              <ThemedText themeColor="textSecondary" style={styles.center}>
                {t('pl_empty')}
              </ThemedText>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={Brand.accent} />
              </View>
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => load(query.trim())}
              tintColor={Brand.accent}
              colors={[Brand.accent]}
            />
          }
        />
      )}

      {/* Pricing-rules modal */}
      <Modal visible={pricingOpen} transparent animationType="slide" onRequestClose={() => setPricingOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrap}>
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle" style={[styles.sheetTitle, isAr && styles.rtl]}>
              {t('pl_pricing_rules')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={isAr && styles.rtl}>
              {t('pl_markup')}
            </ThemedText>
            <TextInput
              value={markupDraft}
              onChangeText={setMarkupDraft}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            />
            <ThemedText type="small" themeColor="textSecondary" style={isAr && styles.rtl}>
              {t('pl_rounding')}
            </ThemedText>
            <View style={styles.chips}>
              {ROUND_RULES.map((r) => {
                const sel = roundDraft === r;
                return (
                  <Pressable
                    key={r || 'none'}
                    onPress={() => setRoundDraft(r)}
                    style={[
                      styles.chip,
                      { backgroundColor: sel ? Brand.accent : theme.backgroundElement },
                    ]}>
                    <ThemedText type="small" style={{ color: sel ? '#fff' : theme.text }}>
                      {roundLabelOf(r)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sheetBtns}>
              <Pressable
                style={[styles.btnGhost, { backgroundColor: theme.backgroundElement }]}
                onPress={() => setPricingOpen(false)}>
                <ThemedText type="smallBold">{t('cancel')}</ThemedText>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={savePricing} disabled={savingCfg}>
                {savingCfg ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    {t('save')}
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Per-item override modal */}
      <Modal visible={!!overrideItem} transparent animationType="slide" onRequestClose={() => setOverrideItem(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrap}>
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle" numberOfLines={1} style={[styles.sheetTitle, isAr && styles.rtl]}>
              {overrideItem?.name_en}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={isAr && styles.rtl}>
              {t('pl_custom_price')}
            </ThemedText>
            <TextInput
              value={overrideDraft}
              onChangeText={setOverrideDraft}
              keyboardType="decimal-pad"
              placeholder={
                overrideItem
                  ? String(roundPrice(buyPrice(overrideItem) * (1 + markup / 100), round))
                  : '0'
              }
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
              autoFocus
            />
            <View style={styles.sheetBtns}>
              <Pressable
                style={[styles.btnGhost, { backgroundColor: theme.backgroundElement }]}
                onPress={() => saveOverride(true)}
                disabled={savingCfg}>
                <ThemedText type="smallBold">{t('pl_use_markup')}</ThemedText>
              </Pressable>
              <Pressable style={styles.btnPrimary} onPress={() => saveOverride(false)} disabled={savingCfg}>
                {savingCfg ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    {t('save')}
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
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
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  shareBtn: {
    backgroundColor: Brand.accent,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
  },
  cfgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.two,
  },
  hint: { marginBottom: Spacing.two },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: 2 },
  priceCol: { alignItems: 'flex-end', minWidth: 90, gap: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  center: { textAlign: 'center' },
  footer: { paddingVertical: Spacing.three },
  retry: {
    backgroundColor: Brand.accent,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  sheetTitle: { fontSize: 20, lineHeight: 28 },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: Spacing.four },
  sheetBtns: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.three },
  btnGhost: { flex: 1, paddingVertical: Spacing.three, borderRadius: Spacing.two, alignItems: 'center' },
  btnPrimary: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.accent,
  },
});
