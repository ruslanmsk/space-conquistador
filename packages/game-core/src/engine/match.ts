import { DEFAULT_OPPONENT } from "../bot/opponents";
import { SOL_SYSTEM, getPlanet } from "../map/sol-system";
import {
  availableCategories,
  displayedCorrectIndex,
  drawQuestion,
  evaluateAnswer,
  fiftyFifty,
  findQuestion,
  rangeHint,
} from "../questions";
import { pickRandom, shuffle } from "../rng";
import type {
  ActiveQuestion,
  Answer,
  BattleInfo,
  BoosterType,
  Category,
  GameAction,
  GameContext,
  MatchConfig,
  MatchEvent,
  MatchState,
  PlayerId,
  PlayerTally,
  QuestionKind,
  QuestionRecord,
  QuestionType,
  Reveal,
  RevealAnswer,
  RevealReward,
  Step,
} from "../types";
import {
  POINTS,
  baseValue,
  freePlanets,
  getLegalAttackTargets,
  getLegalPicks,
  getScores,
  isCapital,
  otherPlayer,
  ownedPlanets,
} from "./rules";

export const DEFAULT_CONFIG: MatchConfig = {
  battleTurns: 8,
  mcqTimeMs: 15_000,
  numericTimeMs: 20_000,
  botLevel: DEFAULT_OPPONENT.level,
  opponent: DEFAULT_OPPONENT,
  capitalShields: 3,
  expansionNumericShare: 0.35,
  finaleMaxShare: 0.5,
  streakForBooster: 3,
};

const BOOSTER_TYPES: BoosterType[] = ["fifty", "range"];
const PLAYER_IDS: PlayerId[] = ["human", "bot"];

const emptyTally = (): PlayerTally => ({
  answered: 0,
  correct: 0,
  correctMs: 0,
  bestStreak: 0,
  captured: 0,
  defended: 0,
});

/** Creates a match that is already in the first expansion question. */
export function createMatch(ctx: GameContext, config: Partial<MatchConfig> = {}): MatchState {
  const map = SOL_SYSTEM;
  const owners: MatchState["owners"] = {};
  const planetValue: MatchState["planetValue"] = {};
  for (const p of map.planets) {
    owners[p.id] = p.capitalOf ?? null;
    planetValue[p.id] = p.capitalOf ? POINTS.capital : 0;
  }
  const opponent = config.opponent ?? DEFAULT_CONFIG.opponent;
  const cfg: MatchConfig = {
    ...DEFAULT_CONFIG,
    botLevel: opponent.level,
    ...config,
    opponent,
  };

  const sectors = assignSectors(map.planets, ctx);
  const state: MatchState = {
    version: 4,
    map,
    config: cfg,
    phase: "expansion",
    round: 0,
    owners,
    sectors,
    planetValue,
    shields: { human: cfg.capitalShields, bot: cfg.capitalShields },
    bonus: { human: 0, bot: 0 },
    boosters: { human: { fifty: 1, range: 1 }, bot: { fifty: 1, range: 1 } },
    streak: { human: 0, bot: 0 },
    tally: { human: emptyTally(), bot: emptyTally() },
    events: [],
    battle: null,
    finaleBets: null,
    nextAttacker: "human",
    step: { type: "finished" },
    usedQuestionIds: [],
    winner: null,
    endReason: null,
  };
  return startExpansionQuestion(state, ctx);
}

/** Minimum unused MCQ questions a category needs to become a sector. */
const SECTOR_MIN_QUESTIONS = 6;

/** Gives every non-capital planet a distinct category (repeating only if there are too few). */
function assignSectors(planets: MatchState["map"]["planets"], ctx: GameContext): MatchState["sectors"] {
  const counts = new Map<Category, number>();
  for (const q of ctx.questions) if (q.type === "mcq") counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  let cats = [...counts].filter(([, n]) => n >= SECTOR_MIN_QUESTIONS).map(([c]) => c);
  if (!cats.length) cats = [...counts.keys()];
  const deck = shuffle(ctx.rng, cats);
  const sectors: MatchState["sectors"] = {};
  let i = 0;
  for (const p of planets) {
    sectors[p.id] = p.capitalOf || !deck.length ? null : deck[i++ % deck.length]!;
  }
  return sectors;
}

export function dispatch(state: MatchState, action: GameAction, ctx: GameContext): MatchState {
  switch (action.type) {
    case "ANSWER":
      return onAnswer(state, action.player, action.value, action.elapsedMs, ctx);
    case "BOOST":
      return onBoost(state, action.player, action.booster, ctx);
    case "CONTINUE":
      return onContinue(state, ctx);
    case "PICK":
      return onPick(state, action.player, action.planet, ctx);
    case "ATTACK":
      return onAttack(state, action.player, action.target, ctx);
    case "WAGER":
      return onWager(state, action.player, action.amount, ctx);
    default:
      return state;
  }
}

/** Clears answers of the active question, e.g. after restoring a saved match. */
export function restartQuestion(state: MatchState): MatchState {
  if (state.step.type !== "question") return state;
  return { ...state, step: { type: "question", q: { ...state.step.q, answers: {} } } };
}

/** Who must act right now (answer, pick, attack or choose), excluding finished/reveal steps. */
export function playersToAct(state: MatchState): PlayerId[] {
  const step = state.step;
  switch (step.type) {
    case "question":
      return step.q.participants.filter((p) => !step.q.answers[p]);
    case "pick":
      return step.queue.length ? [step.queue[0]!] : [];
    case "attack":
      return [step.player];
    case "wager":
      return PLAYER_IDS.filter((p) => step.bets[p] === undefined);
    default:
      return [];
  }
}

/** Boosters the player can use on the active question right now. */
export function usableBoosters(state: MatchState, player: PlayerId): BoosterType[] {
  const step = state.step;
  if (step.type !== "question") return [];
  const q = step.q;
  if (!q.participants.includes(player) || q.answers[player]) return [];
  const aid = q.aids[player];
  const wanted: BoosterType = q.question.type === "mcq" ? "fifty" : "range";
  if (state.boosters[player][wanted] <= 0) return [];
  if (wanted === "fifty" && aid?.hidden) return [];
  if (wanted === "range" && aid?.range) return [];
  return [wanted];
}

// ---------------------------------------------------------------------------
// Questions

function askQuestion(
  state: MatchState,
  ctx: GameContext,
  kind: QuestionKind,
  participants: PlayerId[],
  type: QuestionType,
  category?: Category,
): MatchState {
  const { record, question, choiceOrder } = drawQuestion(ctx, state.usedQuestionIds, type, category);
  const q: ActiveQuestion = {
    kind,
    question,
    choiceOrder,
    participants,
    answers: {},
    aids: {},
    timeLimitMs: type === "mcq" ? state.config.mcqTimeMs : state.config.numericTimeMs,
  };
  return {
    ...state,
    usedQuestionIds: [...state.usedQuestionIds, record.id],
    step: { type: "question", q },
  };
}

function startExpansionQuestion(state: MatchState, ctx: GameContext): MatchState {
  if (freePlanets(state).length === 0) return startBattle(state, ctx);
  const type: QuestionType = ctx.rng() < state.config.expansionNumericShare ? "numeric" : "mcq";
  return askQuestion({ ...state, round: state.round + 1 }, ctx, "expansion", ["human", "bot"], type);
}

function normalizeAnswer(
  record: QuestionRecord,
  aq: ActiveQuestion,
  value: number | null,
  elapsedMs: number,
): Answer {
  const elapsed = Math.max(0, Math.min(aq.timeLimitMs, Math.round(elapsedMs)));
  if (value === null || !Number.isFinite(value) || elapsed >= aq.timeLimitMs) {
    return { value: null, elapsedMs: aq.timeLimitMs };
  }
  if (record.type === "mcq") {
    const n = record.choices?.length ?? 0;
    if (!Number.isInteger(value) || value < 0 || value >= n) return { value: null, elapsedMs: elapsed };
  }
  return { value, elapsedMs: elapsed };
}

function onBoost(state: MatchState, player: PlayerId, booster: BoosterType, ctx: GameContext): MatchState {
  if (!usableBoosters(state, player).includes(booster)) return state;
  const step = state.step;
  if (step.type !== "question") return state;
  const record = findQuestion(ctx, step.q.question.id);
  const aid = { ...step.q.aids[player] };
  if (booster === "fifty") aid.hidden = fiftyFifty(record, step.q, ctx.rng);
  else aid.range = rangeHint(record, ctx.rng);
  return {
    ...state,
    boosters: {
      ...state.boosters,
      [player]: { ...state.boosters[player], [booster]: state.boosters[player][booster] - 1 },
    },
    step: { type: "question", q: { ...step.q, aids: { ...step.q.aids, [player]: aid } } },
  };
}

function onAnswer(
  state: MatchState,
  player: PlayerId,
  value: number | null,
  elapsedMs: number,
  ctx: GameContext,
): MatchState {
  const step = state.step;
  if (step.type !== "question") return state;
  const aq = step.q;
  if (!aq.participants.includes(player) || aq.answers[player]) return state;

  const record = findQuestion(ctx, aq.question.id);
  const answers = { ...aq.answers, [player]: normalizeAnswer(record, aq, value, elapsedMs) };
  const nextQ: ActiveQuestion = { ...aq, answers };
  const next: MatchState = { ...state, step: { type: "question", q: nextQ } };

  if (!aq.participants.every((p) => answers[p])) return next;
  return resolveQuestion(next, nextQ, record, ctx);
}

/** Numeric ranking: answered players by distance, then by speed. */
function rankNumeric(aq: ActiveQuestion, answers: Partial<Record<PlayerId, RevealAnswer>>): PlayerId[] {
  return aq.participants
    .filter((p) => answers[p]?.value !== null)
    .sort((a, b) => {
      const ra = answers[a]!;
      const rb = answers[b]!;
      const dd = (ra.distance ?? Infinity) - (rb.distance ?? Infinity);
      return dd !== 0 ? dd : ra.elapsedMs - rb.elapsedMs;
    });
}

/**
 * Updates streaks and tallies. A "good" answer is a correct MCQ, or for numeric questions being
 * the closest (numeric answers are rarely exact). Every `streakForBooster` good answers in a row
 * grant a booster.
 */
function scoreAnswers(
  state: MatchState,
  aq: ActiveQuestion,
  answers: Partial<Record<PlayerId, RevealAnswer>>,
  good: Set<PlayerId>,
  ctx: GameContext,
): { state: MatchState; rewards: RevealReward[] } {
  const streak = { ...state.streak };
  const tally = { ...state.tally };
  const boosters = { ...state.boosters };
  const rewards: RevealReward[] = [];
  const events: MatchEvent[] = [];
  for (const p of aq.participants) {
    const a = answers[p]!;
    const t = { ...tally[p] };
    t.answered++;
    if (good.has(p)) {
      t.correct++;
      t.correctMs += a.elapsedMs;
      streak[p] = streak[p] + 1;
      t.bestStreak = Math.max(t.bestStreak, streak[p]);
      if (streak[p] % state.config.streakForBooster === 0) {
        const booster = pickRandom(ctx.rng, BOOSTER_TYPES)!;
        boosters[p] = { ...boosters[p], [booster]: boosters[p][booster] + 1 };
        rewards.push({ player: p, booster, reason: "streak" });
        events.push({ type: "booster", player: p, booster });
      }
    } else {
      streak[p] = 0;
    }
    tally[p] = t;
  }
  return {
    state: { ...state, streak, tally, boosters, events: [...state.events, ...events] },
    rewards,
  };
}

function resolveQuestion(
  state0: MatchState,
  aq: ActiveQuestion,
  record: QuestionRecord,
  ctx: GameContext,
): MatchState {
  const answers: Partial<Record<PlayerId, RevealAnswer>> = {};
  for (const p of aq.participants) {
    const a = aq.answers[p]!;
    answers[p] = { ...a, ...evaluateAnswer(record, aq, a.value) };
  }
  const ranked =
    record.type === "numeric"
      ? rankNumeric(aq, answers)
      : aq.participants
          .filter((p) => answers[p]!.correct)
          .sort((a, b) => answers[a]!.elapsedMs - answers[b]!.elapsedMs);

  const good = new Set<PlayerId>(
    record.type === "numeric"
      ? aq.participants.filter((p) => answers[p]!.correct || p === ranked[0])
      : ranked,
  );
  const scored = scoreAnswers(state0, aq, answers, good, ctx);
  const state = scored.state;

  const base = {
    kind: aq.kind,
    question: aq.question,
    correctIndex: record.type === "mcq" ? displayedCorrectIndex(record, aq) : undefined,
    correctValue: record.type === "numeric" ? record.correctValue : undefined,
    fact: record.fact,
    answers,
    rewards: scored.rewards,
  };

  if (aq.kind === "expansion") {
    const free = freePlanets(state).length;
    const queue: PlayerId[] = [];
    ranked.forEach((p, place) => {
      const n = place === 0 ? 2 : place === 1 ? 1 : 0;
      for (let i = 0; i < n && queue.length < free; i++) queue.push(p);
    });
    const picks = {
      human: queue.filter((p) => p === "human").length,
      bot: queue.filter((p) => p === "bot").length,
    };
    const reveal: Reveal = {
      ...base,
      winner: ranked[0] ?? null,
      outcome: { type: "expansion", picks },
    };
    return {
      ...state,
      step: {
        type: "reveal",
        reveal,
        next: queue.length ? { type: "pick", queue } : { type: "expansion-question" },
      },
    };
  }

  if (aq.kind === "finale") return resolveFinale(state, base, answers);

  const battle = state.battle!;
  const att = answers[battle.attacker]!;
  const def = answers[battle.defender]!;

  if (aq.kind === "battle") {
    if (att.correct && def.correct) {
      const reveal: Reveal = { ...base, winner: null, outcome: { type: "tiebreak-needed" } };
      return { ...state, step: { type: "reveal", reveal, next: { type: "tiebreak" } } };
    }
    return applyBattleResult(state, base, battle, att.correct && !def.correct, ctx);
  }

  // tiebreak: attacker must be strictly closer, or equally close and faster.
  const attackerWins =
    ranked[0] === battle.attacker &&
    (def.value === null ||
      (att.distance ?? Infinity) < (def.distance ?? Infinity) ||
      att.elapsedMs < def.elapsedMs);
  return applyBattleResult(state, base, battle, attackerWins, ctx);
}

function grantOutpostBooster(
  state: MatchState,
  player: PlayerId,
  planet: string,
  ctx: GameContext,
): { state: MatchState; reward?: RevealReward } {
  if (getPlanet(state.map, planet).kind !== "outpost") return { state };
  const booster = pickRandom(ctx.rng, BOOSTER_TYPES)!;
  return {
    state: {
      ...state,
      boosters: {
        ...state.boosters,
        [player]: { ...state.boosters[player], [booster]: state.boosters[player][booster] + 1 },
      },
      events: [...state.events, { type: "booster", player, booster }],
    },
    reward: { player, booster, reason: "outpost" },
  };
}

function bumpTally(state: MatchState, player: PlayerId, key: "captured" | "defended"): MatchState["tally"] {
  return { ...state.tally, [player]: { ...state.tally[player], [key]: state.tally[player][key] + 1 } };
}

function applyBattleResult(
  state: MatchState,
  base: Omit<Reveal, "winner" | "outcome">,
  battle: BattleInfo,
  attackerWins: boolean,
  ctx: GameContext,
): MatchState {
  if (!attackerWins) {
    const reveal: Reveal = { ...base, winner: battle.defender, outcome: { type: "defended", battle } };
    return {
      ...state,
      bonus: { ...state.bonus, [battle.defender]: state.bonus[battle.defender] + POINTS.defense },
      tally: bumpTally(state, battle.defender, "defended"),
      events: [...state.events, { type: "defended", player: battle.defender, planet: battle.target }],
      step: { type: "reveal", reveal, next: { type: "next-battle-turn" } },
    };
  }

  if (isCapital(state, battle.target)) {
    const shieldsLeft = state.shields[battle.defender] - 1;
    const shields = { ...state.shields, [battle.defender]: shieldsLeft };
    if (shieldsLeft > 0) {
      const reveal: Reveal = {
        ...base,
        winner: battle.attacker,
        outcome: { type: "shield-down", battle, shieldsLeft },
      };
      return {
        ...state,
        shields,
        events: [...state.events, { type: "shield-down", player: battle.attacker, shieldsLeft }],
        step: { type: "reveal", reveal, next: { type: "next-battle-turn" } },
      };
    }
    const owners = { ...state.owners };
    for (const id of ownedPlanets(state, battle.defender)) owners[id] = battle.attacker;
    const reveal: Reveal = { ...base, winner: battle.attacker, outcome: { type: "capital-fell", battle } };
    return {
      ...state,
      shields,
      owners,
      winner: battle.attacker,
      endReason: "capital",
      events: [...state.events, { type: "capital-fell", player: battle.attacker }],
      step: { type: "reveal", reveal, next: { type: "finished" } },
    };
  }

  const captured: MatchState = {
    ...state,
    owners: { ...state.owners, [battle.target]: battle.attacker },
    planetValue: {
      ...state.planetValue,
      [battle.target]: (state.planetValue[battle.target] ?? 0) + POINTS.conquestBonus,
    },
    tally: bumpTally(state, battle.attacker, "captured"),
    events: [...state.events, { type: "captured", player: battle.attacker, planet: battle.target }],
  };
  const { state: withReward, reward } = grantOutpostBooster(captured, battle.attacker, battle.target, ctx);
  const reveal: Reveal = {
    ...base,
    rewards: reward ? [...base.rewards, reward] : base.rewards,
    winner: battle.attacker,
    outcome: { type: "captured", battle },
  };
  return { ...withReward, step: { type: "reveal", reveal, next: { type: "next-battle-turn" } } };
}

// ---------------------------------------------------------------------------
// Steps

function onContinue(state: MatchState, ctx: GameContext): MatchState {
  const step = state.step;
  if (step.type !== "reveal") return state;
  switch (step.next.type) {
    case "expansion-question":
      return startExpansionQuestion(state, ctx);
    case "pick":
      return { ...state, step: { type: "pick", queue: step.next.queue } };
    case "tiebreak": {
      const b = state.battle!;
      return askQuestion(state, ctx, "tiebreak", [b.attacker, b.defender], "numeric");
    }
    case "next-battle-turn":
      return advanceBattle(state, ctx);
    case "finished":
      return finish(state, state.winner ?? "draw", state.endReason ?? "score");
  }
}

function onPick(state: MatchState, player: PlayerId, planet: string, ctx: GameContext): MatchState {
  const step = state.step;
  if (step.type !== "pick" || step.queue[0] !== player) return state;
  if (!getLegalPicks(state, player).includes(planet)) return state;

  const picked: MatchState = {
    ...state,
    owners: { ...state.owners, [planet]: player },
    planetValue: { ...state.planetValue, [planet]: baseValue(state, planet) },
    events: [...state.events, { type: "picked", player, planet }],
  };
  const next = grantOutpostBooster(picked, player, planet, ctx).state;
  const queue = step.queue.slice(1);
  if (freePlanets(next).length === 0) return startBattle(next, ctx);
  if (queue.length === 0) return startExpansionQuestion(next, ctx);
  return { ...next, step: { type: "pick", queue } };
}

function startBattle(state: MatchState, _ctx: GameContext): MatchState {
  const scores = getScores(state);
  // The trailing player attacks first; on a tie the human starts.
  const first: PlayerId = scores.bot < scores.human ? "bot" : "human";
  return advanceBattle({ ...state, phase: "battle", round: 0, battle: null, nextAttacker: first }, _ctx);
}

function advanceBattle(state: MatchState, ctx: GameContext): MatchState {
  let s: MatchState = { ...state, battle: null };
  for (let skipped = 0; skipped < 2; skipped++) {
    s = { ...s, round: s.round + 1 };
    if (s.round > s.config.battleTurns) break;
    const attacker = s.nextAttacker;
    s = { ...s, nextAttacker: otherPlayer(attacker) };
    if (getLegalAttackTargets(s, attacker).length > 0) {
      return { ...s, step: { type: "attack", player: attacker } };
    }
  }
  return startFinale(s, ctx);
}

// ---------------------------------------------------------------------------
// Finale: "Ва-банк" — the category is revealed, both bet up to half their score, one question.

export function maxWager(state: MatchState, player: PlayerId): number {
  const score = getScores(state)[player];
  return Math.max(0, Math.floor((score * state.config.finaleMaxShare) / 50) * 50);
}

function startFinale(state: MatchState, ctx: GameContext): MatchState {
  const cats = availableCategories(ctx, state.usedQuestionIds, "mcq");
  const category = pickRandom(ctx.rng, cats);
  if (!category) return finishByScore(state);
  return {
    ...state,
    phase: "finale",
    battle: null,
    step: { type: "wager", category, bets: {} },
  };
}

function onWager(state: MatchState, player: PlayerId, amount: number, ctx: GameContext): MatchState {
  const step = state.step;
  if (step.type !== "wager" || step.bets[player] !== undefined) return state;
  const bet = Math.max(0, Math.min(maxWager(state, player), Math.round(amount)));
  const bets = { ...step.bets, [player]: bet };
  if (PLAYER_IDS.some((p) => bets[p] === undefined)) {
    return { ...state, step: { ...step, bets } };
  }
  const asked = askQuestion(
    { ...state, step: { ...step, bets } },
    ctx,
    "finale",
    PLAYER_IDS,
    "mcq",
    step.category,
  );
  return { ...asked, finaleBets: bets as Record<PlayerId, number> };
}

function resolveFinale(
  state: MatchState,
  base: Omit<Reveal, "winner" | "outcome">,
  answers: Partial<Record<PlayerId, RevealAnswer>>,
): MatchState {
  const bets = state.finaleBets ?? { human: 0, bot: 0 };
  const deltas = { human: 0, bot: 0 } as Record<PlayerId, number>;
  const bonus = { ...state.bonus };
  const events: MatchEvent[] = [];
  for (const p of PLAYER_IDS) {
    deltas[p] = answers[p]?.correct ? bets[p] : -bets[p];
    bonus[p] += deltas[p];
    if (bets[p]) events.push({ type: "finale", player: p, delta: deltas[p] });
  }
  const scored: MatchState = { ...state, bonus, events: [...state.events, ...events] };
  const scores = getScores(scored);
  const winner: PlayerId | "draw" =
    scores.human === scores.bot ? "draw" : scores.human > scores.bot ? "human" : "bot";
  const reveal: Reveal = {
    ...base,
    winner: winner === "draw" ? null : winner,
    outcome: { type: "finale", bets, deltas },
  };
  return {
    ...scored,
    winner,
    endReason: "score",
    step: { type: "reveal", reveal, next: { type: "finished" } },
  };
}

function finishByScore(s: MatchState): MatchState {
  const scores = getScores(s);
  const winner = scores.human === scores.bot ? "draw" : scores.human > scores.bot ? "human" : "bot";
  return finish(s, winner, "score");
}

function onAttack(state: MatchState, player: PlayerId, target: string, ctx: GameContext): MatchState {
  const step = state.step;
  if (step.type !== "attack" || step.player !== player) return state;
  if (!getLegalAttackTargets(state, player).includes(target)) return state;
  const defender = state.owners[target]!;
  const category = state.sectors[target] ?? undefined;
  const battle: BattleInfo = { attacker: player, defender, target, category };
  return askQuestion({ ...state, battle }, ctx, "battle", [player, defender], "mcq", category);
}

function finish(
  state: MatchState,
  winner: PlayerId | "draw",
  endReason: "score" | "capital",
): MatchState {
  const step: Step = { type: "finished" };
  return { ...state, phase: "finished", winner, endReason, step };
}
