import { getOpponent } from "@space-conquistador/game-core";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, Line, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../src/components/Button";
import { CategoryGlyphG } from "../src/components/CategoryGlyph";
import { HalftoneDefs, PlanetArt } from "../src/components/PlanetArt";
import { Screen } from "../src/components/Screen";
import { markRulesSeen } from "../src/storage/settings";
import { useMatchStore } from "../src/store/matchStore";
import { colors } from "../src/theme/colors";
import { fonts } from "../src/theme/type";

/** Small diagrams instead of emoji: each rule gets a picture drawn from the game's own parts. */
function Diagram({ kind }: { kind: "expand" | "sector" | "capital" | "wager" }) {
  return (
    <Svg width={84} height={64} viewBox="0 0 42 32">
      <Defs>
        <HalftoneDefs id={`rh-${kind}`} size={0.8} />
      </Defs>
      {kind === "expand" && (
        <G>
          <Line x1={10} y1={22} x2={30} y2={10} stroke={colors.human} strokeWidth={0.8} />
          <PlanetArt id="earth" cx={10} cy={22} r={5} uid={`r-${kind}`} halftoneId={`rh-${kind}`} />
          <PlanetArt id="mars" cx={30} cy={10} r={3.6} uid={`r-${kind}`} halftoneId={`rh-${kind}`} />
          <Circle cx={30} cy={10} r={5.2} stroke={colors.human} strokeWidth={0.9} fill="none" />
        </G>
      )}
      {kind === "sector" && (
        <G>
          <PlanetArt id="jupiter" cx={20} cy={17} r={8} uid={`r-${kind}`} halftoneId={`rh-${kind}`} />
          <Circle cx={27} cy={9} r={4} fill={colors.paper} stroke={colors.ink} strokeWidth={0.5} />
          <CategoryGlyphG category="История" x={27} y={9} size={5.5} color={colors.ink} />
        </G>
      )}
      {kind === "capital" && (
        <G>
          <PlanetArt id="neptune" cx={21} cy={19} r={7.5} uid={`r-${kind}`} halftoneId={`rh-${kind}`} />
          {[0, 1, 2].map((i) => (
            <Path
              key={i}
              d={`M ${15 + i * 6 - 2} 5 L ${15 + i * 6 + 2} 5 L ${15 + i * 6 + 2} 7.5 Q ${15 + i * 6} 10 ${15 + i * 6 - 2} 7.5 Z`}
              fill={i < 2 ? colors.gold : "none"}
              stroke={colors.gold}
              strokeWidth={0.6}
            />
          ))}
        </G>
      )}
      {kind === "wager" && (
        <G>
          {[0, 1, 2, 3].map((i) => (
            <G key={i}>
              <Path d={`M 11 ${24 - i * 4} L 11 ${26 - i * 4} A 10 3 0 0 0 31 ${26 - i * 4} L 31 ${24 - i * 4}`} fill={colors.goldDeep} stroke={colors.ink} strokeWidth={0.6} />
              <Ellipse cx={21} cy={24 - i * 4} rx={10} ry={3} fill={colors.gold} stroke={colors.ink} strokeWidth={0.6} />
            </G>
          ))}
        </G>
      )}
    </Svg>
  );
}

const RULES = [
  {
    kind: "expand" as const,
    title: "1. Раздел системы",
    text: "Оба отвечают на один вопрос. Самый быстрый верный ответ — две планеты, второй — одна. В числовых вопросах выигрывает тот, кто ближе. Занимать можно свободные планеты рядом со своими.",
  },
  {
    kind: "sector" as const,
    title: "2. Сектора",
    text: "У каждой планеты своя тема вопросов. Атакуя, вы выбираете тему: бейте туда, где соперник слаб. Газовые гиганты стоят больше, аванпосты дают бустер.",
  },
  {
    kind: "capital" as const,
    title: "3. Битва и столица",
    text: "Ходы по очереди. Верно ответили только вы — планета ваша. Оба верно — решающий числовой вопрос. У столицы три щита: собьёте все — вся система ваша.",
  },
  {
    kind: "wager" as const,
    title: "4. Ва-банк",
    text: "После битвы — финальный вопрос. Тема известна заранее, вы ставите до половины очков. Верно — ставка прибавится, неверно — сгорит. Так можно отыграться.",
  },
];

export default function Rules() {
  const insets = useSafeAreaInsets();
  const { then, id } = useLocalSearchParams<{ then?: string; id?: string }>();
  const done = () => {
    void markRulesSeen();
    if (then === "match") {
      useMatchStore.getState().newMatch(getOpponent(String(id ?? "")));
      router.replace("/match");
    } else router.back();
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.title}>Как играть</Text>
        <Text style={styles.lead}>Матч длится 6–8 минут. Знания решают, скорость помогает.</Text>
        {RULES.map((r) => (
          <View key={r.kind} style={styles.rule}>
            <Diagram kind={r.kind} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>{r.title}</Text>
              <Text style={styles.ruleText}>{r.text}</Text>
            </View>
          </View>
        ))}
        <View style={styles.boosters}>
          <Text style={styles.ruleTitle}>Бустеры</Text>
          <Text style={styles.ruleText}>
            <Text style={styles.b}>50/50</Text> убирает два неверных варианта, <Text style={styles.b}>Вилка</Text> показывает
            диапазон числового ответа. По одному в начале, ещё — за серию из трёх верных ответов и за аванпосты.
          </Text>
        </View>
        <Button title={then === "match" ? "Понятно, в бой" : "Понятно"} onPress={done} style={{ marginTop: 12 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, gap: 14 },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.text },
  lead: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginTop: -6 },
  rule: { flexDirection: "row", gap: 14, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line, alignItems: "flex-start" },
  ruleTitle: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.text },
  ruleText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 4 },
  b: { fontFamily: fonts.bodyBold, color: colors.gold },
  boosters: { paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line },
});
