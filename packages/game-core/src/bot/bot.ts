import { getPlanet } from "../map/sol-system";
import { displayedCorrectIndex, findQuestion } from "../questions";
import { gaussian, pickRandom } from "../rng";
import { maxWager, usableBoosters } from "../engine/match";
import { getLegalAttackTargets, getLegalPicks, getScores, isCapital, otherPlayer } from "../engine/rules";
import type {
  Answer,
  BoosterType,
  BotLevel,
  Category,
  GameContext,
  MatchState,
  Opponent,
  PlanetId,
  PlayerId,
  Rng,
} from "../types";

const LEVELS: Record<
  BotLevel,
  { accuracy: number; spread: number; yearSpread: number; minMs: number; maxMs: number; boostChance: number }
> = {
  easy: { accuracy: 0.5, spread: 0.35, yearSpread: 40, minMs: 5_000, maxMs: 11_000, boostChance: 0.15 },
  normal: { accuracy: 0.66, spread: 0.18, yearSpread: 18, minMs: 3_500, maxMs: 9_000, boostChance: 0.3 },
  hard: { accuracy: 0.82, spread: 0.08, yearSpread: 6, minMs: 2_500, maxMs: 6_500, boostChance: 0.45 },
};

const STRONG_BONUS = 0.15;
const WEAK_PENALTY = 0.2;

/** How likely the bot is to know the answer, given its profile and the question. */
export function botAccuracy(level: BotLevel, opponent: Opponent | undefined, category: Category, difficulty: number) {
  let acc = LEVELS[level].accuracy - 0.1 * (difficulty - 1);
  if (opponent?.strong.includes(category)) acc += STRONG_BONUS;
  if (opponent?.weak.includes(category)) acc -= WEAK_PENALTY;
  return Math.max(0.15, Math.min(0.97, acc));
}

/** Simulated answer for the active question. `elapsedMs` is how long the bot "thinks". */
export function botAnswer(
  state: MatchState,
  ctx: GameContext,
  level: BotLevel,
  player: PlayerId = "bot",
): Answer {
  if (state.step.type !== "question") throw new Error("botAnswer: no active question");
  const aq = state.step.q;
  const record = findQuestion(ctx, aq.question.id);
  const cfg = LEVELS[level];
  const rng = ctx.rng;
  const opponent = player === "bot" ? state.config.opponent : undefined;
  const accuracy = botAccuracy(level, opponent, record.category, record.difficulty);
  const aid = aq.aids[player];

  let elapsedMs = cfg.minMs + rng() * (cfg.maxMs - cfg.minMs);
  if (record.type === "numeric") elapsedMs += 2_000;
  if (aid) elapsedMs += 600;
  elapsedMs = Math.min(Math.round(elapsedMs), aq.timeLimitMs - 300);

  if (record.type === "mcq") {
    const correct = displayedCorrectIndex(record, aq);
    const visible = (record.choices ?? []).map((_, i) => i).filter((i) => !aid?.hidden?.includes(i));
    // With 50/50 a bot that does not know still guesses between two options.
    if (rng() < accuracy) return { value: correct, elapsedMs };
    const wrong = visible.filter((i) => i !== correct);
    const guess = aid?.hidden ? pickRandom(rng, visible) : pickRandom(rng, wrong);
    return { value: guess ?? correct, elapsedMs };
  }

  const target = record.correctValue ?? 0;
  if (rng() < accuracy * 0.4) return { value: target, elapsedMs };
  const hardness = 1 + (record.difficulty - 1) * 0.3;
  const isYear = Number.isInteger(target) && target >= 1000 && target <= 2100;
  let value = isYear
    ? target + gaussian(rng) * cfg.yearSpread * hardness
    : target * (1 + gaussian(rng) * cfg.spread * hardness);
  if (target >= 0) value = Math.max(0, value);
  if (aid?.range) value = Math.min(aid.range[1], Math.max(aid.range[0], value));
  value = Number.isInteger(target) ? Math.round(value) : Math.round(value * 10) / 10;
  return { value, elapsedMs };
}

/** Whether the bot spends a booster on the active question (decided once per question). */
export function botWantsBooster(
  state: MatchState,
  ctx: GameContext,
  level: BotLevel,
  player: PlayerId = "bot",
): BoosterType | null {
  const usable = usableBoosters(state, player);
  if (!usable.length || state.step.type !== "question") return null;
  const q = state.step.q;
  const record = findQuestion(ctx, q.question.id);
  // Saves boosters for battles; hard questions and its own capital make it more eager.
  let chance = LEVELS[level].boostChance * (q.kind === "expansion" ? 0.5 : 1);
  if (record.difficulty === 3) chance *= 1.6;
  const target = state.battle?.target;
  if (target && isCapital(state, target)) chance *= 1.8;
  return ctx.rng() < Math.min(0.9, chance) ? usable[0]! : null;
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

const KIND_APPEAL = { capital: 0, world: 0.6, giant: 1.6, outpost: 1.1 } as const;

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
    const planet = getPlanet(state.map, id);
    const nbs = planet.neighbors;
    const free = nbs.filter((n) => state.owners[n] === null).length;
    const borderEnemy = nbs.some((n) => state.owners[n] === enemy) ? 1.2 : 0;
    const edge = sectorEdge(state, player, id) * 0.8;
    return nbs.length * 0.4 + free * 0.7 + borderEnemy + KIND_APPEAL[planet.kind] + edge + rng() * 1.2;
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
    const outpost = getPlanet(state.map, id).kind === "outpost" ? 0.8 : 0;
    const edge = sectorEdge(state, player, id) * (level === "hard" ? 2.5 : 1.5);
    return (state.planetValue[id] ?? 0) / 100 + outpost + edge + rng() * 1.5;
  });
}

/** Knowledge edge in a sector for this player: + strong, − weak. */
function sectorEdge(state: MatchState, player: PlayerId, planet: PlanetId): number {
  const cat = state.sectors[planet];
  const opponent = player === "bot" ? state.config.opponent : undefined;
  if (!cat || !opponent) return 0;
  return opponent.strong.includes(cat) ? 1 : opponent.weak.includes(cat) ? -1 : 0;
}

/**
 * Final wager, Final-Jeopardy style: the leader bets just enough that it still wins when wrong,
 * the trailing side goes big. A strong category makes the bot bolder.
 */
export function botWager(state: MatchState, player: PlayerId, level: BotLevel, rng: Rng): number {
  const step = state.step;
  if (step.type !== "wager") return 0;
  const scores = getScores(state);
  const me = scores[player];
  const them = scores[otherPlayer(player)];
  const max = maxWager(state, player);
  const theirMax = maxWager(state, otherPlayer(player));
  const opponent = player === "bot" ? state.config.opponent : undefined;
  const confident = opponent?.strong.includes(step.category) ? 1 : opponent?.weak.includes(step.category) ? -1 : 0;
  const round50 = (x: number) => Math.max(0, Math.min(max, Math.round(x / 50) * 50));
  if (level === "easy") return round50(max * rng());
  if (me <= them) return max;
  // Leading: keep a lead that survives the opponent's best case if possible.
  const safe = me - (them + theirMax) - 50;
  if (safe >= 0) return round50(Math.min(safe, confident > 0 ? max : max / 2));
  return round50(confident > 0 ? max * 0.75 : confident < 0 ? 0 : max * 0.35);
}
