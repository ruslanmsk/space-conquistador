import { getLegalAttackTargets, getLegalPicks } from "@space-conquistador/game-core";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Hud } from "../src/components/Hud";
import { QuestionPanel } from "../src/components/QuestionPanel";
import { ResultPanel } from "../src/components/ResultPanel";
import { RevealPanel } from "../src/components/RevealPanel";
import { Screen } from "../src/components/Screen";
import { Sheet } from "../src/components/Sheet";
import { StarMap } from "../src/components/StarMap";
import { stepHint } from "../src/game/labels";
import { useMatchStore } from "../src/store/matchStore";
import { colors } from "../src/theme/colors";
import { haptics } from "../src/utils/haptics";

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const match = useMatchStore((s) => s.match);
  const questionStartedAt = useMatchStore((s) => s.questionStartedAt);
  const questionSerial = useMatchStore((s) => s.questionSerial);
  const { answer, pick, attack, next, restore, newMatch, abandon } = useMatchStore.getState();

  useEffect(() => {
    if (!useMatchStore.getState().match) {
      void restore().then((ok) => {
        if (!ok) router.replace("/");
      });
    }
  }, [restore]);

  const step = match?.step;
  const selectKind =
    step?.type === "pick" && step.queue[0] === "human"
      ? "pick"
      : step?.type === "attack" && step.player === "human"
        ? "attack"
        : null;

  const selectable = useMemo(() => {
    if (!match || !selectKind) return [];
    return selectKind === "pick" ? getLegalPicks(match, "human") : getLegalAttackTargets(match, "human");
  }, [match, selectKind]);

  if (!match || !step) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const onSelect = (id: string) => {
    haptics.impact();
    if (selectKind === "pick") pick(id);
    else if (selectKind === "attack") attack(id);
  };

  const hint = stepHint(match);
  const battleTarget =
    match.battle && (step.type === "question" || step.type === "reveal") ? match.battle.target : null;

  return (
    <Screen>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.replace("/")} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ Меню</Text>
        </Pressable>
        <Hud state={match} />
      </View>

      <StarMap
        state={match}
        selectable={selectable}
        selectKind={selectKind}
        onSelect={onSelect}
        battleTarget={battleTarget}
      />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
        {hint.text ? (
          <View style={[styles.hint, { borderColor: hint.tone === "bot" ? colors.bot : colors.accent }]}>
            <Text style={styles.hintText}>{hint.text}</Text>
          </View>
        ) : null}
      </View>

      {step.type === "question" && (
        <Sheet key={`q-${questionSerial}`}>
          <QuestionPanel state={match} q={step.q} startedAt={questionStartedAt} onAnswer={answer} />
        </Sheet>
      )}
      {step.type === "reveal" && (
        <Sheet key={`r-${questionSerial}`}>
          <RevealPanel state={match} reveal={step.reveal} onNext={next} />
        </Sheet>
      )}
      {step.type === "finished" && (
        <View style={styles.resultWrap}>
          <ResultPanel
            state={match}
            onRematch={() => newMatch(match.config.botLevel)}
            onMenu={() => {
              abandon();
              router.replace("/");
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { paddingHorizontal: 14 },
  back: { alignSelf: "flex-start", paddingVertical: 4, marginBottom: 8 },
  backText: { color: colors.muted, fontSize: 15, fontWeight: "600" },
  bottom: { paddingHorizontal: 14, minHeight: 70, justifyContent: "flex-end" },
  hint: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  hintText: { color: colors.text, fontSize: 15, fontWeight: "600", textAlign: "center", lineHeight: 20 },
  resultWrap: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
});
