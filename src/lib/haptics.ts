// Thin wrappers around expo-haptics. All calls are fire-and-forget and swallow
// errors so they're safe on web / unsupported devices (and during early boot).
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

export function tapLight() {
  if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function tapSelection() {
  if (enabled) Haptics.selectionAsync().catch(() => {});
}

export function notifySuccess() {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function notifyError() {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
