import { SOL_SYSTEM } from "../map/sol-system";
import {
  displayedCorrectIndex,
  drawQuestion,
  evaluateAnswer,
  findQuestion,
} from "../questions";
import type {
  ActiveQuestion,
  Answer,
  BattleInfo,
  GameAction,
  GameContext,
  MatchConfig,
  MatchState,
  PlayerId,
  QuestionKind,
  QuestionRecord,
  QuestionType,
  Reveal,
  RevealAnswer,
  Step,
} from "../types";
import {
  POINTS,
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
  botLevel: "normal",
  capitalShields: 3,
  expansionNumericShare: 0.35,
};

/** Creates a match that is already in the first expansion question. */
export function createMatch(ctx: GameContext, config: Partial<MatchConfig> = {}): MatchState {
  const map = SOL_SYSTEM;
  const owners: MatchState["owners"] = {};
  const planetValue: MatchState["planetValue"] = {};
  for (const p of map.planets) {
    owners[p.id] = p.capitalOf ?? null;
    planetValue[p.id] = p.capitalOf ? POINTS.capital : 0;
  }
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const state: MatchState = {
    version: 2,
    map,
    config: cfg,
    phase: "expansion",
    round: 0,
    owners,
    planetValue,
    shields: { human: cfg.capitalShields, bot: cfg.capitalShields },
    bonus: { human: 0, bot: 0 },
    battle: null,
    nextAttacker: "human",
    step: { type: "finished" },
    usedQuestionIds: [],
    winner: null,
    endReason: null,
  };
  return startExpansionQuestion(state, ctx);
}

export function dispatch(state: MatchState, action: GameAction, ctx: GameContext): MatchState {
  switch (action.type) {
    case "ANSWER":
      return onAnswer(state, action.player, action.value, action.elapsedMs, ctx);
    case "CONTINUE":
      return onContinue(state, ctx);
    case "PICK":
      return onPick(state, action.player, action.planet, ctx);
    case "ATTACK":
      return onAttack(state, action.player, action.target, ctx);
    default:
      return state;
  }
}

/** Clears answers of the active question, e.g. after restoring a saved match. */
export function restartQuestion(state: MatchState): MatchState {
  if (state.step.type !== "question") return state;
  return { ...state, step: { type: "question", q: { ...state.step.q, answers: {} } } };
}

/** Who must act right now (answer, pick or attack), excluding finished/reveal steps. */
export function playersToAct(state: MatchState): PlayerId[] {
  const step = state.step;
  switch (step.type) {
    case "question":
      return step.q.participants.filter((p) => !step.q.answers[p]);
    case "pick":
      return step.queue.length ? [step.queue[0]!] : [];
    case "attack":
      return [step.player];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Questions

function askQuestion(
  state: MatchState,
  ctx: GameContext,
  kind: QuestionKind,
  participants: PlayerId[],
  type: QuestionType,
): MatchState {
  const { record, question, choiceOrder } = drawQuestion(ctx, state.usedQuestionIds, type);
  const q: ActiveQuestion = {
    kind,
    question,
    choiceOrder,
    participants,
    answers: {},
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
  return resolveQuestion(next, nextQ, record);
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

function resolveQuestion(state: MatchState, aq: ActiveQuestion, record: QuestionRecord): MatchState {
  const answers: Partial<Record<PlayerId, RevealAnswer>> = {};
  for (const p of aq.participants) {
    const a = aq.answers[p]!;
    answers[p] = { ...a, ...evaluateAnswer(record, aq, a.value) };
  }
  const base = {
    kind: aq.kind,
    question: aq.question,
    correctIndex: record.type === "mcq" ? displayedCorrectIndex(record, aq) : undefined,
    correctValue: record.type === "numeric" ? record.correctValue : undefined,
    answers,
  };

  if (aq.kind === "expansion") {
    const ranked =
      record.type === "numeric"
        ? rankNumeric(aq, answers)
        : aq.participants
            .filter((p) => answers[p]!.correct)
            .sort((a, b) => answers[a]!.elapsedMs - answers[b]!.elapsedMs);

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

  const battle = state.battle!;
  const att = answers[battle.attacker]!;
  const def = answers[battle.defender]!;

  if (aq.kind === "battle") {
    if (att.correct && def.correct) {
      const reveal: Reveal = { ...base, winner: null, outcome: { type: "tiebreak-needed" } };
      return { ...state, step: { type: "reveal", reveal, next: { type: "tiebreak" } } };
    }
    return applyBattleResult(state, base, battle, att.correct && !def.correct);
  }

  // tiebreak: attacker must be strictly closer, or equally close and faster.
  const ranked = rankNumeric(aq, answers);
  const attackerWins =
    ranked[0] === battle.attacker &&
    (def.value === null ||
      (att.distance ?? Infinity) < (def.distance ?? Infinity) ||
      att.elapsedMs < def.elapsedMs);
  return applyBattleResult(state, base, battle, attackerWins);
}

function applyBattleResult(
  state: MatchState,
  base: Omit<Reveal, "winner" | "outcome">,
  battle: BattleInfo,
  attackerWins: boolean,
): MatchState {
  if (!attackerWins) {
    const reveal: Reveal = { ...base, winner: battle.defender, outcome: { type: "defended", battle } };
    return {
      ...state,
      bonus: { ...state.bonus, [battle.defender]: state.bonus[battle.defender] + POINTS.defense },
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
      return { ...state, shields, step: { type: "reveal", reveal, next: { type: "next-battle-turn" } } };
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
      step: { type: "reveal", reveal, next: { type: "finished" } },
    };
  }

  const reveal: Reveal = { ...base, winner: battle.attacker, outcome: { type: "captured", battle } };
  return {
    ...state,
    owners: { ...state.owners, [battle.target]: battle.attacker },
    planetValue: {
      ...state.planetValue,
      [battle.target]: Math.max(state.planetValue[battle.target] ?? 0, POINTS.conquered),
    },
    step: { type: "reveal", reveal, next: { type: "next-battle-turn" } },
  };
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
      return advanceBattle(state);
    case "finished":
      return finish(state, state.winner ?? "draw", state.endReason ?? "score");
  }
}

function onPick(state: MatchState, player: PlayerId, planet: string, ctx: GameContext): MatchState {
  const step = state.step;
  if (step.type !== "pick" || step.queue[0] !== player) return state;
  if (!getLegalPicks(state, player).includes(planet)) return state;

  const next: MatchState = {
    ...state,
    owners: { ...state.owners, [planet]: player },
    planetValue: { ...state.planetValue, [planet]: POINTS.territory },
  };
  const queue = step.queue.slice(1);
  if (freePlanets(next).length === 0) return startBattle(next, ctx);
  if (queue.length === 0) return startExpansionQuestion(next, ctx);
  return { ...next, step: { type: "pick", queue } };
}

function startBattle(state: MatchState, _ctx: GameContext): MatchState {
  const scores = getScores(state);
  // The trailing player attacks first; on a tie the human starts.
  const first: PlayerId = scores.bot < scores.human ? "bot" : "human";
  return advanceBattle({ ...state, phase: "battle", round: 0, battle: null, nextAttacker: first });
}

function advanceBattle(state: MatchState): MatchState {
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
  const scores = getScores(s);
  const winner = scores.human === scores.bot ? "draw" : scores.human > scores.bot ? "human" : "bot";
  return finish(s, winner, "score");
}

function onAttack(state: MatchState, player: PlayerId, target: string, ctx: GameContext): MatchState {
  const step = state.step;
  if (step.type !== "attack" || step.player !== player) return state;
  if (!getLegalAttackTargets(state, player).includes(target)) return state;
  const defender = state.owners[target]!;
  const battle: BattleInfo = { attacker: player, defender, target };
  return askQuestion({ ...state, battle }, ctx, "battle", [player, defender], "mcq");
}

function finish(
  state: MatchState,
  winner: PlayerId | "draw",
  endReason: "score" | "capital",
): MatchState {
  const step: Step = { type: "finished" };
  return { ...state, phase: "finished", winner, endReason, step };
}
