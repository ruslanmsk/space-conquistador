import { getOpponent } from "@space-conquistador/game-core";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../src/components/Avatar";
import { Button } from "../src/components/Button";
import { CategoryGlyph } from "../src/components/CategoryGlyph";
import { Screen } from "../src/components/Screen";
import { Slab } from "../src/components/Slab";
import { LEVEL_LABELS } from "../src/game/labels";
import { hasSeenRules } from "../src/storage/settings";
import { useMatchStore } from "../src/store/matchStore";
import { colors } from "../src/theme/colors";
import { fonts } from "../src/theme/type";

function Chip({ category, tone }: { category: string; tone: "strong" | "weak" }) {
  const c = tone === "strong" ? colors.human : colors.gold;
  return (
    <View style={[styles.chip, { borderColor: c }]}>
      <CategoryGlyph category={category} size={16} color={c} />
      <Text style={[styles.chipText, { color: c }]}>{category}</Text>
    </View>
  );
}

/** Pre-match card: who you face and what they know — it tells you which sectors to fight in. */
export default function Briefing() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const opp = getOpponent(String(id ?? ""));

  const start = async () => {
    if (await hasSeenRules()) {
      useMatchStore.getState().newMatch(opp);
      router.replace("/match");
    } else {
      // The match (and its clock) starts only after the player has read the rules.
      router.replace({ pathname: "/rules", params: { then: "match", id: opp.id } });
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        <Button title="← Назад" variant="ghost" onPress={() => router.back()} style={{ alignSelf: "flex-start" }} />
        <Text style={styles.kicker}>Брифинг</Text>
        <Animated.View entering={FadeInDown.duration(300)}>
          <Slab color={colors.paper} shadow={colors.bgDeep} depth={6}>
            <View style={styles.card}>
              <Avatar id={opp.id} size={96} uid="brief" />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{opp.name}</Text>
                <Text style={styles.level}>{LEVEL_LABELS[opp.level]} соперник</Text>
              </View>
            </View>
            <Text style={styles.quote}>«{opp.title}»</Text>
          </Slab>
        </Animated.View>

        <Text style={styles.section}>Сильные темы — здесь атаковать опасно</Text>
        <View style={styles.chips}>
          {opp.strong.map((c) => (
            <Chip key={c} category={c} tone="strong" />
          ))}
        </View>
        <Text style={styles.section}>Слабые темы — бейте сюда</Text>
        <View style={styles.chips}>
          {opp.weak.map((c) => (
            <Chip key={c} category={c} tone="weak" />
          ))}
        </View>

        <Text style={styles.tip}>
          Каждая планета — сектор со своей темой вопросов. Нападая, вы выбираете тему: ищите планеты из слабых тем соперника и
          держите свои сильные.
        </Text>

        <View style={{ flex: 1, minHeight: 24 }} />
        <Button title="Начать матч" onPress={() => void start()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 20, gap: 10 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.gold },
  card: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, paddingBottom: 8 },
  name: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, color: colors.ink },
  level: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.inkMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  quote: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink, padding: 16, paddingTop: 4 },
  section: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: colors.muted, marginTop: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 2, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  tip: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 16 },
});
