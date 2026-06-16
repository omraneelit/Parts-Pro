// Pulsing placeholder blocks shown while content loads (a calmer, more premium
// alternative to a bare spinner). Built on reanimated so it runs on the UI thread.
import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const o = useSharedValue(0.45);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.backgroundElement }, anim, style]}
    />
  );
}

// A catalog product-row placeholder that mirrors the real card layout.
export function ProductSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Skeleton width={56} height={56} radius={Spacing.two} style={{ backgroundColor: theme.backgroundSelected }} />
      <View style={styles.body}>
        <Skeleton width="80%" height={14} />
        <Skeleton width="45%" height={12} />
        <Skeleton width="60%" height={12} />
      </View>
      <View style={styles.price}>
        <Skeleton width={56} height={14} />
        <Skeleton width={40} height={10} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
    alignItems: 'center',
  },
  body: { flex: 1, gap: Spacing.two },
  price: { alignItems: 'flex-end', gap: Spacing.two, minWidth: 60 },
});
