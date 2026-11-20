import {
  usableBoosters,
  type ActiveQuestion,
  type BoosterType,
  type MatchState,
  type PlayerId,
  type PublicQuestion,
  type Reveal,
} from "@space-conquistador/game-core";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOOSTER_LABELS, formatNumber, formatSeconds, planetName, revealTitle } from "../game/labels";
import { useCountdown } from "../hooks/useCountdown";
import { isMe, mySeat, opponentSeats, seatAvatarId, seatColor, seatDeep, seatInk, seatName } from "../game/seats";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { haptics } from "../utils/haptics";
import { sound } from "../utils/sound";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { CategoryGlyph } from "./CategoryGlyph";
import { NumberLine } from "./NumberLine";
import { NumericPad, parseNumeric } from "./NumericPad";
import { PlanetIcon } from "./PlanetArt";
import { Slab } from "./Slab";

type Props = {
  state: MatchState;
  /** Active question, or null while showing the reveal. */
  q: ActiveQuestion | null;
  reveal: Reveal | null;
  questionShownAt: number;
  answersAt: number;
  onAnswer: (value: number | null) => void;
  onBoost: (b: BoosterType) => void;
  onNext: () => void;
};

const LETTERS = ["А", "Б", "В", "Г"];
const TILE_H = 52;
const TILE_COMPACT_H = 34;

/** Reveal beats, ms after both answers are in. */
const BEAT = { opponent: 400, correct: 750, verdict: 1150 };

function useReducedStage(reveal: Reveal | null, numeric: boolean) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!reveal) {
      setStage(0);
      return;
    }
    const extra = numeric ? 1100 : 0;
    const ids = [
      setTimeout(() => setStage(1), BEAT.opponent),
      setTimeout(() => setStage(2), BEAT.correct + extra),
      setTimeout(() => setStage(3), BEAT.verdict + extra),
    ];
    return () => ids.forEach(clearTimeout);
  }, [reveal, numeric]);
  return stage;
}

/** Header strip: who plays against whom, and for what. */
function Strip({ state, question, q, reveal, stage }: { state: MatchState; question: PublicQuestion; q: ActiveQuestion | null; reveal: Reveal | null; stage: number }) {
  const kind = (q ?? reveal)!.kind;
  const battle = state.battle;
  let title = "Раздел системы";
  let sub = "Самый быстрый верный — 2 планеты";
  const opponents = opponentSeats(state);
  const duel = opponents.length === 1;
  if (kind === "battle" && battle) {
    const planet = planetName(state, battle.target);
    if (isMe(battle.attacker)) {
      title = `Атака: ${planet}`;
      sub = duel ? "Ответьте верно, а соперник — нет" : `Ответьте верно, а ${seatName(state, battle.defender)} — нет`;
    } else if (isMe(battle.defender)) {
      title = `Оборона: ${planet}`;
      sub = "Ответьте верно, чтобы отбить атаку";
    } else {
      title = `Бой за ${planet}`;
      sub = `${seatName(state, battle.attacker)} атакует, ${seatName(state, battle.defender)} обороняется`;
    }
  } else if (kind === "tiebreak") {
    title = "Решающий вопрос";
    sub = "Побеждает самый точный";
  } else if (kind === "finale") {
    title = "Ва-банк";
    const bets = state.finaleBets;
    sub = bets
      ? `Ставки: ${[mySeat, ...opponents]
          .filter((p) => bets[p] !== undefined)
          .map((p) => `${isMe(p) ? "вы" : duel ? "соперник" : seatName(state, p)} ${formatNumber(bets[p]!)}`)
          .join(" · ")}`
      : "";
  } else if (question.type === "numeric") {
    sub = "Побеждает тот, кто ближе";
  }

  const status = (p: PlayerId) => {
    if (reveal) {
      const a = reveal.answers[p];
      if (!a || (!isMe(p) && stage < 1)) return { text: "", tone: colors.dim };
      if (a.value === null) return { text: "нет ответа", tone: colors.dim };
      if (stage < 2) return { text: formatSeconds(a.elapsedMs), tone: colors.muted };
      return { text: `${a.correct || reveal.winner === p ? "✓" : "✕"} ${formatSeconds(a.elapsedMs)}`, tone: a.correct || reveal.winner === p ? colors.gold : colors.muted };
    }
    if (!q?.participants.includes(p)) return { text: "наблюдает", tone: colors.dim };
    return q.answers[p] ? { text: "ответ готов", tone: colors.text } : { text: "думает…", tone: colors.dim };
  };

  // In a duel the opponent sits on the right edge; with more players they share the right side.
  const side = (p: PlayerId, compact = false) => {
    const s = status(p);
    return (
      <View key={p} style={[compact ? styles.sideCompact : styles.side, !isMe(p) && !compact && { alignItems: "flex-end" }]}>
        <Avatar id={seatAvatarId(state, p)} size={compact ? 30 : 40} ring={seatColor(state, p)} uid={`strip-${p}`} />
        <Text style={[styles.sideStatus, compact && styles.sideStatusCompact, { color: s.tone }]} numberOfLines={1}>
          {s.text}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.strip}>
      {side(mySeat)}
      <View style={styles.stripMid}>
        {battle && kind !== "expansion" && kind !== "finale" ? (
          <PlanetIcon id={battle.target} size={34} uid="strip" />
        ) : null}
        <Text style={styles.stripTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.stripSub} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      {duel ? side(opponents[0]!) : <View style={styles.others}>{opponents.map((p) => side(p, true))}</View>}
    </View>
  );
}

function TimerBar({ q, answersAt, active, onExpire }: { q: ActiveQuestion; answersAt: number; active: boolean; onExpire: () => void }) {
  const remaining = useCountdown(answersAt, q.timeLimitMs, active, onExpire);
  const started = Date.now() >= answersAt;
  const frac = started ? remaining / q.timeLimitMs : 1;
  const seconds = Math.ceil(remaining / 1000);
  const last = useRef(0);
  useEffect(() => {
    if (active && started && seconds <= 3 && seconds > 0 && last.current !== seconds) {
      last.current = seconds;
      haptics.tick();
      sound.play("tick", 0.6);
    }
  }, [seconds, active, started]);
  const low = frac <= 0.33;
  return (
    <View style={styles.timerTrack}>
      <View style={[styles.timerFill, { width: `${frac * 100}%`, backgroundColor: low ? colors.human : colors.ink }]} />
    </View>
  );
}

function Choice({
  index,
  text,
  hidden,
  mine,
  correct,
  locked,
  stage,
  revealing,
  appearDelay,
  onPress,
  others,
}: {
  index: number;
  text: string;
  hidden: boolean;
  mine: boolean;
  /** Opponents who picked this tile (shown once the reveal starts). */
  others: { seat: PlayerId; avatar: string; color: string }[];
  correct: boolean;
  locked: boolean;
  stage: number;
  revealing: boolean;
  appearDelay: number;
  onPress: () => void;
}) {
  const theirs = others.length > 0;
  const theirColor = others[0]?.color ?? colors.bot;
  const shake = useSharedValue(0);
  const showCorrect = revealing && stage >= 2 && correct;
  const wrongMine = revealing && stage >= 2 && mine && !correct;
  useEffect(() => {
    if (wrongMine) {
      shake.value = withSequence(
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    }
  }, [wrongMine, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const theirsShown = theirs && revealing && stage >= 1;
  // After the correct beat, options nobody picked shrink so the important tiles stay on screen.
  const compact = revealing && stage >= 2 && !correct && !mine && !theirsShown;
  const height = useSharedValue(TILE_H);
  useEffect(() => {
    height.value = withTiming(compact ? TILE_COMPACT_H : TILE_H, { duration: 220 });
  }, [compact, height]);
  const heightStyle = useAnimatedStyle(() => ({ height: height.value }));
  const wrongTheirs = revealing && stage >= 2 && theirs && !correct;
  const dim =
    (locked && !mine && !revealing) || (revealing && stage >= 2 && !correct && !mine && !theirsShown) || hidden;
  const face = showCorrect ? colors.gold : mine && !revealing ? colors.paper : colors.raisedHi;
  const ink = showCorrect || (mine && !revealing) ? colors.ink : colors.text;
  // Who picked this tile is shown by the frame colour (you — vermilion, opponents — their colour) and a tag.
  const frame = mine && revealing ? colors.human : theirsShown ? theirColor : colors.ink;
  const both = mine && theirsShown;

  return (
    <Animated.View entering={FadeInDown.delay(appearDelay).duration(220)}>
      <Animated.View style={shakeStyle}>
      <Pressable accessibilityRole="button" disabled={locked || hidden} onPress={onPress} style={{ opacity: dim ? 0.38 : 1 }}>
        {({ pressed }) => (
          <Slab
            pressed={pressed && !locked}
            depth={4}
            color={face}
            shadow={showCorrect ? colors.goldDeep : mine && !revealing ? colors.paperDeep : colors.bgDeep}
            border={frame}
            faceStyle={[
              (mine && revealing) || theirsShown ? { borderWidth: 3 } : null,
              both ? { borderRightColor: theirColor, borderBottomColor: theirColor } : null,
            ]}
          >
            <Animated.View style={[styles.choice, heightStyle]}>
              <Text style={[styles.letter, { color: ink }]}>{hidden ? "—" : LETTERS[index]}</Text>
              <Text style={[styles.choiceText, { color: ink }, hidden && { textDecorationLine: "line-through" }]} numberOfLines={compact ? 1 : 2}>
                {text}
              </Text>
              {/* fixed-width marks column: tags never change the tile's height */}
              <View style={styles.marks}>
                {revealing && stage >= 2 && correct && <Text style={[styles.mark, { color: colors.ink }]}>✓</Text>}
                {(wrongMine || (wrongTheirs && !mine)) && <Text style={[styles.mark, { color: colors.text }]}>✕</Text>}
                {mine && (
                  <View style={[styles.tag, { backgroundColor: colors.human }]}>
                    <Text style={[styles.tagText, { color: colors.humanInk }]}>ВЫ</Text>
                  </View>
                )}
                {theirsShown &&
                  others.map((o) => (
                    <Animated.View key={o.seat} entering={FadeIn.duration(200)} style={[styles.tagAvatar, { borderColor: o.color }]}>
                      <Avatar id={o.avatar} size={26} ring={o.color} uid={`ch-${index}-${o.seat}`} />
                    </Animated.View>
                  ))}
              </View>
            </Animated.View>
          </Slab>
        )}
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function Boosters({ state, q, onBoost }: { state: MatchState; q: ActiveQuestion; onBoost: (b: BoosterType) => void }) {
  const usable = usableBoosters(state, mySeat);
  const type: BoosterType = q.question.type === "mcq" ? "fifty" : "range";
  const count = state.boosters[mySeat]?.[type] ?? 0;
  const used = q.question.type === "mcq" ? !!q.aids[mySeat]?.hidden : !!q.aids[mySeat]?.range;
  if (!q.participants.includes(mySeat)) return null;
  const can = usable.includes(type);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!can}
      onPress={() => {
        haptics.impact();
        sound.play("reveal", 0.7);
        onBoost(type);
      }}
      style={({ pressed }) => [styles.booster, !can && { opacity: used ? 0.9 : 0.35 }, pressed && { transform: [{ translateY: 2 }] }]}
    >
      <Text style={styles.boosterName}>{BOOSTER_LABELS[type].name}</Text>
      <Text style={styles.boosterCount}>{used ? "использован" : `×${count}`}</Text>
    </Pressable>
  );
}

export function QuestionStage({ state, q, reveal, questionShownAt, answersAt, onAnswer, onBoost, onNext }: Props) {
  const insets = useSafeAreaInsets();
  const question = (q?.question ?? reveal?.question)!;
  const numeric = question.type === "numeric";
  const stage = useReducedStage(reveal, numeric);
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [showAnswers, setShowAnswers] = useState(() => Date.now() >= answersAt);

  useEffect(() => {
    if (showAnswers) return;
    const t = setTimeout(() => setShowAnswers(true), Math.max(0, answersAt - Date.now()));
    return () => clearTimeout(t);
  }, [answersAt, showAnswers]);

  // Sound + haptic on the "correct answer" beat.
  useEffect(() => {
    if (!reveal || stage !== 2) return;
    const mine = reveal.answers[mySeat];
    const good = mine && (mine.correct || isMe(reveal.winner));
    if (!mine) return;
    if (good) {
      sound.play("correct");
      haptics.success();
    } else {
      sound.play("wrong");
      haptics.error();
    }
  }, [reveal, stage]);

  // Heavier beat when a capital shield breaks.
  useEffect(() => {
    if (!reveal || stage !== 3) return;
    const t = reveal.outcome.type;
    if (t === "shield-down" || t === "capital-fell") {
      sound.play("shield");
      haptics.heavy();
    }
  }, [reveal, stage]);

  // Safety net for short screens: bring the answers into view when the correct one lights up.
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (reveal && stage === 2) scrollRef.current?.scrollToEnd({ animated: true });
  }, [reveal, stage]);

  const opponents = opponentSeats(state);
  const answered = !!q?.answers[mySeat];
  const participants = q?.participants ?? (Object.keys(reveal!.answers) as PlayerId[]);
  const participating = (q ?? reveal)!.kind === "expansion" || participants.includes(mySeat);
  const locked = !!reveal || answered || !participating || !showAnswers;
  const aid = q?.aids[mySeat];
  const mineIndex = reveal ? reveal.answers[mySeat]?.value ?? null : chosen;
  const waitingFor = participants.filter((p) => !isMe(p));

  const verdict = reveal ? revealTitle(state, reveal) : null;
  // The verdict is painted in the winner's colour: vermilion = you, the opponent's colour otherwise.
  const verdictSeat: PlayerId | null = verdict?.seat ?? null;
  const verdictFace = verdictSeat ? seatColor(state, verdictSeat) : colors.raisedHi;
  const verdictInk = verdictSeat ? seatInk(state, verdictSeat) : colors.text;

  const myRewards = reveal
    ? reveal.rewards.filter((r) => isMe(r.player)).map((r) => `+1 «${BOOSTER_LABELS[r.booster].name}»`)
    : [];
  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <Strip state={state} question={question} q={q} reveal={reveal} stage={stage} />

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.scroll} bounces={false}>
        <Slab color={colors.paper} shadow={colors.bgDeep} depth={5} radius={6}>
          {q && !reveal ? (
            <TimerBar q={q} answersAt={answersAt} active={!answered && participating} onExpire={() => onAnswer(null)} />
          ) : (
            <View style={[styles.timerTrack, { backgroundColor: colors.paperLine }]} />
          )}
          <View style={styles.card}>
            <View style={styles.meta}>
              <CategoryGlyph category={question.category} size={16} color={colors.inkMuted} />
              <Text style={styles.metaText}>{question.category}</Text>
              <View style={{ flex: 1 }} />
              <View style={styles.dots}>
                {[1, 2, 3].map((d) => (
                  <View key={d} style={[styles.dot, d <= question.difficulty && styles.dotOn]} />
                ))}
              </View>
            </View>
            <Text style={styles.question}>{question.text}</Text>

            {numeric && reveal && reveal.correctValue !== undefined && (
              <NumberLine
                answer={reveal.correctValue}
                unit={question.unit}
                winner={reveal.winner}
                pins={[mySeat, ...opponents]
                  .filter((p) => isMe(p) || reveal.answers[p])
                  .map((p) => ({
                    key: p,
                    value: reveal.answers[p]?.value ?? null,
                    color: seatColor(state, p),
                    label: isMe(p) ? "вы" : opponents.length === 1 ? "соперник" : seatName(state, p),
                  }))}
              />
            )}
            {numeric && !reveal && (
              <View style={styles.display}>
                <Text style={[styles.displayText, !typed && { color: colors.paperLine }]}>
                  {typed ? formatNumber(Number(typed)) : "0"}
                </Text>
                {question.unit ? <Text style={styles.unit}>{question.unit}</Text> : null}
              </View>
            )}
            {numeric && aid?.range && !reveal && (
              <Text style={styles.rangeHint}>
                Ответ между {formatNumber(aid.range[0])} и {formatNumber(aid.range[1])}
              </Text>
            )}
            {reveal?.fact ? (
              <Animated.Text entering={FadeIn.duration(250)} style={styles.fact}>
                {reveal.fact}
              </Animated.Text>
            ) : null}
          </View>
        </Slab>

        {/* push answers and verdict into the thumb zone */}
        <View style={{ flex: 1, minHeight: 8 }} />

        {/* answers */}
        {!numeric && showAnswers && (
          <View style={styles.choices}>
            {question.choices!.map((c, i) => (
              <Choice
                key={i}
                index={i}
                text={c}
                hidden={!!aid?.hidden?.includes(i)}
                mine={mineIndex === i}
                others={opponents
                  .filter((p) => reveal?.answers[p]?.value === i)
                  .map((p) => ({ seat: p, avatar: seatAvatarId(state, p), color: seatColor(state, p) }))}
                correct={reveal?.correctIndex === i}
                locked={locked}
                stage={stage}
                revealing={!!reveal}
                appearDelay={i * 60}
                onPress={() => {
                  haptics.tap();
                  sound.play("tap");
                  setChosen(i);
                  onAnswer(i);
                }}
              />
            ))}
          </View>
        )}
        {numeric && !reveal && showAnswers && participating && (
          <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: 14 }}>
            <NumericPad
              value={typed}
              onChange={setTyped}
              disabled={answered}
              onSubmit={() => {
                const v = parseNumeric(typed);
                if (v !== null && !answered) onAnswer(v);
              }}
            />
          </Animated.View>
        )}
        {!showAnswers && !reveal && (
          <View style={styles.reading}>
            <Text style={styles.readingText}>Читаем вопрос…</Text>
          </View>
        )}

      </ScrollView>

      {/* Fixed-height action bar: the button is always on screen and nothing above it jumps. */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
        {q && !reveal && showAnswers && (
          <View style={styles.barRow}>
            <Boosters state={state} q={q} onBoost={onBoost} />
            <Text style={styles.waiting} numberOfLines={2}>
              {!participating ? "Вы наблюдаете" : answered ? (waitingFor.length > 1 ? "Ответ принят. Ждём соперников…" : "Ответ принят. Ждём соперника…") : ""}
            </Text>
          </View>
        )}
        {reveal && stage >= 3 && verdict && (
          <Animated.View entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))} style={{ gap: 10 }}>
            <Slab color={verdictFace} shadow={verdictSeat ? seatDeep(state, verdictSeat) : colors.bgDeep} depth={3}>
              <View style={styles.verdictRow}>
                {verdictSeat && <Avatar id={seatAvatarId(state, verdictSeat)} size={34} uid="verdict" />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.verdictTitle, { color: verdictInk }]} numberOfLines={1}>
                    {verdict.title}
                  </Text>
                  {verdict.subtitle || myRewards.length ? (
                    <Text style={[styles.verdictSub, { color: verdictInk }]} numberOfLines={1}>
                      {[verdict.subtitle, ...myRewards].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Slab>
            <Button title="Дальше" size="md" onPress={onNext} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8, gap: 8 },
  bar: { minHeight: 120, paddingHorizontal: 16, paddingTop: 8, justifyContent: "flex-start", borderTopWidth: 1, borderColor: colors.line },
  barRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  strip: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  side: { width: 74 },
  sideCompact: { width: 46, alignItems: "center" },
  others: { flexDirection: "row", gap: 2 },
  sideStatus: { fontFamily: fonts.bodyBold, fontSize: 11, marginTop: 4 },
  sideStatusCompact: { fontSize: 9, marginTop: 2 },
  stripMid: { flex: 1, alignItems: "center", minHeight: 46 },
  stripTitle: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.text, marginTop: 2, textAlign: "center" },
  stripSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 2 },
  timerTrack: { height: 6, backgroundColor: colors.paperDeep, borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: "hidden" },
  timerFill: { height: 6 },
  card: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.inkMuted },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 1, borderWidth: 1.5, borderColor: colors.inkMuted },
  dotOn: { backgroundColor: colors.inkMuted },
  question: { fontFamily: fonts.bodyBold, fontSize: 19, lineHeight: 25, color: colors.ink },
  display: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.ink,
  },
  displayText: { fontFamily: fonts.display, fontSize: 32, color: colors.ink },
  unit: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.inkMuted },
  rangeHint: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, textAlign: "center", backgroundColor: colors.gold, paddingVertical: 4, borderRadius: 3 },
  fact: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkMuted, borderTopWidth: 1, borderColor: colors.paperLine, paddingTop: 8 },
  choices: { gap: 7 },
  choice: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10, overflow: "hidden" },
  letter: { fontFamily: fonts.display, fontSize: 15, width: 18 },
  choiceText: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 20, flex: 1 },
  marks: { flexDirection: "row", alignItems: "center", gap: 6 },
  tag: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 3, borderWidth: 1.5, borderColor: colors.ink },
  tagText: { fontFamily: fonts.display, fontSize: 10, letterSpacing: 0.5 },
  tagAvatar: { borderRadius: 4 },
  mark: { fontFamily: fonts.display, fontSize: 18 },
  reading: { height: 4 * 59, alignItems: "center", justifyContent: "center" },
  readingText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.dim, letterSpacing: 1, textTransform: "uppercase" },
  waiting: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "right" },
  booster: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.gold,
    borderStyle: "dashed",
  },
  boosterName: { fontFamily: fonts.displayBold, fontSize: 13, color: colors.gold },
  boosterCount: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted },
  verdictRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 7 },
  verdictTitle: { fontFamily: fonts.display, fontSize: 16, lineHeight: 21 },
  verdictSub: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, opacity: 0.9 },
});
