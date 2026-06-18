import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Tab-bar icon that springs up slightly when its tab becomes active — a small,
 * tactile cue that the bottom bar otherwise lacks. Pure transform animation on
 * the UI thread (no layout work), so it stays smooth on low-end devices.
 */
export function AnimatedTabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: IconName;
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const scale = useSharedValue(focused ? 1.12 : 1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.12 : 1, { damping: 12, stiffness: 220, mass: 0.5 });
  }, [focused, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Ionicons name={name} color={color} size={size} />
    </Animated.View>
  );
}
