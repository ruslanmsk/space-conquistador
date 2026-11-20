import type { BotLevel } from "@space-conquistador/game-core";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../src/components/Button";
import { Logo } from "../src/components/Logo";
import { Screen } from "../src/components/Screen";
import { LEVEL_LABELS } from "../src/game/labels";
import { loadMatchState } from "../src/storage/matchPersist";
import { hasSeenRules, loadLevel, loadStats, saveLevel, type Stats } from "../src/storage/settings";
import { useMatchStore } from "../src/store/matchStore";
import { colors } from "../src/theme/colors";
import { haptics } from "../src/utils/haptics";

const LEVELS: BotLevel[] = ["easy", "normal", "hard"];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [level, setLevel] = useState<BotLevel>("normal");
  const [stats, setStats] = useState<Stats | null>(null);
  const [canContinue, setCanContinue] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadLevel().then(setLevel);
      void loadStats().then(setStats);
      const live = useMatchStore.getState().match;
      if (live && live.phase !== "finished") setCanContinue(true);
      else void loadMatchState().then((s) => setCanContinue(!!s));
    }, []),
  );

  const start = async () => {
    if (await hasSeenRules()) {
      useMatchStore.getState().newMatch(level);
      router.push("/match");
    } else {
      router.push({ pathname: "/rules", params: { then: "match" } });
    }
  };

  const chooseLevel = (l: BotLevel) => {
    haptics.tap();
    setLevel(l);
    void saveLevel(l);
  };

  return (
    <Screen>
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.hero}>
          <Logo size={190} />
          <Text style={styles.title}>SPACE{"\n"}CONQUISTADOR</Text>
          <Text style={styles.subtitle}>Захвати Солнечную систему знаниями</Text>
        </View>

        <View style={styles.actions}>
          {canContinue && <Button title="Продолжить матч" onPress={() => router.push("/match")} />}
          <Button
            title={canContinue ? "Новый матч" : "Играть"}
            variant={canContinue ? "secondary" : "primary"}
            onPress={() => void start()}
          />

          <Text style={styles.label}>Сложность бота</Text>
          <View style={styles.segment}>
            {LEVELS.map((l) => (
              <Pressable
                key={l}
                onPress={() => chooseLevel(l)}
                style={[styles.segItem, level === l && styles.segActive]}
              >
                <Text style={[styles.segText, level === l && styles.segTextActive]}>{LEVEL_LABELS[l]}</Text>
              </Pressable>
            ))}
          </View>

          <Button title="Как играть" variant="ghost" onPress={() => router.push("/rules")} />
          {stats && stats.wins + stats.losses + stats.draws > 0 && (
            <Text style={styles.stats}>
              Побед: {stats.wins} · Поражений: {stats.losses}
              {stats.draws ? ` · Ничьих: ${stats.draws}` : ""}
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  hero: { alignItems: "center", marginTop: 8 },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 3,
    textAlign: "center",
    lineHeight: 38,
    marginTop: 8,
  },
  subtitle: { color: colors.muted, fontSize: 16, marginTop: 10, textAlign: "center" },
  actions: { gap: 12 },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: 8,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  segItem: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  segActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent },
  segText: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  segTextActive: { color: colors.text },
  stats: { color: colors.dim, fontSize: 13, textAlign: "center" },
});
