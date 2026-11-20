import { OPPONENTS } from "@space-conquistador/game-core";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../src/components/Avatar";
import { Button } from "../src/components/Button";
import { Poster } from "../src/components/Poster";
import { Screen } from "../src/components/Screen";
import { Slab } from "../src/components/Slab";
import { LEVEL_LABELS } from "../src/game/labels";
import { useProgressData } from "../src/hooks/useProgressData";
import { loadMatchState } from "../src/storage/matchPersist";
import { isUnlocked, nextOpponentIndex } from "../src/storage/progress";
import { useMatchStore } from "../src/store/matchStore";
import { colors } from "../src/theme/colors";
import { fonts } from "../src/theme/type";
import { haptics } from "../src/utils/haptics";

function Stars({ n }: { n: number }) {
  return (
    <Text style={styles.stars}>
      <Text style={{ color: colors.gold }}>{"★".repeat(n)}</Text>
      <Text style={{ color: colors.line }}>{"★".repeat(3 - n)}</Text>
    </Text>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const progress = useProgressData();
  const [canContinue, setCanContinue] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const live = useMatchStore.getState().match;
      if (live && live.phase !== "finished") setCanContinue(true);
      else void loadMatchState().then((s) => setCanContinue(!!s));
    }, []),
  );

  const nextIdx = progress ? nextOpponentIndex(progress) : 0;
  const next = OPPONENTS[nextIdx]!;
  const posterW = Math.min(width, 520);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}>
        <Poster width={posterW} height={posterW * 0.62} />
        <View style={styles.pad}>
          <Text style={styles.title}>SPACE{"\n"}CONQUISTADOR</Text>
          <Text style={styles.tagline}>Квиз-завоевание Солнечной системы. Отвечайте быстрее — забирайте планеты.</Text>

          <View style={styles.actions}>
            {canContinue && (
              <Button title="Продолжить матч" onPress={() => router.push("/match")} />
            )}
            <Button
              variant={canContinue ? "secondary" : "primary"}
              title={`В бой: ${next.name}`}
              caption={`${LEVEL_LABELS[next.level]} соперник · миссия ${nextIdx + 1} из ${OPPONENTS.length}`}
              icon={<Avatar id={next.id} size={40} uid="cta" />}
              onPress={() => router.push({ pathname: "/briefing", params: { id: next.id } })}
            />
          </View>

          <Text style={styles.section}>Кампания</Text>
          <View style={{ gap: 10 }}>
            {OPPONENTS.map((o, i) => {
              const open = progress ? isUnlocked(progress, i) : i === 0;
              const stars = progress?.stars[o.id] ?? 0;
              return (
                <Animated.View key={o.id} entering={FadeInDown.delay(60 * i).duration(250)}>
                  <Pressable
                    disabled={!open}
                    onPress={() => {
                      haptics.tap();
                      router.push({ pathname: "/briefing", params: { id: o.id } });
                    }}
                  >
                    {({ pressed }) => (
                      <Slab pressed={pressed} depth={4} color={open ? colors.raised : colors.sunken} border={i === nextIdx ? colors.gold : colors.ink}>
                        <View style={[styles.opp, !open && { opacity: 0.5 }]}>
                          <Text style={styles.oppNum}>{String(i + 1).padStart(2, "0")}</Text>
                          <Avatar id={o.id} size={44} uid={`list-${o.id}`} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.oppName}>{o.name}</Text>
                            <Text style={styles.oppMeta}>{open ? `${LEVEL_LABELS[o.level]} · сильна в: ${o.strong.slice(0, 2).join(", ")}` : "Победите предыдущего соперника"}</Text>
                          </View>
                          {open ? <Stars n={stars} /> : <Text style={styles.lock}>⌧</Text>}
                        </View>
                      </Slab>
                    )}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.links}>
            <Button title="Как играть" variant="ghost" onPress={() => router.push("/rules")} />
            <Button title="Статистика" variant="ghost" onPress={() => router.push("/stats")} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: colors.text, letterSpacing: -0.5, marginTop: 4 },
  tagline: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.muted, marginTop: 8 },
  actions: { gap: 12, marginTop: 20 },
  section: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.muted,
    marginTop: 28,
    marginBottom: 10,
  },
  opp: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10 },
  oppNum: { fontFamily: fonts.display, fontSize: 12, color: colors.dim, width: 26 },
  oppName: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.text },
  oppMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  stars: { fontSize: 16, letterSpacing: 1 },
  lock: { fontSize: 18, color: colors.dim },
  links: { flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 18 },
});
