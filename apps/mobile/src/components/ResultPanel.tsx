import { OPPONENTS, getScores, type MatchState, type PlayerId, type PlayerTally } from "@space-conquistador/game-core";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatNumber, formatSeconds, planetName } from "../game/labels";
import { starsFor } from "../storage/progress";
import { mainOpponent, seatAvatarId, seatColor, seatName, seatsFromMe } from "../game/seats";
import { useMe } from "../game/me";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { haptics } from "../utils/haptics";
import { sound } from "../utils/sound";
import { Avatar } from "./Avatar";
import { Button } from "./Button";

type Props = {
  state: MatchState;
  /** null: the rematch is not up to this player (online: only the host restarts) — `rematchNote` explains. */
  onRematch: (() => void) | null;
  rematchNote?: string;
  onNext: (() => void) | null;
  onMenu: () => void;
  /** Bot campaign: stars for the mission. Off online. */
  campaign?: boolean;
};

/** One stat row: mine on the left, the label in the middle, opponents' on the right. */
function Stat({ label, values }: { label: string; values: { text: string; color: string }[] }) {
  const [you, ...them] = values;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color: you!.color }]}>{you!.text}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {them.length === 1 ? (
        <Text style={[styles.statVal, { color: them[0]!.color, textAlign: "right" }]}>{them[0]!.text}</Text>
      ) : (
        them.map((v, i) => (
          <Text key={i} style={[styles.statVal, styles.statValNarrow, { color: v.color }]}>
            {v.text}
          </Text>
        ))
      )}
    </View>
  );
}

const avg = (t: PlayerTally) => (t.correct ? formatSeconds(t.correctMs / t.correct) : "—");
const NO_TALLY: PlayerTally = { answered: 0, correct: 0, correctMs: 0, bestStreak: 0, captured: 0, defended: 0 };

function Star({ on, delay }: { on: boolean; delay: number }) {
  return (
    <Animated.Text entering={ZoomIn.delay(delay).springify()} style={[styles.star, { color: on ? colors.gold : colors.line }]}>
      ★
    </Animated.Text>
  );
}

export function ResultPanel({ state, onRematch, rematchNote, onNext, onMenu, campaign = true }: Props) {
  const me = useMe();
  const insets = useSafeAreaInsets();
  const scores = getScores(state);
  const win = state.winner === me;
  const draw = state.winner === "draw";
  const stars = starsFor(state);
  const opp = mainOpponent(state);
  const seats = seatsFromMe(state, me);
  const duel = seats.length === 2;
  const tally = (p: PlayerId) => state.tally[p] ?? NO_TALLY;
  const row = (f: (t: PlayerTally) => string) => seats.map((p) => ({ text: f(tally(p)), color: seatColor(state, p, me) }));
  const lastFall = [...state.events].reverse().find((e) => e.type === "capital-fell");
  const fallenCapital = lastFall?.type === "capital-fell" ? state.map.planets.find((p) => p.capitalOf === lastFall.loser) : undefined;
  const winnerName = state.winner && state.winner !== "draw" ? seatName(state, state.winner, me) : "";

  useEffect(() => {
    sound.play(win ? "win" : "lose");
    if (win) haptics.success();
    else haptics.error();
  }, [win]);

  const title = draw ? "Ничья" : win ? "Победа" : "Поражение";
  const reason =
    state.endReason === "capital"
      ? win
        ? `Вы взяли столицу — ${fallenCapital ? planetName(state, fallenCapital.id) : ""}`
        : duel
          ? "Соперник взял вашу столицу"
          : `${winnerName} захватил систему`
      : draw
        ? "Очки поровну"
        : win
          ? "Больше очков после финала"
          : duel
            ? "У соперника больше очков"
            : `Больше всех очков — ${winnerName}`;
  const isLastOpponent = !!opp && OPPONENTS[OPPONENTS.length - 1]!.id === opp.id;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20 }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Animated.Text entering={FadeIn.duration(300)} style={styles.kicker}>
          {duel ? `Соперник: ${seatName(state, seats[1]!, me)}` : state.map.name}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(80).duration(350)} style={[styles.title, { color: draw ? colors.text : win ? colors.gold : colors.human }]}>
          {title}
        </Animated.Text>
        <Text style={styles.reason}>{reason}</Text>

        {campaign && (
          <>
            <View style={styles.stars}>
              <Star on={stars >= 1} delay={300} />
              <Star on={stars >= 2} delay={450} />
              <Star on={stars >= 3} delay={600} />
            </View>
            <Text style={styles.starHint}>★ победа · ★★ все щиты целы · ★★★ взять столицу</Text>
          </>
        )}

        <View style={[styles.scoreRow, !duel && { gap: 10 }]}>
          {seats.map((p, i) => (
            <View key={p} style={styles.scoreGroup}>
              {i > 0 && <Text style={[styles.vs, !duel && styles.vsSmall]}>:</Text>}
              <View style={[styles.scoreSide, state.eliminated.includes(p) && { opacity: 0.5 }]}>
                <Avatar id={seatAvatarId(state, p, me)} size={duel ? 52 : 40} ring={seatColor(state, p, me)} uid={`res-${p}`} />
                <Text style={[styles.score, !duel && styles.scoreSmall, { color: seatColor(state, p, me) }]}>
                  {formatNumber(scores[p] ?? 0)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Animated.View entering={FadeInDown.delay(400).duration(300)} style={styles.stats}>
          <Stat label="Верных ответов" values={row((t) => `${t.correct}/${t.answered}`)} />
          <Stat label="Средняя скорость" values={row(avg)} />
          <Stat label="Лучшая серия" values={row((t) => `${t.bestStreak}`)} />
          <Stat label="Захвачено в бою" values={row((t) => `${t.captured}`)} />
          <Stat label="Отбито атак" values={row((t) => `${t.defended}`)} />
        </Animated.View>

        <View style={styles.actions}>
          {win && onNext && !isLastOpponent ? (
            <Button title="Следующий соперник" onPress={onNext} />
          ) : onRematch ? (
            <Button title="Реванш" onPress={onRematch} />
          ) : rematchNote ? (
            <Text style={styles.note}>{rematchNote}</Text>
          ) : null}
          {win && onNext && !isLastOpponent && onRematch && <Button title="Реванш" variant="secondary" onPress={onRematch} />}
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
  scoreGroup: { flexDirection: "row", alignItems: "center", gap: 18 },
  scoreSide: { alignItems: "center", gap: 6 },
  score: { fontFamily: fonts.display, fontSize: 26, fontVariant: ["tabular-nums"] },
  scoreSmall: { fontSize: 18 },
  vs: { fontFamily: fonts.display, fontSize: 26, color: colors.dim, marginTop: 50 },
  vsSmall: { fontSize: 18, marginTop: 44 },
  stats: { marginTop: 22, borderTopWidth: 2, borderColor: colors.line },
  stat: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line },
  statVal: { fontFamily: fonts.displayBold, fontSize: 15, width: 70 },
  statValNarrow: { width: 48, fontSize: 13, textAlign: "right" },
  statLabel: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, textAlign: "center" },
  actions: { gap: 10, marginTop: 24 },
  note: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textAlign: "center", paddingVertical: 12 },
});
