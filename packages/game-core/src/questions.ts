import { pickRandom, shuffle } from "./rng";
import type {
  ActiveQuestion,
  Category,
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
 * Draws an unused question of the given type (and category, if given). Falls back to any
 * category, then to used questions, instead of ending the match when a pool runs dry.
 */
export function drawQuestion(
  ctx: GameContext,
  used: readonly string[],
  type: QuestionType,
  category?: Category,
): { record: QuestionRecord; question: PublicQuestion; choiceOrder?: number[] } {
  const usedSet = new Set(used);
  const ofType = ctx.questions.filter((q) => q.type === type);
  const fresh = ofType.filter((q) => !usedSet.has(q.id));
  const freshInCategory = category ? fresh.filter((q) => q.category === category) : [];
  const pool = freshInCategory.length ? freshInCategory : fresh.length ? fresh : ofType;
  const record = pickRandom(ctx.rng, pool);
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

/** Categories that still have unused questions of the given type. */
export function availableCategories(
  ctx: GameContext,
  used: readonly string[],
  type: QuestionType,
): Category[] {
  const usedSet = new Set(used);
  const cats = new Set<Category>();
  for (const q of ctx.questions) {
    if (q.type === type && !usedSet.has(q.id)) cats.add(q.category);
  }
  return [...cats];
}

/** 50/50: two wrong displayed choices to hide. */
export function fiftyFifty(record: QuestionRecord, aq: ActiveQuestion, rng: () => number): number[] {
  const correct = displayedCorrectIndex(record, aq);
  const wrong = (aq.question.choices ?? []).map((_, i) => i).filter((i) => i !== correct);
  const keep = pickRandom(rng, wrong);
  return wrong.filter((i) => i !== keep);
}

/**
 * Range hint for a numeric question: a bracket about ±25% wide (±15 for years) that contains
 * the answer at a random offset, rounded to friendly numbers.
 */
export function rangeHint(record: QuestionRecord, rng: () => number): [number, number] {
  const v = record.correctValue ?? 0;
  const isYear = Number.isInteger(v) && v >= 1000 && v <= 2100;
  const half = isYear ? 15 : Math.max(1, Math.abs(v) * 0.25);
  const step = isYear ? 5 : niceStep(half / 2);
  const shift = (rng() - 0.5) * half;
  const lo = Math.max(0, Math.floor((v - half + shift) / step) * step);
  const hi = Math.ceil((v + half + shift) / step) * step;
  return [Math.min(lo, v), Math.max(hi, v)];
}

function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1))));
  const m = x / p;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * p;
}
