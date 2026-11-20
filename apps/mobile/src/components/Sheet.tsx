import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Platform, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

/** Bottom sheet over a dimmed backdrop that slides in on mount. */
export function Sheet({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [v]);

  return (
    <Animated.View style={[styles.backdrop, { opacity: v }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          style={{
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
          }}
        >
          {children}
          <Animated.View style={{ height: insets.bottom, backgroundColor: colors.panelSolid }} />
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "flex-end" },
});
