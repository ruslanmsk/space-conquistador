import type { ActiveQuestion, MatchState } from "@space-conquistador/game-core";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { planetName } from "../game/labels";
import { useCountdown } from "../hooks/useCountdown";
import { colors } from "../theme/colors";
import { haptics } from "../utils/haptics";
import { NumericPad, parseNumeric } from "./NumericPad";

type Props = {
  state: MatchState;
  q: ActiveQuestion;
  startedAt: number;
  onAnswer: (value: number | null) => void;
};

const LETTERS = ["A", "B", "C", "D"];

function header(state: MatchState, q: ActiveQuestion): { title: string; color: string } {
  if (q.kind === "expansion") return { title: "Раздел территорий", color: colors.accent };
  const b = state.battle!;
  const name = planetName(state, b.target);
  if (q.kind === "tiebreak") return { title: `Решающий вопрос · ${name}`, color: colors.accent };
  return b.attacker === "human"
    ? { title: `Ваша атака · ${name}`, color: colors.human }
    : { title: `Бот атакует · ${name}`, color: colors.bot };
}

export function QuestionPanel({ state, q, startedAt, onAnswer }: Props) {
  const answered = !!q.answers.human;
  const botAnswered = !!q.answers.bot;
  const [chosen, setChosen] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const remaining = useCountdown(startedAt, q.timeLimitMs, !answered, () => onAnswer(null));
  const seconds = Math.ceil(remaining / 1000);

  const lastWarn = useRef(0);
  useEffect(() => {
    if (!answered && seconds <= 3 && seconds > 0 && lastWarn.current !== seconds) {
      lastWarn.current = seconds;
      haptics.tap();
    }
  }, [seconds, answered]);

  const h = header(state, q);
  const frac = remaining / q.timeLimitMs;
  const barColor = frac > 0.5 ? colors.success : frac > 0.25 ? colors.accent : colors.danger;
  const { question } = q;

  return (
    <View style={styles.sheet}>
      <View style={styles.topRow}>
        <Text style={[styles.kind, { color: h.color }]} numberOfLines={1}>
          {h.title}
        </Text>
        <Text style={[styles.timer, frac <= 0.25 && !answered && { color: colors.danger }]}>
          {answered ? "✓" : `${seconds}`}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.bar, { width: `${frac * 100}%`, backgroundColor: barColor }]} />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.category}>{question.category.toUpperCase()}</Text>
        <Text style={styles.difficulty}>
          {"★".repeat(question.difficulty)}
          <Text style={{ color: colors.dim }}>{"★".repeat(3 - question.difficulty)}</Text>
        </Text>
      </View>
      <Text style={styles.question}>{question.text}</Text>

      {question.type === "mcq" ? (
        <View style={styles.choices}>
          {question.choices!.map((c, i) => {
            const picked = chosen === i;
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                disabled={answered}
                onPress={() => {
                  haptics.impact();
                  setChosen(i);
                  onAnswer(i);
                }}
                style={({ pressed }) => [
                  styles.choice,
                  pressed && styles.choicePressed,
                  picked && styles.choicePicked,
                  answered && !picked && styles.choiceDim,
                ]}
              >
                <View style={[styles.letter, picked && { backgroundColor: colors.accent }]}>
                  <Text style={[styles.letterText, picked && { color: "#1a1300" }]}>{LETTERS[i]}</Text>
                </View>
                <Text style={styles.choiceText}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View>
          <View style={styles.display}>
            <Text style={[styles.displayText, !typed && { color: colors.dim }]}>{typed || "0"}</Text>
            {question.unit && <Text style={styles.unit}>{question.unit}</Text>}
          </View>
          <Text style={styles.hint}>Точный ответ не обязателен — побеждает тот, кто ближе</Text>
          <NumericPad
            value={typed}
            onChange={setTyped}
            disabled={answered}
            onSubmit={() => {
              const v = parseNumeric(typed);
              if (v !== null && !answered) onAnswer(v);
            }}
          />
        </View>
      )}

      <View style={styles.statusRow}>
        <Text style={styles.status}>
          {answered ? "Ответ принят · ждём соперника…" : "Отвечайте быстрее соперника"}
        </Text>
        <View style={[styles.botChip, botAnswered && styles.botChipDone]}>
          <Text style={[styles.botChipText, botAnswered && { color: colors.text }]}>
            {botAnswered ? "Бот ответил" : "Бот думает…"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.panelSolid,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    paddingBottom: 22,
    gap: 12,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  kind: { fontSize: 13, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", flex: 1 },
  timer: { color: colors.text, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"], minWidth: 32, textAlign: "right" },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.card, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  category: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  difficulty: { color: colors.accent, fontSize: 12 },
  question: { color: colors.text, fontSize: 21, fontWeight: "700", lineHeight: 28 },
  choices: { gap: 9 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 54,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  choicePressed: { backgroundColor: colors.cardPressed },
  choicePicked: { borderColor: colors.accent, backgroundColor: "#2a2614" },
  choiceDim: { opacity: 0.45 },
  letter: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  letterText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  choiceText: { color: colors.text, fontSize: 16, fontWeight: "600", flex: 1 },
  display: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  displayText: { color: colors.text, fontSize: 34, fontWeight: "800", fontVariant: ["tabular-nums"] },
  unit: { color: colors.muted, fontSize: 18, fontWeight: "600" },
  hint: { color: colors.muted, fontSize: 12, textAlign: "center", marginVertical: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  status: { color: colors.muted, fontSize: 13, flex: 1 },
  botChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.bot,
  },
  botChipDone: { backgroundColor: colors.botDeep },
  botChipText: { color: colors.bot, fontSize: 12, fontWeight: "700" },
});
