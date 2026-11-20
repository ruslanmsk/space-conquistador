import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { prefs } from "./prefs";

function safe(p: () => Promise<void>) {
  if (Platform.OS === "web" || !prefs.haptics) return;
  p().catch(() => {});
}

const android = Platform.OS === "android";
const AT = Haptics.AndroidHaptics;

/** Short and crisp; strength follows the importance of the event. */
export const haptics = {
  tap: () => safe(() => (android ? Haptics.performAndroidHapticsAsync(AT.Segment_Tick) : Haptics.selectionAsync())),
  tick: () => safe(() => (android ? Haptics.performAndroidHapticsAsync(AT.Clock_Tick) : Haptics.selectionAsync())),
  impact: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () =>
    safe(() =>
      android
        ? Haptics.performAndroidHapticsAsync(AT.Confirm)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
  error: () =>
    safe(() =>
      android
        ? Haptics.performAndroidHapticsAsync(AT.Reject)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    ),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
