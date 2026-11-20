import { OPPONENTS, getLegalAttackTargets, getLegalPicks } from "@space-conquistador/game-core";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../src/components/Avatar";
import { Hud } from "../src/components/Hud";
import { PlanetCard } from "../src/components/PlanetCard";
import { QuestionStage } from "../src/components/QuestionStage";
import { ResultPanel } from "../src/components/ResultPanel";
import { Screen } from "../src/components/Screen";
import { StarMap } from "../src/components/StarMap";
import { WagerPanel } from "../src/components/WagerPanel";
import { stepHint } from "../src/game/labels";
import { mainOpponent, mySeat, seatAvatarId, seatColor } from "../src/game/seats";
import { useProgressData } from "../src/hooks/useProgressData";
import { useMatchStore } from "../src/store/matchStore";
import { colors } from "../src/theme/colors";
import { fonts } from "../src/theme/type";
import { haptics } from "../src/utils/haptics";
import { sound } from "../src/utils/sound";

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const match = useMatchStore((s) => s.match);
  const answersAt = useMatchStore((s) => s.answersAt);
  const questionShownAt = useMatchStore((s) => s.questionShownAt);
  const questionSerial = useMatchStore((s) => s.questionSerial);
  const { answer, boost, pick, attack, wager, next, restore, newMatch, abandon } = useMatchStore.getState();
  const progress = useProgressData();
  const [inspected, setInspected] = useState<string | null>(null);

  useEffect(() => {
    if (!useMatchStore.getState().match) {
      void restore().then((ok) => {
        if (!ok) router.replace("/");
      });
    }
  }, [restore]);

  const step = match?.step;
  const selectKind =
    step?.type === "pick" && step.queue[0] === mySeat
      ? "pick"
      : step?.type === "attack" && step.player === mySeat
        ? "attack"
        : null;

  const selectable = useMemo(() => {
    if (!match || !selectKind) return [];
    return selectKind === "pick" ? getLegalPicks(match, mySeat) : getLegalAttackTargets(match, mySeat);
  }, [match, selectKind]);

  // Close the inspector whenever the turn moves on.
  useEffect(() => setInspected(null), [step?.type, match?.round]);

  // Capture sound when ownership changes on the map.
  const ownersKey = match ? Object.values(match.owners).join(",") : "";
  const [prevOwners, setPrevOwners] = useState(ownersKey);
  useEffect(() => {
    if (prevOwners && ownersKey !== prevOwners) {
      sound.play("capture", 0.8);
      haptics.impact();
    }
    setPrevOwners(ownersKey);
  }, [ownersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match || !step) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </Screen>
    );
  }

  const act = (id: string) => {
    haptics.impact();
    setInspected(null);
    if (selectKind === "pick") pick(id);
    else if (selectKind === "attack") attack(id);
  };

  const onTap = (id: string) => {
    haptics.tap();
    // During expansion picks are quick and safe: one tap takes the planet.
    if (selectKind === "pick" && selectable.includes(id)) {
      act(id);
      return;
    }
    setInspected((cur) => (cur === id ? null : id));
  };

  const hint = stepHint(match);
  const opponent = mainOpponent(match);
  const oppIndex = OPPONENTS.findIndex((o) => o.id === opponent?.id);
  const nextOpp = oppIndex >= 0 ? OPPONENTS[oppIndex + 1] : undefined;

  return (
    <Screen>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.replace("/")} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>← Меню</Text>
        </Pressable>
        <Hud state={match} />
      </View>

      <StarMap
        state={match}
        selectable={selectable}
        selectKind={selectKind}
        selected={inspected}
        onTap={onTap}
        battleTarget={match.battle?.target ?? null}
      />

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {inspected ? (
          <PlanetCard
            state={match}
            planet={inspected}
            progress={progress}
            action={selectable.includes(inspected) ? selectKind : null}
            onAction={() => act(inspected)}
            onClose={() => setInspected(null)}
          />
        ) : hint.text ? (
          <Animated.View
            key={hint.text}
            entering={FadeInDown.duration(200)}
            style={[styles.hint, hint.seat && { borderColor: seatColor(match, hint.seat) }]}
          >
            {hint.seat && <Avatar id={seatAvatarId(match, hint.seat)} size={28} ring={seatColor(match, hint.seat)} uid="hint" />}
            <Text style={styles.hintText}>{hint.text}</Text>
          </Animated.View>
        ) : null}
      </View>

      {(step.type === "question" || step.type === "reveal") && (
        <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
          <QuestionStage
            key={`q-${questionSerial}`}
            state={match}
            q={step.type === "question" ? step.q : null}
            reveal={step.type === "reveal" ? step.reveal : null}
            questionShownAt={questionShownAt}
            answersAt={answersAt}
            onAnswer={answer}
            onBoost={boost}
            onNext={next}
          />
        </Animated.View>
      )}
      {step.type === "wager" && <WagerPanel state={match} onWager={wager} />}
      {step.type === "finished" && (
        <ResultPanel
          state={match}
          onRematch={() => opponent && newMatch(opponent)}
          onNext={nextOpp ? () => newMatch(nextOpp) : null}
          onMenu={() => {
            abandon();
            router.replace("/");
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { paddingHorizontal: 12 },
  back: { alignSelf: "flex-start", paddingVertical: 4, marginBottom: 6 },
  backText: { fontFamily: fonts.bodyBold, color: colors.muted, fontSize: 14 },
  bottom: { paddingHorizontal: 12, minHeight: 64, justifyContent: "flex-end" },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.raised,
    borderWidth: 2,
    borderColor: colors.human,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  hintText: { flex: 1, fontFamily: fonts.bodySemi, color: colors.text, fontSize: 14, lineHeight: 19 },
});
