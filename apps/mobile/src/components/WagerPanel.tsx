import { getScores, maxWager, type MatchState } from "@space-conquistador/game-core";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatNumber } from "../game/labels";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { haptics } from "../utils/haptics";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { CategoryGlyph } from "./CategoryGlyph";
import { Slab } from "./Slab";

/**
 * "Ва-банк": the category is revealed, then each side bets up to half its score on one question.
 * Right answer adds the bet, wrong subtracts it.
 */
export function WagerPanel({ state, onWager }: { state: MatchState; onWager: (n: number) => void }) {
  const insets = useSafeAreaInsets();
  const step = state.step;
  const max = maxWager(state, "human");
  const scores = getScores(state);
  const [bet, setBet] = useState(Math.round(max / 2 / 50) * 50);
  if (step.type !== "wager") return null;
  const placed = step.bets.human !== undefined;
  const botPlaced = step.bets.bot !== undefined;
  const opp = state.config.opponent;
  const edge = opp.strong.includes(step.category) ? "сильная тема соперника" : opp.weak.includes(step.category) ? "слабая тема соперника" : null;
  const lead = scores.human - scores.bot;
  const options = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round((max * k) / 50) * 50);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <Animated.Text entering={FadeIn.duration(300)} style={styles.kicker}>
        Финал
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(100).duration(300)} style={styles.title}>
        Ва-банк
      </Animated.Text>
      <Text style={styles.lead}>
        Один вопрос. Верно — ставка прибавится, неверно — сгорит.{" "}
        {lead > 0 ? `Вы впереди на ${formatNumber(lead)}.` : lead < 0 ? `Вы отстаёте на ${formatNumber(-lead)}.` : "Счёт равный."}
      </Text>

      <Animated.View entering={FadeInDown.delay(250).duration(300)}>
        <Slab color={colors.paper} shadow={colors.bgDeep} depth={5}>
          <View style={styles.cat}>
            <CategoryGlyph category={step.category} size={34} color={colors.ink} />
            <View style={{ flex: 1 }}>
              <Text style={styles.catLabel}>Тема вопроса</Text>
              <Text style={styles.catName}>{step.category}</Text>
              {edge && <Text style={[styles.catEdge, { color: edge.startsWith("сильная") ? colors.human : colors.goldDeep }]}>{edge}</Text>}
            </View>
          </View>
        </Slab>
      </Animated.View>

      <View style={styles.betBox}>
        <Text style={styles.betLabel}>Ваша ставка</Text>
        <Text style={styles.betValue}>{formatNumber(placed ? step.bets.human! : bet)}</Text>
        <Text style={styles.betMax}>максимум {formatNumber(max)} — половина ваших очков</Text>
        <View style={styles.options}>
          {options.map((v, i) => (
            <Pressable
              key={i}
              disabled={placed}
              onPress={() => {
                haptics.tap();
                setBet(v);
              }}
              style={[styles.opt, bet === v && styles.optOn]}
            >
              <Text style={[styles.optText, bet === v && { color: colors.ink }]}>{i === 0 ? "0" : i === 4 ? "всё" : `${i * 25}%`}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ flex: 1 }} />
      <View style={styles.bot}>
        <Avatar id={opp.id} size={32} ring={colors.bot} uid="wager" />
        <Text style={styles.botText}>{botPlaced ? `${opp.name} сделал ставку` : `${opp.name} думает над ставкой…`}</Text>
      </View>
      <Button
        title={placed ? "Ставка принята" : "Поставить"}
        disabled={placed}
        onPress={() => {
          haptics.impact();
          onWager(bet);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, paddingHorizontal: 20, gap: 14 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, color: colors.gold, textTransform: "uppercase" },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.text, marginTop: -8 },
  lead: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.muted },
  cat: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  catLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.inkMuted },
  catName: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  catEdge: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.human, marginTop: 2 },
  betBox: { alignItems: "center", marginTop: 8 },
  betLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: colors.muted },
  betValue: { fontFamily: fonts.display, fontSize: 48, color: colors.gold, fontVariant: ["tabular-nums"] },
  betMax: { fontFamily: fonts.body, fontSize: 12, color: colors.dim },
  options: { flexDirection: "row", gap: 6, marginTop: 14 },
  opt: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 4, borderWidth: 2, borderColor: colors.lineHi },
  optOn: { backgroundColor: colors.gold, borderColor: colors.ink },
  optText: { fontFamily: fonts.displayBold, fontSize: 13, color: colors.text },
  bot: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center" },
  botText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
});
