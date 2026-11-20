import { getScores, ownedPlanets, type MatchState, type PlayerId } from "@space-conquistador/game-core";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatNumber, phaseLabel, plural } from "../game/labels";
import { colors, playerColor } from "../theme/colors";
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

function Plate({ state, player, active }: { state: MatchState; player: PlayerId; active: boolean }) {
  const score = useCountUp(getScores(state)[player]);
  const planets = ownedPlanets(state, player).length;
  const color = playerColor(player);
  const name = player === "human" ? "Вы" : state.config.opponent.name;
  const b = state.boosters[player];
  const right = player === "bot";
  return (
    <View style={[styles.plate, right && styles.plateRight, active && { borderColor: color }]}>
      <Avatar id={player === "human" ? "you" : state.config.opponent.id} size={36} ring={color} uid={`hud-${player}`} />
      <View style={[styles.plateText, right && { alignItems: "flex-end" }]}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={[styles.scoreRow, right && { flexDirection: "row-reverse" }]}>
          <Text style={[styles.score, { color }]}>{formatNumber(score)}</Text>
          {state.streak[player] >= 2 && (
            <View style={styles.streak}>
              <Text style={styles.streakText}>×{state.streak[player]}</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {planets} {plural(planets, ["планета", "планеты", "планет"])} · бустеров {b.fifty + b.range}
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
  return (
    <View>
      <View style={styles.row}>
        <Plate state={state} player="human" active={actor === "human"} />
        <Plate state={state} player="bot" active={actor === "bot"} />
      </View>
      <View style={styles.phase}>
        <Text style={styles.phaseTitle}>{phase.title}</Text>
        {state.phase === "battle" ? (
          <View style={styles.turns}>
            {Array.from({ length: turns }, (_, i) => (
              <View key={i} style={[styles.turn, i < state.round - 1 && styles.turnDone, i === state.round - 1 && styles.turnNow]} />
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
