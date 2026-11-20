import { getLegalAttackTargets, getLegalPicks } from "@space-conquistador/game-core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MatchController } from "../game/controller";
import { stepHint } from "../game/labels";
import { MeContext } from "../game/me";
import { isMe, seatAvatarId, seatColor, seatName } from "../game/seats";
import { useProgressData } from "../hooks/useProgressData";
import { useSecondsLeft } from "../hooks/useNow";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { haptics } from "../utils/haptics";
import { sound } from "../utils/sound";
import { Avatar } from "./Avatar";
import { Hud } from "./Hud";
import { PlanetCard } from "./PlanetCard";
import { QuestionStage } from "./QuestionStage";
import { StarMap } from "./StarMap";
import { WagerPanel } from "./WagerPanel";

type Props = {
  ctl: MatchController;
  onBack: () => void;
  /** Shown over everything once the match is finished. */
  result: ReactNode;
};

/** The match screen: map, HUD, question stage, wager and result — for the bot game and online alike. */
export function MatchView({ ctl, onBack, result }: Props) {
  return (
    <MeContext.Provider value={ctl.me}>
      <MatchBody ctl={ctl} onBack={onBack} result={result} />
    </MeContext.Provider>
  );
}

function MatchBody({ ctl, onBack, result }: Props) {
  const insets = useSafeAreaInsets();
  const { state: match, me, online } = ctl;
  const progress = useProgressData();
  const [inspected, setInspected] = useState<string | null>(null);

  const step = match.step;
  const selectKind =
    step.type === "pick" && step.queue[0] === me ? "pick" : step.type === "attack" && step.player === me ? "attack" : null;

  const selectable = useMemo(() => {
    if (!selectKind) return [];
    return selectKind === "pick" ? getLegalPicks(match, me) : getLegalAttackTargets(match, me);
  }, [match, me, selectKind]);

  // Close the inspector whenever the turn moves on.
  useEffect(() => setInspected(null), [step.type, match.round]);

  // Capture sound when ownership changes on the map.
  const ownersKey = Object.values(match.owners).join(",");
  const [prevOwners, setPrevOwners] = useState(ownersKey);
  useEffect(() => {
    if (prevOwners && ownersKey !== prevOwners) {
      sound.play("capture", 0.8);
      haptics.impact();
    }
    setPrevOwners(ownersKey);
  }, [ownersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const turnLeft = useSecondsLeft(step.type === "pick" || step.type === "attack" ? online?.turnUntil : null);

  const act = (id: string) => {
    haptics.impact();
    setInspected(null);
    if (selectKind === "pick") ctl.pick(id);
    else if (selectKind === "attack") ctl.attack(id);
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

  const hint = stepHint(match, me);
  const offline = (online?.offline ?? []).filter((p) => !isMe(p, me) && !match.eliminated.includes(p));

  return (
    <>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>← Меню</Text>
          </Pressable>
          {/* While the link is down the banner below says so; this stays a quiet status otherwise. */}
          {online && (online.connected || step.type === "finished") && (
            <View style={styles.link}>
              <View style={[styles.linkDot, { backgroundColor: online.connected ? colors.muted : colors.human }]} />
              <Text style={[styles.linkText, !online.connected && { color: colors.human }]}>
                {online.connected ? "онлайн" : "переподключение…"}
              </Text>
            </View>
          )}
        </View>
        <Hud state={match} />
        {offline.length > 0 && (
          <Text style={styles.offline} numberOfLines={1}>
            Не в сети: {offline.map((p) => seatName(match, p, me)).join(", ")} — ходы сделает таймер
          </Text>
        )}
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
            style={[styles.hint, hint.seat && { borderColor: seatColor(match, hint.seat, me) }]}
          >
            {hint.seat && <Avatar id={seatAvatarId(match, hint.seat, me)} size={28} ring={seatColor(match, hint.seat, me)} uid="hint" />}
            <Text style={styles.hintText}>{hint.text}</Text>
            {turnLeft !== null && <Text style={[styles.clock, turnLeft <= 5 && { color: colors.human }]}>{turnLeft} с</Text>}
          </Animated.View>
        ) : null}
      </View>

      {(step.type === "question" || step.type === "reveal") && (
        <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
          <QuestionStage
            key={`q-${ctl.questionKey}`}
            state={match}
            q={step.type === "question" ? step.q : null}
            reveal={step.type === "reveal" ? step.reveal : null}
            questionShownAt={ctl.questionShownAt}
            answersAt={ctl.answersAt}
            onAnswer={ctl.answer}
            onBoost={ctl.boost}
            onNext={ctl.next}
            continued={online?.continued}
          />
        </Animated.View>
      )}
      {step.type === "wager" && <WagerPanel state={match} onWager={ctl.wager} turnUntil={online?.turnUntil} />}
      {step.type === "finished" && result}
      {online && !online.connected && step.type !== "finished" && (
        <View style={[styles.banner, { top: insets.top + 6 }]} pointerEvents="none">
          <Text style={styles.bannerText}>Связь потеряна. Переподключение…</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 12 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  back: { alignSelf: "flex-start", paddingVertical: 4 },
  backText: { fontFamily: fonts.bodyBold, color: colors.muted, fontSize: 14 },
  link: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkDot: { width: 8, height: 8, borderRadius: 1, borderWidth: 1.5, borderColor: colors.ink },
  linkText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.muted },
  offline: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.human, textAlign: "center", marginTop: 6 },
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
  clock: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.muted, fontVariant: ["tabular-nums"] },
  banner: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: colors.human,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bannerText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.humanInk },
});
