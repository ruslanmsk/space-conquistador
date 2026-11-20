import { describe, expect, it } from "vitest";
import ru from "../../../content/questions/ru.json";
import {
  POINTS,
  botAnswer,
  botChooseAttack,
  botChoosePick,
  createMatch,
  dispatch,
  freePlanets,
  getLegalAttackTargets,
  getLegalPicks,
  getScores,
  seededRng,
  type BotLevel,
  type GameContext,
  type MatchState,
  type PlayerId,
  type QuestionRecord,
} from "../src";

const FIXTURE: QuestionRecord[] = [
  ...[1, 2, 3, 4, 5, 6].map(
    (i): QuestionRecord => ({
      id: `m${i}`,
      type: "mcq",
      text: `MCQ ${i}`,
      category: "test",
      difficulty: 1,
      choices: ["A", "B", "C", "D"],
      correctIndex: i % 4,
    }),
  ),
  ...[1, 2, 3, 4, 5, 6].map(
    (i): QuestionRecord => ({
      id: `n${i}`,
      type: "numeric",
      text: `NUM ${i}`,
      category: "test",
      difficulty: 1,
      correctValue: 100 * i,
      tolerance: 0,
    }),
  ),
];

function ctxOf(seed = 1, questions = FIXTURE): GameContext {
  return { questions, rng: seededRng(seed) };
}

function activeRecord(state: MatchState, ctx: GameContext): QuestionRecord {
  if (state.step.type !== "question") throw new Error(`expected question, got ${state.step.type}`);
  const id = state.step.q.question.id;
  return ctx.questions.find((q) => q.id === id)!;
}

function correctValue(state: MatchState, ctx: GameContext): number {
  const rec = activeRecord(state, ctx);
  if (state.step.type !== "question") throw new Error();
  if (rec.type === "numeric") return rec.correctValue!;
  return state.step.q.choiceOrder!.indexOf(rec.correctIndex!);
}

function wrongValue(state: MatchState, ctx: GameContext): number {
  const rec = activeRecord(state, ctx);
  if (rec.type === "numeric") return rec.correctValue! + 1000;
  return (correctValue(state, ctx) + 1) % 4;
}

function answer(state: MatchState, ctx: GameContext, player: PlayerId, value: number | null, ms: number) {
  return dispatch(state, { type: "ANSWER", player, value, elapsedMs: ms }, ctx);
}

/** Creates a match whose first question has the requested type. */
function matchWithQuestion(type: "mcq" | "numeric", seed = 1): { s: MatchState; ctx: GameContext } {
  for (let k = seed; k < seed + 200; k++) {
    const ctx = ctxOf(k);
    const s = createMatch(ctx);
    if (activeRecord(s, ctx).type === type) return { s, ctx };
  }
  throw new Error("no seed");
}

function battleState(ctx: GameContext, attacker: PlayerId = "human"): MatchState {
  const s = createMatch(ctx);
  const owners: MatchState["owners"] = {};
  for (const p of s.map.planets) owners[p.id] = p.y >= 70 ? "human" : "bot";
  const planetValue: MatchState["planetValue"] = {};
  for (const p of s.map.planets) planetValue[p.id] = p.capitalOf ? POINTS.capital : POINTS.territory;
  return {
    ...s,
    phase: "battle",
    round: 1,
    owners,
    planetValue,
    nextAttacker: attacker === "human" ? "bot" : "human",
    step: { type: "attack", player: attacker },
  };
}

describe("createMatch", () => {
  it("owns capitals and opens the first expansion question", () => {
    const ctx = ctxOf();
    const s = createMatch(ctx);
    expect(s.owners.earth).toBe("human");
    expect(s.owners.neptune).toBe("bot");
    expect(s.phase).toBe("expansion");
    expect(s.step.type).toBe("question");
    if (s.step.type !== "question") return;
    expect(s.step.q.participants).toEqual(["human", "bot"]);
    expect(s.step.q.question).not.toHaveProperty("correctIndex");
    expect(s.step.q.question).not.toHaveProperty("correctValue");
  });

  it("map graph is symmetric and connected", () => {
    const s = createMatch(ctxOf());
    for (const p of s.map.planets) {
      for (const n of p.neighbors) {
        expect(s.map.planets.find((x) => x.id === n)!.neighbors).toContain(p.id);
      }
    }
    const seen = new Set(["earth"]);
    const stack = ["earth"];
    while (stack.length) {
      const id = stack.pop()!;
      for (const n of s.map.planets.find((x) => x.id === id)!.neighbors) {
        if (!seen.has(n)) seen.add(n), stack.push(n);
      }
    }
    expect(seen.size).toBe(s.map.planets.length);
  });
});

describe("expansion", () => {
  it("mcq: faster correct player gets 2 picks, slower correct gets 1", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = answer(s0, ctx, "human", correctValue(s0, ctx), 1000);
    s = answer(s, ctx, "bot", correctValue(s0, ctx), 3000);
    expect(s.step.type).toBe("reveal");
    if (s.step.type !== "reveal") return;
    expect(s.step.reveal.winner).toBe("human");
    expect(s.step.reveal.outcome).toEqual({ type: "expansion", picks: { human: 2, bot: 1 } });
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.step).toEqual({ type: "pick", queue: ["human", "human", "bot"] });
  });

  it("mcq: wrong answers get nothing, even if fast", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = answer(s0, ctx, "human", wrongValue(s0, ctx), 500);
    s = answer(s, ctx, "bot", correctValue(s0, ctx), 9000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome).toEqual({ type: "expansion", picks: { human: 0, bot: 2 } });
  });

  it("numeric: closest wins even when nobody is exact", () => {
    const { s: s0, ctx } = matchWithQuestion("numeric");
    const target = correctValue(s0, ctx);
    let s = answer(s0, ctx, "human", target + 5, 9000);
    s = answer(s, ctx, "bot", target + 50, 1000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.winner).toBe("human");
    expect(s.step.reveal.outcome).toEqual({ type: "expansion", picks: { human: 2, bot: 1 } });
  });

  it("nobody correct -> next question", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = answer(s0, ctx, "human", null, 15000);
    s = answer(s, ctx, "bot", wrongValue(s0, ctx), 1000);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.step.type).toBe("question");
    expect(s.round).toBe(2);
  });

  it("answers after the time limit count as no answer", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    const s = answer(s0, ctx, "human", correctValue(s0, ctx), 999_999);
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.answers.human).toEqual({ value: null, elapsedMs: s.config.mcqTimeMs });
  });

  it("rejects illegal picks and out-of-turn picks", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = answer(s0, ctx, "human", correctValue(s0, ctx), 1000);
    s = answer(s, ctx, "bot", wrongValue(s0, ctx), 1000);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(dispatch(s, { type: "PICK", player: "bot", planet: "triton" }, ctx)).toBe(s);
    expect(dispatch(s, { type: "PICK", player: "human", planet: "europa" }, ctx)).toBe(s);
    const legal = getLegalPicks(s, "human");
    expect(legal.sort()).toEqual(["mars", "moon", "venus"]);
    s = dispatch(s, { type: "PICK", player: "human", planet: "mars" }, ctx);
    expect(s.owners.mars).toBe("human");
    expect(s.planetValue.mars).toBe(POINTS.territory);
  });
});

describe("battle", () => {
  it("attacker right, defender wrong -> planet captured and worth more", () => {
    const ctx = ctxOf(3);
    let s = battleState(ctx);
    expect(getLegalAttackTargets(s, "human")).toContain("europa");
    s = dispatch(s, { type: "ATTACK", player: "human", target: "europa" }, ctx);
    s = answer(s, ctx, "human", correctValue(s, ctx), 2000);
    s = answer(s, ctx, "bot", wrongValue(s, ctx), 2000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome.type).toBe("captured");
    expect(s.owners.europa).toBe("human");
    expect(s.planetValue.europa).toBe(POINTS.conquered);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.step).toEqual({ type: "attack", player: "bot" });
  });

  it("both right -> numeric tiebreak; closer attacker wins", () => {
    const ctx = ctxOf(4);
    let s = battleState(ctx);
    s = dispatch(s, { type: "ATTACK", player: "human", target: "europa" }, ctx);
    s = answer(s, ctx, "human", correctValue(s, ctx), 2000);
    s = answer(s, ctx, "bot", correctValue(s, ctx), 1000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome.type).toBe("tiebreak-needed");
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.kind).toBe("tiebreak");
    expect(s.step.q.question.type).toBe("numeric");
    const t = correctValue(s, ctx);
    s = answer(s, ctx, "human", t + 1, 9000);
    s = answer(s, ctx, "bot", t + 2, 1000);
    expect(s.owners.europa).toBe("human");
  });

  it("defender holds -> defense bonus", () => {
    const ctx = ctxOf(5);
    let s = battleState(ctx);
    const before = getScores(s).bot;
    s = dispatch(s, { type: "ATTACK", player: "human", target: "europa" }, ctx);
    s = answer(s, ctx, "human", wrongValue(s, ctx), 2000);
    s = answer(s, ctx, "bot", wrongValue(s, ctx), 2000);
    expect(s.owners.europa).toBe("bot");
    expect(getScores(s).bot).toBe(before + POINTS.defense);
  });

  it("capital falls after its shields are broken and the attacker wins", () => {
    const ctx = ctxOf(6);
    let s = battleState(ctx);
    s = { ...s, owners: { ...s.owners, neptune: "bot", europa: "human" } };
    for (let hit = 1; hit <= s.config.capitalShields; hit++) {
      s = { ...s, step: { type: "attack", player: "human" } };
      s = dispatch(s, { type: "ATTACK", player: "human", target: "neptune" }, ctx);
      s = answer(s, ctx, "human", correctValue(s, ctx), 1000);
      s = answer(s, ctx, "bot", wrongValue(s, ctx), 1000);
    }
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome.type).toBe("capital-fell");
    expect(Object.values(s.owners).every((o) => o === "human")).toBe(true);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.phase).toBe("finished");
    expect(s.winner).toBe("human");
    expect(s.endReason).toBe("capital");
  });

  it("cannot attack a non-adjacent planet", () => {
    const ctx = ctxOf(7);
    const s = battleState(ctx);
    expect(dispatch(s, { type: "ATTACK", player: "human", target: "neptune" }, ctx)).toBe(s);
  });
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** Plays a full match with bots on both sides. Throws if it does not finish. */
function simulate(seed: number, levels: Record<PlayerId, BotLevel>): MatchState {
  const ctx: GameContext = { questions: ru as QuestionRecord[], rng: seededRng(seed) };
  let s = deepFreeze(createMatch(ctx, { botLevel: levels.bot }));
  for (let i = 0; i < 1000; i++) {
    const step = s.step;
    let next: MatchState;
    if (step.type === "finished") return s;
    if (step.type === "question") {
      const p = step.q.participants.find((x) => !step.q.answers[x])!;
      const a = botAnswer(s, ctx, levels[p]);
      next = answer(s, ctx, p, a.value, a.elapsedMs);
    } else if (step.type === "reveal") {
      next = dispatch(s, { type: "CONTINUE" }, ctx);
    } else if (step.type === "pick") {
      const p = step.queue[0]!;
      const planet = botChoosePick(s, p, levels[p], ctx.rng)!;
      next = dispatch(s, { type: "PICK", player: p, planet }, ctx);
    } else {
      const target = botChooseAttack(s, step.player, levels[step.player], ctx.rng)!;
      next = dispatch(s, { type: "ATTACK", player: step.player, target }, ctx);
    }
    expect(next).not.toBe(s);
    s = deepFreeze(next);
  }
  throw new Error(`match ${seed} did not finish`);
}

describe("full matches (bot vs bot)", () => {
  it("always finish without getting stuck or mutating state", () => {
    const levels: BotLevel[] = ["easy", "normal", "hard"];
    const results = { human: 0, bot: 0, draw: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const s = simulate(seed, { human: levels[seed % 3]!, bot: levels[(seed + 1) % 3]! });
      expect(s.phase).toBe("finished");
      expect(s.winner).not.toBeNull();
      expect(freePlanets(s).length).toBe(0);
      results[s.winner!]++;
    }
    expect(results.human + results.bot + results.draw).toBe(300);
  });

  it("harder bot wins more often", () => {
    let hardWins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = simulate(seed, { human: "easy", bot: "hard" });
      if (s.winner === "bot") hardWins++;
    }
    expect(hardWins).toBeGreaterThan(120);
  });
});
