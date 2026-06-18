// Manual-payment sheet shown when a member taps "Upgrade / Renew".
// There is no card processor wired up, so instead of failing with a server
// error we present the wallet numbers the owner accepts (Whish, OMT, BOB) plus
// a "contact developer" shortcut. Every number is admin-editable from the
// Control App and arrives via /partspro/settings — methods without a number are
// hidden automatically.
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/lib/i18n';
import { tapLight } from '@/lib/haptics';

export interface PaymentInfo {
  whishNumber?: string;
  omtNumber?: string;
  bobNumber?: string;
  developerContact?: string;
}

// Brand-coloured wordmark badge — recognisable without bundling logo assets.
const METHODS: { key: keyof PaymentInfo; name: string; short: string; color: string }[] = [
  { key: 'whishNumber', name: 'Whish Money', short: 'whish', color: '#E6007E' },
  { key: 'omtNumber', name: 'OMT', short: 'OMT', color: '#ED1C24' },
  { key: 'bobNumber', name: 'BOB Finance', short: 'BOB', color: '#0B3D91' },
];

function dial(number: string) {
  tapLight();
  const clean = number.replace(/[^\d+]/g, '');
  Linking.openURL(`tel:${clean}`).catch(() => {});
}

function contactDev(number: string) {
  tapLight();
  const clean = number.replace(/[^\d+]/g, '');
  // Prefer the WhatsApp app (the `whatsapp://` scheme rejects when the app isn't
  // installed or can't handle the number, so the tel: fallback actually fires —
  // unlike a wa.me web link, which opens a dead error page on a local number).
  Linking.openURL(`whatsapp://send?phone=${clean.replace(/^\+/, '')}`).catch(() =>
    Linking.openURL(`tel:${clean}`).catch(() => {}),
  );
}

export function PaymentMethodsModal({
  visible,
  onClose,
  info,
  planLine,
}: {
  visible: boolean;
  onClose: () => void;
  info: PaymentInfo;
  planLine?: string;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  const available = METHODS.filter((m) => (info[m.key] ?? '').trim().length > 0);
  const dev = (info.developerContact ?? '').trim();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.background }]} onPress={() => {}}>
          <View style={styles.grabber} />
          <ThemedText type="subtitle">{t('acc_pay_title')}</ThemedText>
          {planLine ? (
            <ThemedText themeColor="textSecondary" style={{ marginBottom: Spacing.one }}>
              {planLine}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {t('acc_pay_sub')}
          </ThemedText>

          <ScrollView style={{ marginTop: Spacing.three }} contentContainerStyle={{ gap: Spacing.two }}>
            {available.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: Spacing.three }}>
                {t('acc_pay_none')}
              </ThemedText>
            ) : (
              available.map((m) => {
                const number = (info[m.key] ?? '').trim();
                return (
                  <PressableScale
                    key={m.key}
                    onPress={() => dial(number)}
                    style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                    <View style={[styles.badge, { backgroundColor: m.color }]}>
                      <ThemedText type="smallBold" style={styles.badgeText}>
                        {m.short}
                      </ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="smallBold">{m.name}</ThemedText>
                      <ThemedText themeColor="textSecondary" style={styles.number}>
                        {number}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" style={{ color: Brand.accent }}>
                      {t('acc_pay_call')}
                    </ThemedText>
                  </PressableScale>
                );
              })
            )}
          </ScrollView>

          {dev ? (
            <PressableScale onPress={() => contactDev(dev)} style={styles.devBtn}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                {t('acc_pay_dev')}
              </ThemedText>
            </PressableScale>
          ) : null}

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('acc_pay_close')}
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    paddingTop: Spacing.three,
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9993',
    marginBottom: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  badge: {
    width: 56,
    height: 40,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 13, letterSpacing: 0.5 },
  number: { fontSize: 16, marginTop: 2, letterSpacing: 1 },
  devBtn: {
    marginTop: Spacing.three,
    backgroundColor: Brand.success,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  closeBtn: { marginTop: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center' },
});
