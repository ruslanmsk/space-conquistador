import { OPPONENTS } from "@space-conquistador/game-core";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { MatchView } from "../src/components/MatchView";
import { ResultPanel } from "../src/components/ResultPanel";
import { Screen } from "../src/components/Screen";
import type { MatchController } from "../src/game/controller";
import { mainOpponent, mySeat } from "../src/game/seats";
import { useMatchStore } from "../src/store/matchStore";
import { colors } from "../src/theme/colors";

/** Match against a bot (offline, local store). */
export default function MatchScreen() {
  const match = useMatchStore((s) => s.match);
  const answersAt = useMatchStore((s) => s.answersAt);
  const questionShownAt = useMatchStore((s) => s.questionShownAt);
  const questionSerial = useMatchStore((s) => s.questionSerial);
  const { answer, boost, pick, attack, wager, next, restore, newMatch, abandon } = useMatchStore.getState();

  useEffect(() => {
    if (!useMatchStore.getState().match) {
      void restore().then((ok) => {
        if (!ok) router.replace("/");
      });
    }
  }, [restore]);

  const ctl = useMemo<MatchController | null>(
    () =>
      match && {
        state: match,
        me: mySeat,
        questionKey: questionSerial,
        questionShownAt,
        answersAt,
        answer,
        boost,
        pick,
        attack,
        wager,
        next,
      },
    [match, questionSerial, questionShownAt, answersAt, answer, boost, pick, attack, wager, next],
  );

  if (!match || !ctl) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </Screen>
    );
  }

  const opponent = mainOpponent(match);
  const oppIndex = OPPONENTS.findIndex((o) => o.id === opponent?.id);
  const nextOpp = oppIndex >= 0 ? OPPONENTS[oppIndex + 1] : undefined;

  return (
    <Screen>
      <MatchView
        ctl={ctl}
        onBack={() => router.replace("/")}
        result={
          <ResultPanel
            state={match}
            onRematch={() => opponent && newMatch(opponent)}
            onNext={nextOpp ? () => newMatch(nextOpp) : null}
            onMenu={() => {
              abandon();
              router.replace("/");
            }}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
