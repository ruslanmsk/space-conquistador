import { getScores, ownedPlanets, type MatchState, type PlayerId } from "@space-conquistador/game-core";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatNumber, phaseLabel, plural } from "../game/labels";
import { isMe, seatAvatarId, seatColor, seatName, seatsFromMe } from "../game/seats";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { Avatar } from "./Avatar";

/** Counts up/down to the new value over ~500 ms. */
function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = Date.now();
    const a = from.current;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 500);
      const v = Math.round(a + (value - a) * (1 - (1 - t) * (1 - t)));
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return shown;
}

/**
 * Score plate of one player. In a duel the opponent's plate is mirrored to the right edge; with
 * 3–4 players all plates are compact and left-aligned.
 */
function Plate({
  state,
  player,
  active,
  right,
  compact,
}: {
  state: MatchState;
  player: PlayerId;
  active: boolean;
  right: boolean;
  compact: boolean;
}) {
  const score = useCountUp(getScores(state)[player] ?? 0);
  const planets = ownedPlanets(state, player).length;
  const color = seatColor(state, player);
  const name = seatName(state, player);
  const b = state.boosters[player] ?? { fifty: 0, range: 0 };
  const streak = state.streak[player] ?? 0;
  const out = state.eliminated.includes(player);
  return (
    <View style={[styles.plate, right && styles.plateRight, compact && styles.plateCompact, active && { borderColor: color }, out && { opacity: 0.45 }]}>
      <Avatar id={seatAvatarId(state, player)} size={compact ? 28 : 36} ring={color} uid={`hud-${player}`} />
      <View style={[styles.plateText, right && { alignItems: "flex-end" }]}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={[styles.scoreRow, right && { flexDirection: "row-reverse" }]}>
          <Text style={[styles.score, { color }]}>{formatNumber(score)}</Text>
          {streak >= 2 && (
            <View style={styles.streak}>
              <Text style={styles.streakText}>×{streak}</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {out
            ? "выбыл"
            : compact
              ? `${planets} пл. · ${b.fifty + b.range} б.`
              : `${planets} ${plural(planets, ["планета", "планеты", "планет"])} · бустеров ${b.fifty + b.range}`}
        </Text>
      </View>
    </View>
  );
}

export function Hud({ state }: { state: MatchState }) {
  const step = state.step;
  const actor =
    step.type === "pick" ? step.queue[0] : step.type === "attack" ? step.player : null;
  const phase = phaseLabel(state);
  const turns = state.config.battleTurns;
  const seats = seatsFromMe(state);
  const duel = seats.length === 2;
  return (
    <View>
      <View style={[styles.row, !duel && { gap: 4 }]}>
        {seats.map((p) => (
          <Plate key={p} state={state} player={p} active={actor === p} right={duel && !isMe(p)} compact={!duel} />
        ))}
      </View>
      <View style={styles.phase}>
        <Text style={styles.phaseTitle}>{phase.title}</Text>
        {state.phase === "battle" ? (
          <View style={styles.turns}>
            {Array.from({ length: turns }, (_, i) => (
              <View key={i} style={[styles.turn, turns > 12 && { width: 6 }, i < state.round - 1 && styles.turnDone, i === state.round - 1 && styles.turnNow]} />
            ))}
          </View>
        ) : (
          <Text style={styles.phaseDetail}>{phase.detail}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  plate: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  plateRight: { flexDirection: "row-reverse" },
  plateCompact: { gap: 5, padding: 5 },
  plateText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  score: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, fontVariant: ["tabular-nums"] },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  streak: { backgroundColor: colors.gold, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1.5, borderColor: colors.ink },
  streakText: { fontFamily: fonts.display, fontSize: 10, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 10, color: colors.dim },
  phase: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 },
  phaseTitle: { fontFamily: fonts.displayBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.text },
  phaseDetail: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 1 },
  turns: { flexDirection: "row", gap: 3 },
  turn: { width: 10, height: 6, borderRadius: 1, borderWidth: 1.5, borderColor: colors.lineHi },
  turnDone: { backgroundColor: colors.lineHi },
  turnNow: { backgroundColor: colors.gold, borderColor: colors.gold },
});
