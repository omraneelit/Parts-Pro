/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemeMode } from '@/lib/theme-mode';

export function useTheme() {
  // Resolved from the user's preference (System / Light / Dark) rather than the
  // OS directly, so the in-app toggle takes effect.
  const { scheme } = useThemeMode();
  return Colors[scheme];
}
