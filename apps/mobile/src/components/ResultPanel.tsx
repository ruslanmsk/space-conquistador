import { OPPONENTS, getScores, type MatchState, type PlayerTally } from "@space-conquistador/game-core";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatNumber, formatSeconds, planetName } from "../game/labels";
import { starsFor } from "../storage/progress";
import { colors, playerColor } from "../theme/colors";
import { fonts } from "../theme/type";
import { haptics } from "../utils/haptics";
import { sound } from "../utils/sound";
import { Avatar } from "./Avatar";
import { Button } from "./Button";

type Props = { state: MatchState; onRematch: () => void; onNext: (() => void) | null; onMenu: () => void };

function Stat({ label, you, them }: { label: string; you: string; them: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color: colors.human }]}>{you}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statVal, { color: colors.bot, textAlign: "right" }]}>{them}</Text>
    </View>
  );
}

const avg = (t: PlayerTally) => (t.correct ? formatSeconds(t.correctMs / t.correct) : "—");

function Star({ on, delay }: { on: boolean; delay: number }) {
  return (
    <Animated.Text entering={ZoomIn.delay(delay).springify()} style={[styles.star, { color: on ? colors.gold : colors.line }]}>
      ★
    </Animated.Text>
  );
}

export function ResultPanel({ state, onRematch, onNext, onMenu }: Props) {
  const insets = useSafeAreaInsets();
  const scores = getScores(state);
  const win = state.winner === "human";
  const draw = state.winner === "draw";
  const stars = starsFor(state);
  const opp = state.config.opponent;
  const th = state.tally.human;
  const tb = state.tally.bot;

  useEffect(() => {
    sound.play(win ? "win" : "lose");
    if (win) haptics.success();
    else haptics.error();
  }, [win]);

  const title = draw ? "Ничья" : win ? "Победа" : "Поражение";
  const reason =
    state.endReason === "capital"
      ? win
        ? `Вы взяли столицу — ${planetName(state, state.map.planets.find((p) => p.capitalOf === "bot")!.id)}`
        : "Соперник взял вашу столицу"
      : draw
        ? "Очки поровну"
        : win
          ? "Больше очков после финала"
          : "У соперника больше очков";
  const isLastOpponent = OPPONENTS[OPPONENTS.length - 1]!.id === opp.id;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20 }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Animated.Text entering={FadeIn.duration(300)} style={styles.kicker}>
          {opp.name}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(80).duration(350)} style={[styles.title, { color: draw ? colors.text : win ? colors.gold : colors.human }]}>
          {title}
        </Animated.Text>
        <Text style={styles.reason}>{reason}</Text>

        <View style={styles.stars}>
          <Star on={stars >= 1} delay={300} />
          <Star on={stars >= 2} delay={450} />
          <Star on={stars >= 3} delay={600} />
        </View>
        <Text style={styles.starHint}>★ победа · ★★ все щиты целы · ★★★ взять столицу</Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreSide}>
            <Avatar id="you" size={52} ring={colors.human} uid="res-h" />
            <Text style={[styles.score, { color: playerColor("human") }]}>{formatNumber(scores.human)}</Text>
          </View>
          <Text style={styles.vs}>:</Text>
          <View style={styles.scoreSide}>
            <Avatar id={opp.id} size={52} ring={colors.bot} uid="res-b" />
            <Text style={[styles.score, { color: playerColor("bot") }]}>{formatNumber(scores.bot)}</Text>
          </View>
        </View>

        <Animated.View entering={FadeInDown.delay(400).duration(300)} style={styles.stats}>
          <Stat label="Верных ответов" you={`${th.correct}/${th.answered}`} them={`${tb.correct}/${tb.answered}`} />
          <Stat label="Средняя скорость" you={avg(th)} them={avg(tb)} />
          <Stat label="Лучшая серия" you={`${th.bestStreak}`} them={`${tb.bestStreak}`} />
          <Stat label="Захвачено в бою" you={`${th.captured}`} them={`${tb.captured}`} />
          <Stat label="Отбито атак" you={`${th.defended}`} them={`${tb.defended}`} />
        </Animated.View>

        <View style={styles.actions}>
          {win && onNext && !isLastOpponent ? (
            <Button title="Следующий соперник" onPress={onNext} />
          ) : (
            <Button title="Реванш" onPress={onRematch} />
          )}
          {win && onNext && !isLastOpponent && <Button title="Реванш" variant="secondary" onPress={onRematch} />}
          <Button title="В меню" variant="ghost" onPress={onMenu} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, alignItems: "stretch" },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.muted, textAlign: "center" },
  title: { fontFamily: fonts.display, fontSize: 44, lineHeight: 52, textAlign: "center" },
  reason: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, textAlign: "center" },
  stars: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 16 },
  star: { fontSize: 40, lineHeight: 46 },
  starHint: { fontFamily: fonts.body, fontSize: 11, color: colors.dim, textAlign: "center", marginTop: 2 },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 22 },
  scoreSide: { alignItems: "center", gap: 6 },
  score: { fontFamily: fonts.display, fontSize: 26, fontVariant: ["tabular-nums"] },
  vs: { fontFamily: fonts.display, fontSize: 26, color: colors.dim, marginTop: 50 },
  stats: { marginTop: 22, borderTopWidth: 2, borderColor: colors.line },
  stat: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line },
  statVal: { fontFamily: fonts.displayBold, fontSize: 15, width: 70 },
  statLabel: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, textAlign: "center" },
  actions: { gap: 10, marginTop: 24 },
});
