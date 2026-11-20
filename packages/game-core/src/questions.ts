import { pickRandom, shuffle } from "./rng";
import type {
  ActiveQuestion,
  GameContext,
  PublicQuestion,
  QuestionRecord,
  QuestionType,
} from "./types";

export function toPublicQuestion(q: QuestionRecord, choiceOrder?: number[]): PublicQuestion {
  return {
    id: q.id,
    type: q.type,
    text: q.text,
    category: q.category,
    difficulty: q.difficulty,
    choices: q.choices && choiceOrder ? choiceOrder.map((i) => q.choices![i]!) : q.choices,
    unit: q.unit,
  };
}

/**
 * Draws an unused question of the given type. When the pool of that type is exhausted
 * the used list is ignored (questions start repeating) instead of ending the match.
 */
export function drawQuestion(
  ctx: GameContext,
  used: readonly string[],
  type: QuestionType,
): { record: QuestionRecord; question: PublicQuestion; choiceOrder?: number[] } {
  const usedSet = new Set(used);
  const ofType = ctx.questions.filter((q) => q.type === type);
  const fresh = ofType.filter((q) => !usedSet.has(q.id));
  const record = pickRandom(ctx.rng, fresh.length ? fresh : ofType);
  if (!record) throw new Error(`No questions of type ${type}`);
  const choiceOrder =
    record.type === "mcq" && record.choices
      ? shuffle(ctx.rng, record.choices.map((_, i) => i))
      : undefined;
  return { record, question: toPublicQuestion(record, choiceOrder), choiceOrder };
}

export function findQuestion(ctx: GameContext, id: string): QuestionRecord {
  const q = ctx.questions.find((x) => x.id === id);
  if (!q) throw new Error(`Unknown question ${id}`);
  return q;
}

/** Correct choice index in displayed (shuffled) order. */
export function displayedCorrectIndex(record: QuestionRecord, aq: ActiveQuestion): number {
  const original = record.correctIndex ?? 0;
  return aq.choiceOrder ? aq.choiceOrder.indexOf(original) : original;
}

export function evaluateAnswer(
  record: QuestionRecord,
  aq: ActiveQuestion,
  value: number | null,
): { correct: boolean; distance?: number } {
  if (record.type === "mcq") {
    return { correct: value !== null && value === displayedCorrectIndex(record, aq) };
  }
  if (value === null) return { correct: false, distance: Infinity };
  const distance = Math.abs(value - (record.correctValue ?? 0));
  return { correct: distance <= (record.tolerance ?? 0), distance };
}
