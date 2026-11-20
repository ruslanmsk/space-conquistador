import {
  usableBoosters,
  type ActiveQuestion,
  type BoosterType,
  type MatchState,
  type PlayerId,
  type PublicQuestion,
  type Reveal,
} from "@space-conquistador/game-core";
import { useEffect, useRef, useState } from "react";
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
import { colors, playerColor } from "../theme/colors";
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
  let sub = "Быстрый верный ответ — 2 планеты, второй — 1";
  if (kind === "battle" && battle) {
    title = battle.attacker === "human" ? `Атака: ${planetName(state, battle.target)}` : `Оборона: ${planetName(state, battle.target)}`;
    sub = battle.attacker === "human" ? "Ответьте верно, а соперник — нет" : "Ответьте верно, чтобы отбить атаку";
  } else if (kind === "tiebreak") {
    title = "Решающий вопрос";
    sub = "Побеждает самый точный";
  } else if (kind === "finale") {
    title = "Ва-банк";
    const bets = state.finaleBets;
    sub = bets ? `Ставки: вы ${formatNumber(bets.human)} · соперник ${formatNumber(bets.bot)}` : "";
  } else if (question.type === "numeric") {
    sub = "Побеждает тот, кто ближе";
  }

  const status = (p: PlayerId) => {
    if (reveal) {
      const a = reveal.answers[p];
      if (!a || (p === "bot" && stage < 1)) return { text: "", tone: colors.dim };
      if (a.value === null) return { text: "нет ответа", tone: colors.dim };
      if (stage < 2) return { text: formatSeconds(a.elapsedMs), tone: colors.muted };
      return { text: `${a.correct || reveal.winner === p ? "✓" : "✕"} ${formatSeconds(a.elapsedMs)}`, tone: a.correct || reveal.winner === p ? colors.gold : colors.muted };
    }
    if (!q?.participants.includes(p)) return { text: "наблюдает", tone: colors.dim };
    return q.answers[p] ? { text: "ответ готов", tone: colors.text } : { text: "думает…", tone: colors.dim };
  };

  const side = (p: PlayerId) => {
    const s = status(p);
    return (
      <View style={[styles.side, p === "bot" && { alignItems: "flex-end" }]}>
        <Avatar id={p === "human" ? "you" : state.config.opponent.id} size={40} ring={playerColor(p)} uid={`strip-${p}`} />
        <Text style={[styles.sideStatus, { color: s.tone }]} numberOfLines={1}>
          {s.text}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.strip}>
      {side("human")}
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
      {side("bot")}
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
  theirs,
  correct,
  locked,
  stage,
  revealing,
  appearDelay,
  onPress,
  botId,
}: {
  index: number;
  text: string;
  hidden: boolean;
  mine: boolean;
  theirs: boolean;
  correct: boolean;
  locked: boolean;
  stage: number;
  revealing: boolean;
  appearDelay: number;
  onPress: () => void;
  botId: string;
}) {
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

  const dim = (locked && !mine && !revealing) || (revealing && stage >= 2 && !correct && !mine) || hidden;
  const face = showCorrect ? colors.gold : mine && !revealing ? colors.paper : colors.raisedHi;
  const ink = showCorrect || (mine && !revealing) ? colors.ink : colors.text;

  return (
    <Animated.View entering={FadeInDown.delay(appearDelay).duration(220)} style={shakeStyle}>
      <Pressable accessibilityRole="button" disabled={locked || hidden} onPress={onPress} style={{ opacity: dim ? 0.38 : 1 }}>
        {({ pressed }) => (
          <Slab
            pressed={pressed && !locked}
            depth={4}
            color={face}
            shadow={showCorrect ? colors.goldDeep : mine && !revealing ? colors.paperDeep : colors.bgDeep}
            border={wrongMine ? colors.human : colors.ink}
          >
            <View style={styles.choice}>
              <Text style={[styles.letter, { color: ink }]}>{hidden ? "—" : LETTERS[index]}</Text>
              <Text style={[styles.choiceText, { color: ink }, hidden && { textDecorationLine: "line-through" }]}>{text}</Text>
              <View style={styles.marks}>
                {revealing && stage >= 2 && correct && <Text style={[styles.mark, { color: colors.ink }]}>✓</Text>}
                {wrongMine && <Text style={[styles.mark, { color: colors.human }]}>✕</Text>}
                {mine && (
                  <View style={[styles.who, { backgroundColor: colors.human }]}>
                    <Text style={styles.whoText}>ВЫ</Text>
                  </View>
                )}
                {theirs && revealing && stage >= 1 && (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <Avatar id={botId} size={24} ring={colors.bot} uid={`ch-${index}`} />
                  </Animated.View>
                )}
              </View>
            </View>
          </Slab>
        )}
      </Pressable>
    </Animated.View>
  );
}

function Boosters({ state, q, onBoost }: { state: MatchState; q: ActiveQuestion; onBoost: (b: BoosterType) => void }) {
  const usable = usableBoosters(state, "human");
  const type: BoosterType = q.question.type === "mcq" ? "fifty" : "range";
  const count = state.boosters.human[type];
  const used = q.question.type === "mcq" ? !!q.aids.human?.hidden : !!q.aids.human?.range;
  if (!q.participants.includes("human")) return null;
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
    const mine = reveal.answers.human;
    const good = mine && (mine.correct || reveal.winner === "human");
    if (!mine) return;
    if (good) {
      sound.play("correct");
      haptics.success();
    } else {
      sound.play("wrong");
      haptics.error();
    }
  }, [reveal, stage]);

  const humanAnswer = reveal?.answers.human ?? q?.answers.human;
  const botAnswer = reveal?.answers.bot;
  const answered = !!q?.answers.human;
  const participating = (q ?? reveal)!.kind === "expansion" || (q?.participants ?? Object.keys(reveal!.answers)).includes("human");
  const locked = !!reveal || answered || !participating || !showAnswers;
  const aid = q?.aids.human;
  const mineIndex = reveal ? reveal.answers.human?.value ?? null : chosen;

  const verdict = reveal ? revealTitle(state, reveal) : null;
  const toneColor = verdict?.tone === "good" ? colors.gold : verdict?.tone === "bad" ? colors.human : colors.text;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <Strip state={state} question={question} q={q} reveal={reveal} stage={stage} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 16 }]} bounces={false}>
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
                pins={[
                  { key: "h", value: reveal.answers.human?.value ?? null, color: colors.human, label: "вы" },
                  { key: "b", value: reveal.answers.bot?.value ?? null, color: colors.bot, label: "соперник" },
                ]}
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
            {reveal?.fact && stage >= 3 ? (
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
                theirs={botAnswer?.value === i}
                correct={reveal?.correctIndex === i}
                locked={locked}
                stage={stage}
                revealing={!!reveal}
                appearDelay={i * 60}
                botId={state.config.opponent.id}
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

        {/* footer: boosters / waiting / verdict */}
        {q && !reveal && showAnswers && (
          <View style={styles.footer}>
            <Boosters state={state} q={q} onBoost={onBoost} />
            <Text style={styles.waiting}>
              {!participating ? "Вы наблюдаете" : answered ? "Ответ принят. Ждём соперника…" : humanAnswer ? "" : ""}
            </Text>
          </View>
        )}

        {reveal && stage >= 3 && verdict && (
          <Animated.View entering={FadeInDown.duration(260).easing(Easing.out(Easing.cubic))} style={styles.verdict}>
            <Text style={[styles.verdictTitle, { color: toneColor }]}>{verdict.title}</Text>
            {verdict.subtitle ? <Text style={styles.verdictSub}>{verdict.subtitle}</Text> : null}
            {reveal.rewards
              .filter((r) => r.player === "human")
              .map((r, i) => (
                <Text key={i} style={styles.reward}>
                  {r.reason === "streak" ? "Серия верных ответов" : "Аванпост"}: +1 «{BOOSTER_LABELS[r.booster].name}»
                </Text>
              ))}
            <Button title="Дальше" onPress={onNext} style={{ marginTop: 14 }} />
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 6, gap: 12 },
  strip: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  side: { width: 74 },
  sideStatus: { fontFamily: fonts.bodyBold, fontSize: 11, marginTop: 4 },
  stripMid: { flex: 1, alignItems: "center", minHeight: 52 },
  stripTitle: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.text, marginTop: 2, textAlign: "center" },
  stripSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 2 },
  timerTrack: { height: 6, backgroundColor: colors.paperDeep, borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: "hidden" },
  timerFill: { height: 6 },
  card: { padding: 16, paddingTop: 12, gap: 10 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.inkMuted },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 1, borderWidth: 1.5, borderColor: colors.inkMuted },
  dotOn: { backgroundColor: colors.inkMuted },
  question: { fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 28, color: colors.ink },
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
  fact: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.inkMuted, borderTopWidth: 1, borderColor: colors.paperLine, paddingTop: 8 },
  choices: { gap: 8 },
  choice: { flexDirection: "row", alignItems: "center", minHeight: 54, paddingHorizontal: 14, paddingVertical: 8, gap: 12 },
  letter: { fontFamily: fonts.display, fontSize: 15, width: 18 },
  choiceText: { fontFamily: fonts.bodySemi, fontSize: 17, lineHeight: 22, flex: 1 },
  marks: { flexDirection: "row", alignItems: "center", gap: 6 },
  mark: { fontFamily: fonts.display, fontSize: 18 },
  who: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3, borderWidth: 1.5, borderColor: colors.ink },
  whoText: { fontFamily: fonts.display, fontSize: 9, color: colors.humanInk },
  reading: { height: 120, alignItems: "center", justifyContent: "center" },
  readingText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.dim, letterSpacing: 1, textTransform: "uppercase" },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
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
  verdict: { paddingTop: 4 },
  verdictTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30 },
  verdictSub: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, marginTop: 4 },
  reward: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.gold, marginTop: 6 },
});
