import type { MatchState, PlayerId, Reveal, RevealAnswer } from "@space-conquistador/game-core";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatNumber, formatSeconds, revealTitle } from "../game/labels";
import { colors, playerColor } from "../theme/colors";
import { haptics } from "../utils/haptics";
import { Button } from "./Button";

type Props = { state: MatchState; reveal: Reveal; onNext: () => void };

const TONE = { good: colors.success, bad: colors.danger, neutral: colors.accent };
const WHO: Record<PlayerId, string> = { human: "Вы", bot: "Бот" };

function Tag({ player, answer }: { player: PlayerId; answer: RevealAnswer }) {
  return (
    <View style={[styles.tag, { borderColor: playerColor(player) }]}>
      <Text style={[styles.tagText, { color: playerColor(player) }]}>
        {WHO[player]} · {formatSeconds(answer.elapsedMs)}
      </Text>
    </View>
  );
}

export function RevealPanel({ state, reveal, onNext }: Props) {
  const t = revealTitle(state, reveal);
  useEffect(() => {
    if (t.tone === "good") haptics.success();
    else if (t.tone === "bad") haptics.error();
    else haptics.warning();
  }, [t.tone]);

  const players = (Object.keys(reveal.answers) as PlayerId[]).sort((a) => (a === "human" ? -1 : 1));
  const { question } = reveal;

  return (
    <View style={styles.sheet}>
      <View style={[styles.banner, { borderColor: TONE[t.tone] }]}>
        <Text style={[styles.title, { color: TONE[t.tone] }]}>{t.title}</Text>
        {t.subtitle && <Text style={styles.subtitle}>{t.subtitle}</Text>}
      </View>

      <Text style={styles.question}>{question.text}</Text>

      {question.type === "mcq" ? (
        <View style={styles.choices}>
          {question.choices!.map((c, i) => {
            const correct = i === reveal.correctIndex;
            const pickedBy = players.filter((p) => reveal.answers[p]!.value === i);
            const wrongPick = !correct && pickedBy.length > 0;
            return (
              <View
                key={i}
                style={[styles.choice, correct && styles.choiceCorrect, wrongPick && styles.choiceWrong]}
              >
                <Text style={[styles.choiceText, !correct && !wrongPick && { color: colors.muted }]}>
                  {correct ? "✓ " : wrongPick ? "✗ " : ""}
                  {c}
                </Text>
                <View style={styles.tags}>
                  {pickedBy.map((p) => (
                    <Tag key={p} player={p} answer={reveal.answers[p]!} />
                  ))}
                </View>
              </View>
            );
          })}
          {players
            .filter((p) => reveal.answers[p]!.value === null)
            .map((p) => (
              <Text key={p} style={styles.timeout}>
                {WHO[p]}: не успели ответить
              </Text>
            ))}
        </View>
      ) : (
        <View style={styles.numeric}>
          <Text style={styles.correctLabel}>Правильный ответ</Text>
          <Text style={styles.correctValue}>
            {formatNumber(reveal.correctValue ?? 0)}
            {question.unit ? <Text style={styles.unit}> {question.unit}</Text> : null}
          </Text>
          {players.map((p) => {
            const a = reveal.answers[p]!;
            const isWinner = reveal.winner === p;
            return (
              <View key={p} style={[styles.row, isWinner && { borderColor: playerColor(p) }]}>
                <Text style={[styles.rowWho, { color: playerColor(p) }]}>
                  {isWinner ? "★ " : ""}
                  {WHO[p]}
                </Text>
                <Text style={styles.rowValue}>
                  {a.value === null ? "нет ответа" : formatNumber(a.value)}
                </Text>
                <Text style={styles.rowMeta}>
                  {a.value === null
                    ? ""
                    : a.correct
                      ? `точно · ${formatSeconds(a.elapsedMs)}`
                      : `±${formatNumber(Math.round((a.distance ?? 0) * 100) / 100)} · ${formatSeconds(a.elapsedMs)}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Button title="Дальше" onPress={onNext} />
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
  banner: { borderLeftWidth: 4, paddingLeft: 12, paddingVertical: 2 },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.text, fontSize: 14, marginTop: 2, opacity: 0.85 },
  question: { color: colors.muted, fontSize: 15, lineHeight: 20 },
  choices: { gap: 7 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  choiceCorrect: { borderColor: colors.success, backgroundColor: "#0f2e24" },
  choiceWrong: { borderColor: colors.danger, backgroundColor: "#2e0f17" },
  choiceText: { color: colors.text, fontSize: 15, fontWeight: "600", flexShrink: 1 },
  tags: { flexDirection: "row", gap: 6 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: "700" },
  timeout: { color: colors.muted, fontSize: 13 },
  numeric: { gap: 8 },
  correctLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  correctValue: { color: colors.success, fontSize: 34, fontWeight: "800", fontVariant: ["tabular-nums"] },
  unit: { color: colors.muted, fontSize: 18, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rowWho: { fontSize: 15, fontWeight: "800", width: 52 },
  rowValue: { color: colors.text, fontSize: 18, fontWeight: "800", flex: 1, fontVariant: ["tabular-nums"] },
  rowMeta: { color: colors.muted, fontSize: 12 },
});
