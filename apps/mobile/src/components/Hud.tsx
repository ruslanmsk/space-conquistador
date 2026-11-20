import { getScores, ownedPlanets, type MatchState, type PlayerId } from "@space-conquistador/game-core";
import { StyleSheet, Text, View } from "react-native";
import { phaseLabel } from "../game/labels";
import { colors, playerColor } from "../theme/colors";

function activePlayer(state: MatchState): PlayerId | null {
  const s = state.step;
  if (s.type === "pick") return s.queue[0] ?? null;
  if (s.type === "attack") return s.player;
  return null;
}

function PlayerCard({ state, player, active }: { state: MatchState; player: PlayerId; active: boolean }) {
  const color = playerColor(player);
  const score = getScores(state)[player];
  const planets = ownedPlanets(state, player).length;
  const shields = state.shields[player];
  return (
    <View style={[styles.card, { borderColor: active ? color : colors.border }, active && { shadowColor: color }]}>
      <View style={styles.cardTop}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.name}>{player === "human" ? "Вы" : "Бот"}</Text>
        <Text style={styles.shields}>{"◆".repeat(shields)}<Text style={styles.shieldsOff}>{"◆".repeat(Math.max(0, state.config.capitalShields - shields))}</Text></Text>
      </View>
      <Text style={[styles.score, { color }]}>{score}</Text>
      <Text style={styles.sub}>
        {planets} {plural(planets, "планета", "планеты", "планет")}
      </Text>
    </View>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function Hud({ state }: { state: MatchState }) {
  const active = activePlayer(state);
  return (
    <View>
      <View style={styles.row}>
        <PlayerCard state={state} player="human" active={active === "human"} />
        <PlayerCard state={state} player="bot" active={active === "bot"} />
      </View>
      <Text style={styles.phase}>{phaseLabel(state)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    shadowColor: "transparent",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  shields: { color: colors.accent, fontSize: 10, letterSpacing: 1 },
  shieldsOff: { color: colors.dim },
  score: { fontSize: 26, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  sub: { color: colors.muted, fontSize: 12 },
  phase: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 10,
  },
});
