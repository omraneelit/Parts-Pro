import { useEffect } from 'react';
import { AccessibilityInfo, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// Branded launch sequence ported from the HMA accounting app: dark gradient +
// grid → logo bloom (overshoot) at center → progress fill → dissolve, revealing
// the app underneath. Runs once, then calls onFinish.
const LOGO = require('@/assets/images/splash-logo.png');
const ACCENT = '#3c87f7';

const ENTRANCE = Easing.bezier(0.34, 1.5, 0.5, 1);
const FILL = Easing.bezier(0.16, 0.85, 0.3, 1);
const HANDOFF = Easing.bezier(0.7, 0, 0.18, 1);

const HERO = 96;
const HERO_RADIUS = 24;
const SPLASH_SCALE = 1.4;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const centerX = W / 2;
  const centerY = H * 0.4;

  const logoScale = useSharedValue(1.1);
  const logoOpacity = useSharedValue(0);
  const logoRadius = useSharedValue(HERO_RADIUS);
  const glowScale = useSharedValue(0.2);
  const glowOpacity = useSharedValue(0);
  const wordOpacity = useSharedValue(0);
  const wordTY = useSharedValue(10);
  const progress = useSharedValue(0);
  const progressOpacity = useSharedValue(0);
  const loadOpacity = useSharedValue(0);
  const splashOpacity = useSharedValue(1);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const runHandoff = () => {
      logoScale.value = withTiming(1.0, { duration: 600, easing: HANDOFF });
      logoOpacity.value = withTiming(0, { duration: 600, easing: HANDOFF });
      splashOpacity.value = withTiming(0, { duration: 550 });
    };
    const finish = () => {
      overlayOpacity.value = withTiming(0, { duration: 380 }, (f) => {
        if (f) runOnJS(onFinish)();
      });
    };

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) {
        logoScale.value = SPLASH_SCALE;
        glowScale.value = 1;
        logoOpacity.value = withTiming(1, { duration: 300 });
        glowOpacity.value = withTiming(0.9, { duration: 300 });
        wordOpacity.value = withTiming(1, { duration: 300 });
        wordTY.value = withTiming(0, { duration: 300 });
        progressOpacity.value = withTiming(1, { duration: 300 });
        progress.value = withTiming(1, { duration: 500 });
        loadOpacity.value = withTiming(1, { duration: 300 });
        timers.push(setTimeout(finish, 1200));
        return;
      }

      logoOpacity.value = withDelay(60, withTiming(1, { duration: 800 }));
      logoScale.value = withDelay(60, withTiming(SPLASH_SCALE, { duration: 800, easing: ENTRANCE }));
      glowOpacity.value = withDelay(60, withTiming(1, { duration: 1300 }));
      glowScale.value = withDelay(
        60,
        withSequence(
          withTiming(1.08, { duration: 715, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 585, easing: Easing.inOut(Easing.ease) }),
        ),
      );
      wordOpacity.value = withDelay(480, withTiming(1, { duration: 500 }));
      wordTY.value = withDelay(480, withTiming(0, { duration: 500 }));
      progressOpacity.value = withDelay(60, withTiming(1, { duration: 300 }));
      progress.value = withDelay(310, withTiming(1, { duration: 1350, easing: FILL }));
      loadOpacity.value = withDelay(560, withTiming(1, { duration: 500 }));

      timers.push(setTimeout(runHandoff, 2050));
      timers.push(setTimeout(finish, 2950));
    });

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const splashStyle = useAnimatedStyle(() => ({ opacity: splashOpacity.value }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateY: wordTY.value }],
  }));
  const progressFillStyle = useAnimatedStyle(() => ({ width: progress.value * 150 }));
  const progressStyle = useAnimatedStyle(() => ({ opacity: progressOpacity.value }));
  const loadStyle = useAnimatedStyle(() => ({ opacity: loadOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    borderRadius: logoRadius.value,
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, splashStyle]}>
        <LinearGradient
          colors={['#141A26', '#0E121B', '#090C12']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <GridLines width={W} height={H} />

        <Animated.View style={[styles.glowWrap, { left: centerX - 180, top: centerY - 180 }, glowStyle]}>
          <View style={[styles.ring, { width: 360, height: 360, borderRadius: 180, backgroundColor: 'rgba(60,135,247,0.10)' }]} />
          <View style={[styles.ring, { width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(60,135,247,0.16)' }]} />
          <View style={[styles.ring, { width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(60,135,247,0.26)' }]} />
        </Animated.View>

        <Animated.View style={[styles.wordmark, { top: H * 0.54 }, wordStyle]}>
          <Text style={styles.nm}>Parts Pro</Text>
          <Text style={styles.tg}>MOBILE REPAIR PARTS</Text>
        </Animated.View>

        <Animated.View style={[styles.progress, { left: centerX - 75 }, progressStyle]}>
          <Animated.View style={[styles.progressFill, progressFillStyle]} />
        </Animated.View>

        <Animated.View style={[styles.loadlbl, loadStyle]}>
          <Text style={styles.loadText}>LOADING YOUR PARTS</Text>
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.hero, { left: centerX - HERO / 2, top: centerY - HERO / 2 }, logoStyle]}>
        <Image source={LOGO} style={styles.heroImg} resizeMode="cover" />
      </Animated.View>
    </Animated.View>
  );
}

function GridLines({ width, height }: { width: number; height: number }) {
  const step = 42;
  const cols = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  const line = 'rgba(60,135,247,0.10)';
  return (
    <View style={[StyleSheet.absoluteFill, { opacity: 0.5 }]} pointerEvents="none">
      {Array.from({ length: cols }).map((_, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', left: i * step, top: 0, bottom: 0, width: 1, backgroundColor: line }} />
      ))}
      {Array.from({ length: rows }).map((_, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', top: i * step, left: 0, right: 0, height: 1, backgroundColor: line }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { zIndex: 1000, elevation: 1000 },
  glowWrap: { position: 'absolute', width: 360, height: 360, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
  wordmark: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  nm: { fontSize: 26, fontWeight: '800', letterSpacing: -0.24, color: '#FFFFFF' },
  tg: { marginTop: 6, fontSize: 11, fontWeight: '700', letterSpacing: 2.4, color: '#7D93B3' },
  progress: { position: 'absolute', bottom: 92, width: 150, height: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 4, backgroundColor: ACCENT },
  loadlbl: { position: 'absolute', left: 0, right: 0, bottom: 70, alignItems: 'center' },
  loadText: { fontSize: 10.5, fontWeight: '600', letterSpacing: 1.9, color: '#566681' },
  hero: { position: 'absolute', width: HERO, height: HERO, overflow: 'hidden' },
  heroImg: { width: '100%', height: '100%' },
});
