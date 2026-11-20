import { KIND_VALUE, getPlanet, type MatchState, type PlanetId } from "@space-conquistador/game-core";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { KIND_HINTS, KIND_LABELS } from "../game/labels";
import { categoryRate } from "../hooks/useProgressData";
import type { Progress } from "../storage/progress";
import { colors, playerColor } from "../theme/colors";
import { fonts } from "../theme/type";
import { Button } from "./Button";
import { CategoryGlyph } from "./CategoryGlyph";
import { PlanetIcon } from "./PlanetArt";
import { Slab } from "./Slab";

type Props = {
  state: MatchState;
  planet: PlanetId;
  /** "pick" / "attack" when the human may act on this planet now. */
  action: "pick" | "attack" | null;
  progress: Progress | null;
  onAction: () => void;
  onClose: () => void;
};

/** Inspector for a tapped planet: what it is worth, its sector, and the action to take. */
export function PlanetCard({ state, planet, action, progress, onAction, onClose }: Props) {
  const p = getPlanet(state.map, planet);
  const owner = state.owners[planet];
  const sector = state.sectors[planet];
  const value = owner ? state.planetValue[planet] : KIND_VALUE[p.kind];
  const opp = state.config.opponent;
  const oppEdge = sector ? (opp.strong.includes(sector) ? "сильная тема соперника" : opp.weak.includes(sector) ? "слабая тема соперника" : null) : null;
  const myRate = sector && progress ? categoryRate(progress, sector) : null;
  const ownerText = owner === "human" ? "Ваша" : owner === "bot" ? opp.name : "Свободна";

  return (
    <Animated.View entering={FadeInDown.duration(200)}>
      <Slab color={colors.raised} shadow={colors.bgDeep} border={owner ? playerColor(owner) : colors.lineHi} depth={4}>
        <View style={styles.row}>
          <PlanetIcon id={planet} size={56} uid="card" />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.kind}>
              {KIND_LABELS[p.kind]} · {value} очк. · <Text style={{ color: owner ? playerColor(owner) : colors.muted }}>{ownerText}</Text>
            </Text>
            <Text style={styles.hint}>
              {p.capitalOf ? `${KIND_HINTS.capital}. Щитов: ${state.shields[p.capitalOf]}` : KIND_HINTS[p.kind]}
            </Text>
          </View>
          <Text style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть">
            ✕
          </Text>
        </View>
        <View style={styles.sector}>
          {sector ? (
            <>
              <CategoryGlyph category={sector} size={18} color={colors.text} />
              <Text style={styles.sectorText}>
                Сектор «{sector}»
                {myRate !== null ? <Text style={styles.sectorMeta}> · ваши ответы {myRate}%</Text> : null}
              </Text>
            </>
          ) : (
            <Text style={styles.sectorText}>Столица: вопросы на любые темы</Text>
          )}
        </View>
        {oppEdge && (
          <Text style={[styles.edge, { color: oppEdge.startsWith("сильная") ? colors.human : colors.gold }]}>
            {oppEdge === "сильная тема соперника" ? "▲ " : "▼ "}
            {oppEdge}
          </Text>
        )}
        {action && (
          <View style={{ padding: 12, paddingTop: 4 }}>
            <Button title={action === "pick" ? "Занять" : p.capitalOf ? "Штурмовать столицу" : "Атаковать"} onPress={onAction} />
          </View>
        )}
      </Slab>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 12, alignItems: "center" },
  name: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.text },
  kind: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted, marginTop: 2 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.dim, marginTop: 2 },
  close: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.dim, padding: 6, alignSelf: "flex-start" },
  sector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  sectorText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text, flex: 1 },
  sectorMeta: { fontFamily: fonts.body, color: colors.muted },
  edge: { fontFamily: fonts.bodyBold, fontSize: 12, marginHorizontal: 12, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.8 },
});
