// A full-screen barcode scanner modal. Used by Catalog and Quote to scan a
// part's barcode straight into the search box (the backend catalog `q` already
// matches the `barcodes` field). Needs expo-camera + a dev/EAS build to run.
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

export function BarcodeScanner({
  visible,
  onScan,
  onClose,
}: {
  visible: boolean;
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  // Lock so a single barcode only fires onScan once per open.
  const handled = useRef(false);

  useEffect(() => {
    if (visible) {
      handled.current = false;
      if (permission && !permission.granted) requestPermission();
    }
  }, [visible, permission, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
            }}
            onBarcodeScanned={({ data }) => {
              if (handled.current || !data) return;
              handled.current = true;
              onScan(String(data));
            }}
          />
        ) : (
          <View style={styles.permWrap}>
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <ThemedText style={styles.permText}>{t('scan_perm')}</ThemedText>
            <Pressable onPress={() => requestPermission()} style={styles.permBtn}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                {t('scan_grant')}
              </ThemedText>
            </Pressable>
          </View>
        )}

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.frame} />
          <ThemedText style={styles.hint}>{t('scan_hint')}</ThemedText>
        </View>

        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  frame: {
    width: 240,
    height: 160,
    borderWidth: 3,
    borderColor: Brand.accent,
    borderRadius: Spacing.three,
    backgroundColor: 'transparent',
  },
  hint: { color: '#fff', textAlign: 'center', paddingHorizontal: Spacing.four },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  permText: { color: '#fff', textAlign: 'center' },
  permBtn: {
    backgroundColor: Brand.accent,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: Spacing.two,
  },
});
