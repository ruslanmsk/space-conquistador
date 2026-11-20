import { getPlanet } from "../map/sol-system";
import { displayedCorrectIndex, findQuestion } from "../questions";
import { gaussian, pickRandom } from "../rng";
import { getLegalAttackTargets, getLegalPicks, isCapital, otherPlayer } from "../engine/rules";
import type { Answer, BotLevel, GameContext, MatchState, PlanetId, PlayerId, Rng } from "../types";

const LEVELS: Record<
  BotLevel,
  { accuracy: number; spread: number; yearSpread: number; minMs: number; maxMs: number }
> = {
  easy: { accuracy: 0.5, spread: 0.35, yearSpread: 40, minMs: 5_000, maxMs: 11_000 },
  normal: { accuracy: 0.68, spread: 0.18, yearSpread: 18, minMs: 3_500, maxMs: 9_000 },
  hard: { accuracy: 0.85, spread: 0.08, yearSpread: 6, minMs: 2_500, maxMs: 6_500 },
};

/** Simulated answer for the active question. `elapsedMs` is how long the bot "thinks". */
export function botAnswer(state: MatchState, ctx: GameContext, level: BotLevel): Answer {
  if (state.step.type !== "question") throw new Error("botAnswer: no active question");
  const aq = state.step.q;
  const record = findQuestion(ctx, aq.question.id);
  const cfg = LEVELS[level];
  const rng = ctx.rng;
  const accuracy = cfg.accuracy - 0.1 * (record.difficulty - 1);

  let elapsedMs = cfg.minMs + rng() * (cfg.maxMs - cfg.minMs);
  if (record.type === "numeric") elapsedMs += 2_000;
  elapsedMs = Math.min(Math.round(elapsedMs), aq.timeLimitMs - 300);

  if (record.type === "mcq") {
    const correct = displayedCorrectIndex(record, aq);
    if (rng() < accuracy) return { value: correct, elapsedMs };
    const wrong = (record.choices ?? []).map((_, i) => i).filter((i) => i !== correct);
    return { value: pickRandom(rng, wrong) ?? correct, elapsedMs };
  }

  const target = record.correctValue ?? 0;
  if (rng() < accuracy * 0.4) return { value: target, elapsedMs };
  const hardness = 1 + (record.difficulty - 1) * 0.3;
  const isYear = Number.isInteger(target) && target >= 1000 && target <= 2100;
  let value = isYear
    ? target + gaussian(rng) * cfg.yearSpread * hardness
    : target * (1 + gaussian(rng) * cfg.spread * hardness);
  if (target >= 0) value = Math.max(0, value);
  value = Number.isInteger(target) ? Math.round(value) : Math.round(value * 10) / 10;
  return { value, elapsedMs };
}

function bestBy<T>(items: T[], score: (x: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = -Infinity;
  for (const x of items) {
    const s = score(x);
    if (s > bestScore) {
      best = x;
      bestScore = s;
    }
  }
  return best;
}

export function botChoosePick(
  state: MatchState,
  player: PlayerId,
  level: BotLevel,
  rng: Rng,
): PlanetId | undefined {
  const legal = getLegalPicks(state, player);
  if (level === "easy") return pickRandom(rng, legal);
  const enemy = otherPlayer(player);
  return bestBy(legal, (id) => {
    const nbs = getPlanet(state.map, id).neighbors;
    const free = nbs.filter((n) => state.owners[n] === null).length;
    const borderEnemy = nbs.some((n) => state.owners[n] === enemy) ? 1.5 : 0;
    return nbs.length * 0.6 + free * 0.8 + borderEnemy + rng() * 1.2;
  });
}

export function botChooseAttack(
  state: MatchState,
  player: PlayerId,
  level: BotLevel,
  rng: Rng,
): PlanetId | undefined {
  const legal = getLegalAttackTargets(state, player);
  if (level === "easy") return pickRandom(rng, legal);
  const enemy = otherPlayer(player);
  return bestBy(legal, (id) => {
    if (isCapital(state, id)) {
      const shields = state.shields[enemy];
      return (shields <= 1 ? 10 : level === "hard" ? 3 : 1.5) + rng();
    }
    return (state.planetValue[id] ?? 0) / 100 + rng() * 1.5;
  });
}
