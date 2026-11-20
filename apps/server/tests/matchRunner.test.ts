import type { MatchState } from "@space-conquistador/game-core";
import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_TIMING } from "../src/config";
import { MatchRunner, publicState, type AcceptedAction, type Clock } from "../src/matchRunner";
import { loadQuestions } from "../src/questions";

const questions = loadQuestions();

/** Manual clock: timers fire only when the test advances time. */
function fakeClock() {
  let now = 1_000_000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => void timers.delete(h as number),
  };
  function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
    }
    now = end;
  }
  return { clock, advance, pending: () => timers.size };
}

/** The right answer of the active question, read from the server-side state and the bank. */
function correctAnswer(state: MatchState): number {
  const step = state.step;
  if (step.type !== "question") throw new Error("no question");
  const record = questions.find((q) => q.id === step.q.question.id)!;
  if (record.type === "numeric") return record.correctValue!;
  return step.q.choiceOrder ? step.q.choiceOrder.indexOf(record.correctIndex ?? 0) : (record.correctIndex ?? 0);
}

function runner(connected: Record<string, boolean>) {
  const { clock, advance, pending } = fakeClock();
  const actions: AcceptedAction[] = [];
  let changes = 0;
  let finished = 0;
  let abandoned = 0;
  const r = new MatchRunner({
    id: "m1",
    roomCode: "ABCD",
    seats: [
      { seat: "p1", playerId: "u1", nickname: "Один" },
      { seat: "p2", playerId: "u2", nickname: "Два" },
    ],
    questions,
    seed: 42,
    timing: DEFAULT_MATCH_TIMING,
    clock,
    botRng: () => 0.5,
    isConnected: (id) => connected[id] ?? false,
    hooks: {
      onChange: () => void changes++,
      onAction: (_, e) => void actions.push(e),
      onFinished: () => void finished++,
      onAbandoned: () => void abandoned++,
    },
  });
  r.start();
  return { r, clock, advance, pending, actions, changes: () => changes, finished: () => finished, abandoned: () => abandoned };
}

describe("MatchRunner timing", () => {
  it("opens answers after the reading beat and closes the question at deadline + grace", () => {
    const t = runner({ u1: true, u2: true });
    const step = t.r.state.step;
    if (step.type !== "question") throw new Error("expected a question");
    const snap = t.r.snapshotFor("u1");
    const reading = DEFAULT_MATCH_TIMING.readingMs(step.q.question.text);
    expect(snap.timing.answersAt).toBe(t.clock.now() + reading);
    expect(snap.timing.deadline).toBe(snap.timing.answersAt! + step.q.timeLimitMs);
    expect(t.pending()).toBe(1);

    expect(() => t.r.handle("u1", { type: "ANSWER", value: 0 })).toThrow("not open");
    t.advance(reading + 1_000);
    t.r.handle("u1", { type: "ANSWER", value: 0 });
    const answered = t.r.state.step;
    if (answered.type !== "question") throw new Error("expected a question");
    expect(answered.q.answers.p1!.elapsedMs).toBe(1_000);

    // p2 stays silent: nothing happens until deadline + grace.
    t.advance(step.q.timeLimitMs - 1_000 + DEFAULT_MATCH_TIMING.answerGrace - 1);
    expect(t.r.state.step.type).toBe("question");
    t.advance(1);
    expect(t.r.state.step.type).toBe("reveal");
    expect(t.actions.at(-1)).toMatchObject({ source: "timeout", playerId: "u2", action: { type: "ANSWER", value: null } });
    expect(t.r.snapshotFor("u1").timing.revealUntil).toBe(t.clock.now() + DEFAULT_MATCH_TIMING.revealAutoContinue);

    // Reveal: one "continue" is not enough, the second closes it.
    t.r.handle("u1", { type: "CONTINUE" });
    expect(t.r.state.step.type).toBe("reveal");
    expect(t.r.snapshotFor("u2").continued).toEqual(["p1"]);
    t.r.handle("u2", { type: "CONTINUE" });
    expect(t.r.state.step.type).not.toBe("reveal");
  });

  it("closes the reveal by itself after revealAutoContinue", () => {
    const t = runner({ u1: true, u2: true });
    const step = t.r.state.step;
    if (step.type !== "question") throw new Error("expected a question");
    t.advance(DEFAULT_MATCH_TIMING.readingMs(step.q.question.text) + step.q.timeLimitMs + DEFAULT_MATCH_TIMING.answerGrace);
    expect(t.r.state.step.type).toBe("reveal");
    t.advance(DEFAULT_MATCH_TIMING.revealAutoContinue);
    expect(t.r.state.step.type).not.toBe("reveal");
    expect(t.actions.at(-1)).toMatchObject({ source: "auto", playerId: null, action: { type: "CONTINUE" } });
  });

  it("pauses while nobody is connected, resumes with the clock shifted, abandons after abandonAfter", () => {
    const online: Record<string, boolean> = { u1: true, u2: true };
    const t = runner(online);
    const deadline = t.r.snapshotFor("u1").timing.deadline!;
    online.u1 = online.u2 = false;
    t.r.presenceChanged();
    expect(t.r.paused).toBe(true);
    t.advance(60_000);
    expect(t.r.state.step.type).toBe("question");
    online.u1 = true;
    t.r.presenceChanged();
    expect(t.r.paused).toBe(false);
    expect(t.r.snapshotFor("u1").timing.deadline).toBe(deadline + 60_000);

    online.u1 = false;
    t.r.presenceChanged();
    t.advance(DEFAULT_MATCH_TIMING.abandonAfter - 1);
    expect(t.abandoned()).toBe(0);
    t.advance(1);
    expect(t.abandoned()).toBe(1);
    expect(t.r.abandoned).toBe(true);
    expect(t.pending()).toBe(0);
  });

  it("finishes a match where one player answers and the other is offline", () => {
    const online: Record<string, boolean> = { u1: true, u2: false };
    const t = runner(online);
    for (let i = 0; i < 5_000 && !t.r.finished; i++) {
      const s = t.r.state;
      const step = s.step;
      if (step.type === "question" && step.q.participants.includes("p1") && !step.q.answers.p1) {
        t.advance(Math.max(0, t.r.snapshotFor("u1").timing.answersAt! - t.clock.now()) + 500);
        if (t.r.state === s) t.r.handle("u1", { type: "ANSWER", value: correctAnswer(s) });
      } else if (step.type === "reveal" && !t.r.snapshotFor("u1").continued.includes("p1")) {
        t.r.handle("u1", { type: "CONTINUE" });
      } else {
        // Picks / attacks / wagers of p1 are left to the turn timeout, p2's to the offline delay.
        t.advance(500);
      }
    }
    expect(t.r.finished).toBe(true);
    expect(t.finished()).toBe(1);
    expect(t.pending()).toBe(0);
    const byP2 = t.actions.filter((a) => a.playerId === "u2");
    expect(byP2.length).toBeGreaterThan(0);
    expect(byP2.every((a) => a.source === "timeout")).toBe(true);
    // p2 is offline: its attacks come after offlineMoveDelay, not the 20 s turn timeout.
    expect(t.r.results().ranking[0]).toBe("p1");
    expect(() => t.r.handle("u1", { type: "CONTINUE" })).toThrow("over");
  });

  it("moves for an idle connected player after turnTimeout", () => {
    const t = runner({ u1: true, u2: true });
    const step = t.r.state.step;
    if (step.type !== "question") throw new Error("expected a question");
    // p1 answers correctly, p2 stays silent: p1 wins picks but does not use them.
    t.advance(DEFAULT_MATCH_TIMING.readingMs(step.q.question.text));
    const answer = correctAnswer(t.r.state);
    t.r.handle("u1", { type: "ANSWER", value: answer });
    t.advance(step.q.timeLimitMs + DEFAULT_MATCH_TIMING.answerGrace);
    expect(t.r.state.step.type).toBe("reveal");
    t.r.handle("u1", { type: "CONTINUE" });
    t.r.handle("u2", { type: "CONTINUE" });
    expect(t.r.state.step).toMatchObject({ type: "pick", queue: ["p1", "p1"] });
    expect(t.r.snapshotFor("u1").timing.turnUntil).toBe(t.clock.now() + DEFAULT_MATCH_TIMING.turnTimeout);
    const before = t.r.state;
    t.advance(DEFAULT_MATCH_TIMING.turnTimeout - 1);
    expect(t.r.state).toBe(before);
    t.advance(1);
    expect(t.r.state.step).toMatchObject({ type: "pick", queue: ["p1"] });
    expect(t.actions.at(-1)).toMatchObject({ source: "timeout", playerId: "u1", action: { type: "PICK" } });
  });

  it("masks the active question for other seats", () => {
    const t = runner({ u1: true, u2: true });
    const step = t.r.state.step;
    if (step.type !== "question") throw new Error("expected a question");
    t.advance(DEFAULT_MATCH_TIMING.readingMs(step.q.question.text));
    if (step.q.question.type === "mcq") t.r.handle("u1", { type: "BOOST", booster: "fifty" });
    t.r.handle("u1", { type: "ANSWER", value: 1 });
    const theirs = publicState(t.r.state, "p2");
    const s = theirs.step;
    if (s.type !== "question") throw new Error("expected a question");
    expect("choiceOrder" in s.q).toBe(false);
    expect(s.q.answers.p1).toEqual({ value: null, elapsedMs: 0 });
    expect(s.q.aids).toEqual({});
    const mine = publicState(t.r.state, "p1").step;
    if (mine.type !== "question") throw new Error("expected a question");
    expect(mine.q.answers.p1!.value).toBe(1);
  });
});
