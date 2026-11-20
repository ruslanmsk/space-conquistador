import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";
import { SpaceBackground } from "./SpaceBackground";

/** Full-screen space backdrop; content is capped to phone width so the web build looks like the app. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <SpaceBackground />
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center" },
});
