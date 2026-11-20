import { describe, expect, it } from "vitest";
import ru from "../../../content/questions/ru.json";
import {
  POINTS,
  botAnswer,
  botChooseAttack,
  botAccuracy,
  botWager,
  maxWager,
  botChoosePick,
  botWantsBooster,
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
  type Seat,
  DEFAULT_CONFIG,
  OPPONENTS,
  SEAT_IDS,
  activePlayers,
  createBotMatch,
  getRanking,
  mapForPlayers,
  playersToAct,
  ownedPlanets,
  DEFAULT_OPPONENT,
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

function attack(state: MatchState, ctx: GameContext, player: PlayerId, target: string): MatchState {
  return dispatch(state, { type: "ATTACK", player, target }, ctx);
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

function battleState(ctx: GameContext, attacker: PlayerId = "p1"): MatchState {
  const s = createMatch(ctx);
  const owners: MatchState["owners"] = {};
  for (const p of s.map.planets) owners[p.id] = p.y >= 70 ? "p1" : "p2";
  const planetValue: MatchState["planetValue"] = {};
  for (const p of s.map.planets) planetValue[p.id] = p.capitalOf ? POINTS.capital : POINTS.territory;
  return {
    ...s,
    phase: "battle",
    round: 1,
    owners,
    planetValue,
    nextAttacker: attacker === "p1" ? "p2" : "p1",
    step: { type: "attack", player: attacker },
  };
}

describe("createMatch", () => {
  it("owns capitals and opens the first expansion question", () => {
    const ctx = ctxOf();
    const s = createMatch(ctx);
    expect(s.owners.earth).toBe("p1");
    expect(s.owners.neptune).toBe("p2");
    expect(s.phase).toBe("expansion");
    expect(s.step.type).toBe("question");
    if (s.step.type !== "question") return;
    expect(s.step.q.participants).toEqual(["p1", "p2"]);
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
    let s = answer(s0, ctx, "p1", correctValue(s0, ctx), 1000);
    s = answer(s, ctx, "p2", correctValue(s0, ctx), 3000);
    expect(s.step.type).toBe("reveal");
    if (s.step.type !== "reveal") return;
    expect(s.step.reveal.winner).toBe("p1");
    expect(s.step.reveal.outcome).toEqual({ type: "expansion", picks: { p1: 2, p2: 1 } });
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.step).toEqual({ type: "pick", queue: ["p1", "p1", "p2"] });
  });

  it("mcq: wrong answers get nothing, even if fast", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = answer(s0, ctx, "p1", wrongValue(s0, ctx), 500);
    s = answer(s, ctx, "p2", correctValue(s0, ctx), 9000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome).toEqual({ type: "expansion", picks: { p1: 0, p2: 2 } });
  });

  it("numeric: closest wins even when nobody is exact", () => {
    const { s: s0, ctx } = matchWithQuestion("numeric");
    const target = correctValue(s0, ctx);
    let s = answer(s0, ctx, "p1", target + 5, 9000);
    s = answer(s, ctx, "p2", target + 50, 1000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.winner).toBe("p1");
    expect(s.step.reveal.outcome).toEqual({ type: "expansion", picks: { p1: 2, p2: 1 } });
  });

  it("nobody correct -> next question", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = answer(s0, ctx, "p1", null, 15000);
    s = answer(s, ctx, "p2", wrongValue(s0, ctx), 1000);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.step.type).toBe("question");
    expect(s.round).toBe(2);
  });

  it("answers after the time limit count as no answer", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    const s = answer(s0, ctx, "p1", correctValue(s0, ctx), 999_999);
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.answers.p1).toEqual({ value: null, elapsedMs: s.config.mcqTimeMs });
  });

  it("rejects illegal picks and out-of-turn picks", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = answer(s0, ctx, "p1", correctValue(s0, ctx), 1000);
    s = answer(s, ctx, "p2", wrongValue(s0, ctx), 1000);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(dispatch(s, { type: "PICK", player: "p2", planet: "triton" }, ctx)).toBe(s);
    expect(dispatch(s, { type: "PICK", player: "p1", planet: "europa" }, ctx)).toBe(s);
    const legal = getLegalPicks(s, "p1");
    expect(legal.sort()).toEqual(["mars", "moon", "venus"]);
    s = dispatch(s, { type: "PICK", player: "p1", planet: "mars" }, ctx);
    expect(s.owners.mars).toBe("p1");
    expect(s.planetValue.mars).toBe(POINTS.territory);
  });
});

describe("battle", () => {
  it("attacker right, defender wrong -> planet captured and worth more", () => {
    const ctx = ctxOf(3);
    let s = battleState(ctx);
    expect(getLegalAttackTargets(s, "p1")).toContain("europa");
    s = attack(s, ctx, "p1", "europa");
    s = answer(s, ctx, "p1", correctValue(s, ctx), 2000);
    s = answer(s, ctx, "p2", wrongValue(s, ctx), 2000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome.type).toBe("captured");
    expect(s.owners.europa).toBe("p1");
    expect(s.planetValue.europa).toBe(POINTS.territory + POINTS.conquestBonus);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.step).toEqual({ type: "attack", player: "p2" });
  });

  it("both right -> numeric tiebreak; closer attacker wins", () => {
    const ctx = ctxOf(4);
    let s = battleState(ctx);
    s = attack(s, ctx, "p1", "europa");
    s = answer(s, ctx, "p1", correctValue(s, ctx), 2000);
    s = answer(s, ctx, "p2", correctValue(s, ctx), 1000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome.type).toBe("tiebreak-needed");
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.kind).toBe("tiebreak");
    expect(s.step.q.question.type).toBe("numeric");
    const t = correctValue(s, ctx);
    s = answer(s, ctx, "p1", t + 1, 9000);
    s = answer(s, ctx, "p2", t + 2, 1000);
    expect(s.owners.europa).toBe("p1");
  });

  it("defender holds -> defense bonus", () => {
    const ctx = ctxOf(5);
    let s = battleState(ctx);
    const before = getScores(s).p2;
    s = attack(s, ctx, "p1", "europa");
    s = answer(s, ctx, "p1", wrongValue(s, ctx), 2000);
    s = answer(s, ctx, "p2", wrongValue(s, ctx), 2000);
    expect(s.owners.europa).toBe("p2");
    expect(getScores(s).p2).toBe(before + POINTS.defense);
  });

  it("capital falls after its shields are broken and the attacker wins", () => {
    const ctx = ctxOf(6);
    let s = battleState(ctx);
    s = { ...s, owners: { ...s.owners, neptune: "p2", europa: "p1" } };
    for (let hit = 1; hit <= s.config.capitalShields; hit++) {
      s = { ...s, step: { type: "attack", player: "p1" } };
      s = attack(s, ctx, "p1", "neptune");
      s = answer(s, ctx, "p1", correctValue(s, ctx), 1000);
      s = answer(s, ctx, "p2", wrongValue(s, ctx), 1000);
    }
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome.type).toBe("capital-fell");
    expect(Object.values(s.owners).every((o) => o === "p1")).toBe(true);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.phase).toBe("finished");
    expect(s.winner).toBe("p1");
    expect(s.endReason).toBe("capital");
  });

  it("cannot attack a non-adjacent planet", () => {
    const ctx = ctxOf(7);
    const s = battleState(ctx);
    expect(dispatch(s, { type: "ATTACK", player: "p1", target: "neptune" }, ctx)).toBe(s);
  });
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/** Seats for a bot-only test match: p1 has no profile, p2.. get commanders from the ladder. */
function testSeats(n: number): Seat[] {
  if (n === 2) return DEFAULT_CONFIG.seats;
  return SEAT_IDS.slice(0, n).map((id, i) =>
    i === 0 ? { id, kind: "human", name: "P1" } : { id, kind: "bot", name: OPPONENTS[i]!.name, opponent: OPPONENTS[i]! },
  );
}

/** Plays a full match with bots in every seat. Throws if it does not finish. */
function simulate(seed: number, levels: Partial<Record<PlayerId, BotLevel>>): MatchState {
  const ctx: GameContext = { questions: ru as QuestionRecord[], rng: seededRng(seed) };
  const n = Object.keys(levels).length;
  const lv = (p: PlayerId) => levels[p]!;
  let s = deepFreeze(createMatch(ctx, { seats: testSeats(n) }));
  for (let i = 0; i < 3000; i++) {
    const step = s.step;
    let next: MatchState;
    if (step.type === "finished") return s;
    if (step.type === "question") {
      const p = step.q.participants.find((x) => !step.q.answers[x])!;
      const boost = botWantsBooster(s, ctx, lv(p), p);
      if (boost && !step.q.aids[p]) {
        s = deepFreeze(dispatch(s, { type: "BOOST", player: p, booster: boost }, ctx));
      }
      const a = botAnswer(s, ctx, lv(p), p);
      next = answer(s, ctx, p, a.value, a.elapsedMs);
    } else if (step.type === "reveal") {
      next = dispatch(s, { type: "CONTINUE" }, ctx);
    } else if (step.type === "pick") {
      const p = step.queue[0]!;
      const planet = botChoosePick(s, p, lv(p), ctx.rng)!;
      next = dispatch(s, { type: "PICK", player: p, planet }, ctx);
    } else if (step.type === "wager") {
      const p = playersToAct(s)[0]!;
      next = dispatch(s, { type: "WAGER", player: p, amount: botWager(s, p, lv(p), ctx.rng) }, ctx);
    } else {
      const target = botChooseAttack(s, step.player, lv(step.player), ctx.rng)!;
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
    const results = { p1: 0, p2: 0, draw: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const s = simulate(seed, { p1: levels[seed % 3]!, p2: levels[(seed + 1) % 3]! });
      expect(s.phase).toBe("finished");
      expect(s.winner).not.toBeNull();
      expect(freePlanets(s).length).toBe(0);
      results[s.winner!]++;
    }
    expect(results.p1 + results.p2 + results.draw).toBe(300);
  });

  it("harder bot wins more often", () => {
    let hardWins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = simulate(seed, { p1: "easy", p2: "hard" });
      if (s.winner === "p2") hardWins++;
    }
    expect(hardWins).toBeGreaterThan(120);
  });
});

describe("depth mechanics", () => {
  it("planets are category sectors and an attack asks from the target's sector", () => {
    const cats = ["История", "Спорт", "Еда", "Музыка"];
    const ctx = ctxOf(11, [...FIXTURE, ...FIXTURE.map((q) => ({ ...q, id: q.id + "b" }))].map((q, i) => ({ ...q, category: cats[i % cats.length]! })));
    let s = battleState(ctx);
    expect(s.sectors.earth).toBeNull();
    expect(s.sectors.europa).not.toBeNull();
    s = dispatch(s, { type: "ATTACK", player: "p1", target: "europa" }, ctx);
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.question.category).toBe(s.sectors.europa);
    expect(s.battle?.category).toBe(s.sectors.europa);
  });

  it("after the last battle turn comes the wager finale; bets settle the score", () => {
    const ctx = ctxOf(12);
    let s = battleState(ctx);
    s = { ...s, round: s.config.battleTurns, step: { type: "attack", player: "p1" } };
    s = attack(s, ctx, "p1", "europa");
    s = answer(s, ctx, "p1", wrongValue(s, ctx), 2000);
    s = answer(s, ctx, "p2", wrongValue(s, ctx), 2000);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.phase).toBe("finale");
    if (s.step.type !== "wager") throw new Error(s.step.type);
    const before = getScores(s);
    const max = maxWager(s, "p1");
    expect(max).toBe(Math.floor(before.p1 / 2 / 50) * 50);
    s = dispatch(s, { type: "WAGER", player: "p1", amount: 99999 }, ctx);
    s = dispatch(s, { type: "WAGER", player: "p2", amount: 300 }, ctx);
    expect(s.finaleBets).toEqual({ p1: max, p2: 300 });
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.kind).toBe("finale");
    s = answer(s, ctx, "p1", correctValue(s, ctx), 2000);
    s = answer(s, ctx, "p2", wrongValue(s, ctx), 2000);
    const after = getScores(s);
    expect(after.p1).toBe(before.p1 + max);
    expect(after.p2).toBe(before.p2 - 300);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.phase).toBe("finished");
  });

  it("50/50 hides two wrong choices and is spent once", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    const s = dispatch(s0, { type: "BOOST", player: "p1", booster: "fifty" }, ctx);
    if (s.step.type !== "question") throw new Error();
    const hidden = s.step.q.aids.p1!.hidden!;
    expect(hidden).toHaveLength(2);
    expect(hidden).not.toContain(correctValue(s, ctx));
    expect(s.boosters.p1.fifty).toBe(0);
    expect(dispatch(s, { type: "BOOST", player: "p1", booster: "fifty" }, ctx)).toBe(s);
    expect(dispatch(s, { type: "BOOST", player: "p1", booster: "range" }, ctx)).toBe(s);
  });

  it("range hint brackets the numeric answer", () => {
    for (let seed = 1; seed < 40; seed++) {
      const { s: s0, ctx } = matchWithQuestion("numeric", seed * 7);
      const s = dispatch(s0, { type: "BOOST", player: "p1", booster: "range" }, ctx);
      if (s.step.type !== "question") throw new Error();
      const [lo, hi] = s.step.q.aids.p1!.range!;
      const v = correctValue(s, ctx);
      expect(lo).toBeLessThanOrEqual(v);
      expect(hi).toBeGreaterThanOrEqual(v);
      expect(hi).toBeGreaterThan(lo);
    }
  });

  it("a streak of correct answers earns a booster", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = s0;
    let rewarded = false;
    for (let i = 0; i < 12 && !rewarded; i++) {
      if (s.step.type === "question") {
        s = answer(s, ctx, "p1", correctValue(s, ctx), 1000);
        s = answer(s, ctx, "p2", null, 15000);
        if (s.step.type === "reveal" && s.step.reveal.rewards.some((r) => r.reason === "streak")) rewarded = true;
      } else if (s.step.type === "reveal") {
        s = dispatch(s, { type: "CONTINUE" }, ctx);
      } else if (s.step.type === "pick") {
        s = dispatch(s, { type: "PICK", player: "p1", planet: getLegalPicks(s, "p1")[0]! }, ctx);
      } else break;
    }
    expect(rewarded).toBe(true);
    expect(s.tally.p1.bestStreak).toBeGreaterThanOrEqual(s.config.streakForBooster);
  });

  it("taking an outpost grants a booster; giants are worth more", () => {
    const { s: s0, ctx } = matchWithQuestion("mcq");
    let s = answer(s0, ctx, "p1", correctValue(s0, ctx), 1000);
    s = answer(s, ctx, "p2", wrongValue(s0, ctx), 1000);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    const before = s.boosters.p1.fifty + s.boosters.p1.range;
    s = dispatch(s, { type: "PICK", player: "p1", planet: "moon" }, ctx);
    expect(s.boosters.p1.fifty + s.boosters.p1.range).toBe(before + 1);
    expect(s.planetValue.moon).toBe(100);
    expect(s.events.at(-1)).toMatchObject({ type: "booster", player: "p1" });
  });

  it("bot is stronger in its strong categories", () => {
    const opp = { id: "t", name: "t", title: "", level: "normal" as const, strong: ["История"], weak: ["Спорт"] };
    const strong = botAccuracy("normal", opp, "История", 2);
    const weak = botAccuracy("normal", opp, "Спорт", 2);
    const plain = botAccuracy("normal", opp, "Еда", 2);
    expect(strong).toBeGreaterThan(plain);
    expect(weak).toBeLessThan(plain);
  });
});

// ---------------------------------------------------------------------------
// 3–4 players

function matchOf(n: number, seed = 1, questions = FIXTURE): { s: MatchState; ctx: GameContext } {
  const ctx = ctxOf(seed, questions);
  return { s: createMatch(ctx, { seats: testSeats(n) }), ctx };
}

/** Graph distances from one planet to all others. */
function distances(map: MatchState["map"], from: string): Map<string, number> {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const n of map.planets.find((x) => x.id === id)!.neighbors) {
      if (!dist.has(n)) dist.set(n, dist.get(id)! + 1), queue.push(n);
    }
  }
  return dist;
}

/** Battle with every planet owned by the player whose capital is nearest (ties: earlier seat). */
function battleStateN(n: number, seed = 1, attacker: PlayerId = "p1"): { s: MatchState; ctx: GameContext } {
  const { s, ctx } = matchOf(n, seed);
  const caps = s.map.planets.filter((p) => p.capitalOf);
  const dists = caps.map((c) => ({ player: c.capitalOf!, d: distances(s.map, c.id) }));
  const owners: MatchState["owners"] = {};
  const planetValue: MatchState["planetValue"] = {};
  for (const p of s.map.planets) {
    let best = dists[0]!;
    for (const x of dists) if (x.d.get(p.id)! < best.d.get(p.id)!) best = x;
    owners[p.id] = best.player;
    planetValue[p.id] = p.capitalOf ? POINTS.capital : POINTS.territory;
  }
  const order = s.players;
  return {
    s: {
      ...s,
      phase: "battle",
      round: 1,
      owners,
      planetValue,
      nextAttacker: order[(order.indexOf(attacker) + 1) % order.length]!,
      step: { type: "attack", player: attacker },
    },
    ctx,
  };
}

/** One attack turn that the defender holds; returns the state after CONTINUE. */
function heldTurn(s: MatchState, ctx: GameContext, target?: string): MatchState {
  if (s.step.type !== "attack") throw new Error(`expected attack, got ${s.step.type}`);
  const p = s.step.player;
  const t = target ?? getLegalAttackTargets(s, p).find((id) => !s.map.planets.find((x) => x.id === id)!.capitalOf)!;
  s = attack(s, ctx, p, t);
  if (s.step.type !== "question") throw new Error();
  for (const x of s.step.q.participants) s = answer(s, ctx, x, wrongValue(s, ctx), 2000);
  return dispatch(s, { type: "CONTINUE" }, ctx);
}

/** Breaks the capital of `defender` with `attacker` (shield by shield). Ends at the reveal. */
function takeCapital(s: MatchState, ctx: GameContext, attacker: PlayerId, defender: PlayerId): MatchState {
  const cap = s.map.planets.find((p) => p.capitalOf === defender)!.id;
  const nb = s.map.planets.find((p) => p.id === cap)!.neighbors[0]!;
  s = { ...s, owners: { ...s.owners, [nb]: attacker } };
  for (let hit = 1; hit <= s.config.capitalShields; hit++) {
    s = { ...s, step: { type: "attack", player: attacker } };
    s = attack(s, ctx, attacker, cap);
    s = answer(s, ctx, attacker, correctValue(s, ctx), 1000);
    s = answer(s, ctx, defender, wrongValue(s, ctx), 1000);
  }
  return s;
}

describe("maps for 2–4 players", () => {
  it.each([2, 3, 4])("%i players: symmetric, connected, every planet has 2+ neighbours, fair capitals", (n) => {
    const map = mapForPlayers(n);
    expect(map.planets.length).toBeGreaterThanOrEqual(13);
    expect(map.planets.length).toBeLessThanOrEqual(19);
    expect(new Set(map.planets.map((p) => p.id)).size).toBe(map.planets.length);
    for (const p of map.planets) {
      expect(p.neighbors.length).toBeGreaterThanOrEqual(2);
      for (const nb of p.neighbors) expect(map.planets.find((x) => x.id === nb)!.neighbors).toContain(p.id);
    }
    const caps = map.planets.filter((p) => p.capitalOf);
    expect(caps.map((c) => c.capitalOf).sort()).toEqual(SEAT_IDS.slice(0, n));
    // Every capital sees the same picture: same number of planets at each distance, same distances
    // to enemy capitals, same kinds within two jumps.
    const profile = (cap: string) => {
      const d = distances(map, cap);
      expect(d.size).toBe(map.planets.length);
      const rings = [...d.values()].sort((a, b) => a - b).join(",");
      const enemies = caps.filter((c) => c.id !== cap).map((c) => d.get(c.id)).sort().join(",");
      const near = map.planets.filter((p) => d.get(p.id)! <= 2).map((p) => p.kind).sort().join(",");
      return { rings, enemies, near };
    };
    const first = profile(caps[0]!.id);
    for (const c of caps) expect(profile(c.id)).toEqual(first);
  });

  it("2 players keep the Sol map: p1 = Earth, p2 = Neptune", () => {
    const s = createBotMatch(ctxOf(), DEFAULT_OPPONENT);
    expect(s.map.id).toBe("sol-system");
    expect(s.players).toEqual(["p1", "p2"]);
    expect(s.config.battleTurns).toBe(8);
    expect(s.config.seats[1]).toMatchObject({ id: "p2", kind: "bot", opponent: DEFAULT_OPPONENT });
  });

  it("rejects bad seat lists", () => {
    const one: Seat[] = [{ id: "p1", kind: "human", name: "a" }];
    expect(() => createMatch(ctxOf(), { seats: one })).toThrow();
    const gap: Seat[] = [
      { id: "p1", kind: "human", name: "a" },
      { id: "p3", kind: "human", name: "b" },
    ];
    expect(() => createMatch(ctxOf(), { seats: gap })).toThrow();
  });
});

describe("3–4 players", () => {
  it.each([3, 4])("%i players: state holds only the seats in the match", (n) => {
    const { s } = matchOf(n);
    const seats = SEAT_IDS.slice(0, n);
    expect(s.players).toEqual(seats);
    expect(s.eliminated).toEqual([]);
    expect(s.config.battleTurns).toBe(4 * n);
    for (const rec of [s.shields, s.bonus, s.boosters, s.streak, s.tally]) expect(Object.keys(rec)).toEqual(seats);
    for (const p of seats) expect(s.owners[s.map.planets.find((x) => x.capitalOf === p)!.id]).toBe(p);
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.participants).toEqual(seats);
  });

  it("expansion with 3: fastest correct gets 2 picks, next correct 1, the rest none", () => {
    let found: { s: MatchState; ctx: GameContext } | null = null;
    for (let k = 1; k < 200 && !found; k++) {
      const m = matchOf(3, k);
      if (activeRecord(m.s, m.ctx).type === "mcq") found = m;
    }
    const { s: s0, ctx } = found!;
    let s = answer(s0, ctx, "p1", wrongValue(s0, ctx), 500);
    s = answer(s, ctx, "p3", correctValue(s0, ctx), 4000);
    expect(s.step.type).toBe("question");
    s = answer(s, ctx, "p2", correctValue(s0, ctx), 2000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.winner).toBe("p2");
    expect(s.step.reveal.outcome).toEqual({ type: "expansion", picks: { p1: 0, p2: 2, p3: 1 } });
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.step).toEqual({ type: "pick", queue: ["p2", "p2", "p3"] });
    expect(dispatch(s, { type: "PICK", player: "p3", planet: getLegalPicks(s, "p3")[0]! }, ctx)).toBe(s);
  });

  it("numeric expansion with 3: ranked by distance, then speed", () => {
    let found: { s: MatchState; ctx: GameContext } | null = null;
    for (let k = 1; k < 200 && !found; k++) {
      const m = matchOf(3, k);
      if (activeRecord(m.s, m.ctx).type === "numeric") found = m;
    }
    const { s: s0, ctx } = found!;
    const t = correctValue(s0, ctx);
    let s = answer(s0, ctx, "p1", t + 10, 1000);
    s = answer(s, ctx, "p2", t + 10, 900);
    s = answer(s, ctx, "p3", t - 3, 9000);
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome).toEqual({ type: "expansion", picks: { p1: 0, p2: 1, p3: 2 } });
  });

  it("battle turns go round-robin; a battle question is only for attacker and defender", () => {
    const { s: s0, ctx } = battleStateN(3, 5);
    let s = s0;
    const order: PlayerId[] = [];
    for (let i = 0; i < 6; i++) {
      if (s.step.type !== "attack") throw new Error(s.step.type);
      order.push(s.step.player);
      const p = s.step.player;
      const target = getLegalAttackTargets(s, p).find((id) => !s.map.planets.find((x) => x.id === id)!.capitalOf)!;
      const asked = attack(s, ctx, p, target);
      if (asked.step.type !== "question") throw new Error();
      expect(asked.step.q.participants).toEqual([p, s.owners[target]]);
      expect(playersToAct(asked)).toHaveLength(2);
      s = heldTurn(s, ctx, target);
    }
    expect(order).toEqual(["p1", "p2", "p3", "p1", "p2", "p3"]);
  });

  it("the trailing player attacks first", () => {
    const { s: s0, ctx } = matchOf(3, 9);
    // Hand out every free planet so that p3 is behind, then let the last pick start the battle.
    const free = freePlanets(s0);
    const owners = { ...s0.owners };
    const planetValue = { ...s0.planetValue };
    free.slice(0, -1).forEach((id, i) => {
      owners[id] = i % 2 ? "p1" : "p2";
      planetValue[id] = POINTS.territory;
    });
    const last = free.at(-1)!;
    const s: MatchState = { ...s0, owners, planetValue, step: { type: "pick", queue: ["p1"] } };
    const nb = s.map.planets.find((p) => p.id === last)!.neighbors[0]!;
    const s2 = dispatch({ ...s, owners: { ...owners, [nb]: "p1" } }, { type: "PICK", player: "p1", planet: last }, ctx);
    expect(s2.phase).toBe("battle");
    expect(s2.step).toEqual({ type: "attack", player: "p3" });
    expect(s2.nextAttacker).toBe("p1");
  });

  it("a fallen capital eliminates its owner; the match goes on and skips them", () => {
    const { s: s0, ctx } = battleStateN(3, 6);
    const p2Planets = ownedPlanets(s0, "p2");
    let s = takeCapital(s0, ctx, "p1", "p2");
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome).toMatchObject({ type: "capital-fell", final: false });
    expect(s.eliminated).toEqual(["p2"]);
    expect(activePlayers(s)).toEqual(["p1", "p3"]);
    for (const id of p2Planets) expect(s.owners[id]).toBe("p1");
    expect(s.events.at(-1)).toEqual({ type: "capital-fell", player: "p1", loser: "p2" });
    expect(s.winner).toBeNull();
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.phase).toBe("battle");
    // p2 is out: the turn goes p3, p1, p3 …
    const order: PlayerId[] = [];
    for (let i = 0; i < 3; i++) {
      if (s.step.type !== "attack") throw new Error(s.step.type);
      order.push(s.step.player);
      s = heldTurn(s, ctx);
    }
    expect(order).toEqual(["p3", "p1", "p3"]);
    // The old capital is an ordinary planet now: attacking it costs no shields.
    const oldCap = s.map.planets.find((p) => p.capitalOf === "p2")!.id;
    expect(getRanking(s).at(-1)).toBe("p2");
    expect(s.owners[oldCap]).toBe("p1");
  });

  it("the last capital to fall ends the match", () => {
    const { s: s0, ctx } = battleStateN(3, 7);
    let s = takeCapital(s0, ctx, "p1", "p2");
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    s = takeCapital(s, ctx, "p1", "p3");
    if (s.step.type !== "reveal") throw new Error();
    expect(s.step.reveal.outcome).toMatchObject({ type: "capital-fell", final: true });
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.phase).toBe("finished");
    expect(s.winner).toBe("p1");
    expect(s.endReason).toBe("capital");
    expect(getRanking(s)).toEqual(["p1", "p3", "p2"]);
  });

  it("finale with 3: everyone still in bets and answers; top score wins", () => {
    const { s: s0, ctx } = battleStateN(3, 12);
    let s: MatchState = { ...s0, round: s0.config.battleTurns, step: { type: "attack", player: "p1" } };
    s = heldTurn(s, ctx);
    expect(s.phase).toBe("finale");
    if (s.step.type !== "wager") throw new Error(s.step.type);
    expect(playersToAct(s)).toEqual(["p1", "p2", "p3"]);
    const before = getScores(s);
    s = dispatch(s, { type: "WAGER", player: "p2", amount: 100 }, ctx);
    s = dispatch(s, { type: "WAGER", player: "p1", amount: 200 }, ctx);
    expect(s.step.type).toBe("wager");
    s = dispatch(s, { type: "WAGER", player: "p3", amount: 300 }, ctx);
    expect(s.finaleBets).toEqual({ p1: 200, p2: 100, p3: 300 });
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.participants).toEqual(["p1", "p2", "p3"]);
    s = answer(s, ctx, "p1", wrongValue(s, ctx), 2000);
    s = answer(s, ctx, "p2", correctValue(s, ctx), 2000);
    s = answer(s, ctx, "p3", correctValue(s, ctx), 2000);
    if (s.step.type !== "reveal" || s.step.reveal.outcome.type !== "finale") throw new Error();
    expect(s.step.reveal.outcome.deltas).toEqual({ p1: -200, p2: 100, p3: 300 });
    const after = getScores(s);
    expect(after.p1).toBe(before.p1! - 200);
    expect(after.p3).toBe(before.p3! + 300);
    const ranking = getRanking(s);
    expect(s.winner).toBe(after[ranking[0]!] === after[ranking[1]!] ? "draw" : ranking[0]);
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    expect(s.phase).toBe("finished");
  });

  it("eliminated players sit out the finale", () => {
    const { s: s0, ctx } = battleStateN(3, 13);
    let s = takeCapital(s0, ctx, "p1", "p2");
    s = { ...s, round: s.config.battleTurns };
    s = dispatch(s, { type: "CONTINUE" }, ctx);
    if (s.step.type !== "wager") throw new Error(s.step.type);
    expect(playersToAct(s)).toEqual(["p1", "p3"]);
    expect(dispatch(s, { type: "WAGER", player: "p2", amount: 0 }, ctx)).toBe(s);
    s = dispatch(s, { type: "WAGER", player: "p1", amount: 0 }, ctx);
    s = dispatch(s, { type: "WAGER", player: "p3", amount: 0 }, ctx);
    if (s.step.type !== "question") throw new Error();
    expect(s.step.q.participants).toEqual(["p1", "p3"]);
  });

  it.each([3, 4])("full %i-player bot matches always finish without mutating state", (n) => {
    const levels: BotLevel[] = ["easy", "normal", "hard"];
    let eliminations = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const lv: Partial<Record<PlayerId, BotLevel>> = {};
      SEAT_IDS.slice(0, n).forEach((p, i) => (lv[p] = levels[(seed + i) % 3]!));
      const s = simulate(seed, lv);
      expect(s.phase).toBe("finished");
      expect(s.winner).not.toBeNull();
      expect(freePlanets(s).length).toBe(0);
      expect(Object.keys(s.tally)).toEqual(SEAT_IDS.slice(0, n));
      eliminations += s.eliminated.length;
      if (s.endReason === "capital") expect(activePlayers(s)).toEqual([s.winner]);
      else expect(s.round).toBeLessThanOrEqual(s.config.battleTurns + 1);
    }
    expect(eliminations).toBeGreaterThan(0);
  });
});
