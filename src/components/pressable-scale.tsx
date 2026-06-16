// A Pressable that springs down slightly while pressed, for tactile feedback on
// primary buttons. Drop-in replacement for <Pressable> with the same props.
import { Pressable, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  style,
  onPressIn,
  onPressOut,
  down = 0.96,
  children,
  ...rest
}: PressableProps & { down?: number }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      style={[style as object, animStyle]}
      onPressIn={(e) => {
        scale.value = withTiming(down, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: 130 });
        onPressOut?.(e);
      }}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}
