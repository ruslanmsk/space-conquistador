import {
  activePlayers,
  botChooseAttack,
  botChoosePick,
  botWager,
  createMatch,
  dispatch,
  getLegalAttackTargets,
  getLegalPicks,
  getRanking,
  getScores,
  seededRng,
  type GameAction,
  type GameContext,
  type MatchState,
  type PerPlayer,
  type PlayerId,
  type QuestionRecord,
  type Rng,
} from "@space-conquistador/game-core";
import type { ClientAction, MatchSnapshot, MatchTiming } from "@space-conquistador/protocol";
import type { MatchTimingConfig } from "./config";
import { AppError } from "./errors";

/** Level the server plays at when it moves for an idle or offline seat. */
const AUTO_LEVEL = "normal" as const;

export type SeatInfo = { seat: PlayerId; playerId: string; nickname: string };

/** Time source and timers, injectable so the loop can run on a fake clock in tests. */
export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** player = sent by a client; timeout = the server moved for an idle/offline seat; auto = reveal closed by the server. */
export type EventSource = "player" | "timeout" | "auto";

export type AcceptedAction = {
  /** 1-based order of accepted actions in this match. */
  seq: number;
  playerId: string | null;
  source: EventSource;
  action: GameAction;
};

export type RunnerHooks = {
  /** Something clients see changed: send everyone a fresh snapshot. */
  onChange(runner: MatchRunner): void;
  onAction(runner: MatchRunner, e: AcceptedAction): void;
  /** Called once, when the match reaches the finished step. */
  onFinished(runner: MatchRunner): void;
  /** Called once, when every player stayed offline for `abandonAfter`; the runner is stopped. */
  onAbandoned(runner: MatchRunner): void;
};

export type RunnerOptions = {
  id: string;
  roomCode: string;
  seats: SeatInfo[];
  questions: QuestionRecord[];
  /** Seed of the game rng (createMatch + dispatch); with the accepted actions it replays the match. */
  seed: number;
  timing: MatchTimingConfig;
  isConnected: (playerId: string) => boolean;
  hooks: RunnerHooks;
  clock?: Clock;
  /** Rng for the server's own moves (kept apart from the game rng so replays stay exact). */
  botRng?: Rng;
};

type Due = { at: number; seat: PlayerId | null };

/**
 * Authoritative loop of one online match: validates intents through game-core `dispatch`, keeps
 * the clock (reading beat, deadlines, reveal and turn timeouts), moves for idle or offline seats,
 * and hands out per-seat snapshots that never contain an active question's answer.
 *
 * One timer per match: every change clears it and schedules the earliest pending deadline.
 */
export class MatchRunner {
  readonly id: string;
  readonly roomCode: string;
  readonly seats: readonly SeatInfo[];
  readonly seed: number;
  state: MatchState;

  private readonly ctx: GameContext;
  private readonly botCtx: GameContext;
  private readonly timing: MatchTimingConfig;
  private readonly clock: Clock;
  private readonly hooks: RunnerHooks;
  private readonly isConnected: (playerId: string) => boolean;

  private seq = 0;
  private actionSeq = 0;
  private questionSerial = -1;
  private answersAt?: number;
  private deadline?: number;
  private revealUntil?: number;
  private turnUntil?: number;
  /** When the current reveal / pick / attack / wager step began. */
  private stepStartedAt = 0;
  private readonly continued = new Set<PlayerId>();
  private readonly offlineSince = new Map<PlayerId, number>();
  private timer: unknown = null;
  /** Set while every player is offline: the match clock is paused. */
  private pausedAt?: number;
  private started = false;
  private done = false;
  /** Abandoned (all players gone too long) — no longer runs. */
  abandoned = false;

  constructor(opts: RunnerOptions) {
    this.id = opts.id;
    this.roomCode = opts.roomCode;
    this.seats = opts.seats;
    this.seed = opts.seed;
    this.timing = opts.timing;
    this.clock = opts.clock ?? realClock;
    this.hooks = opts.hooks;
    this.isConnected = opts.isConnected;
    this.ctx = { questions: opts.questions, rng: seededRng(opts.seed) };
    this.botCtx = { questions: opts.questions, rng: opts.botRng ?? Math.random };
    this.state = createMatch(this.ctx, {
      seats: opts.seats.map((s) => ({ id: s.seat, kind: "human" as const, name: s.nickname })),
      ...(opts.timing.mcqTimeMs ? { mcqTimeMs: opts.timing.mcqTimeMs } : {}),
      ...(opts.timing.numericTimeMs ? { numericTimeMs: opts.timing.numericTimeMs } : {}),
    });
  }

  /** Starts the clock and sends the first snapshot. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.refreshPresence();
    this.afterChange(undefined);
  }

  /** Stops the timer (server shutdown). */
  stop(): void {
    this.clearTimer();
    this.done = true;
  }

  get finished(): boolean {
    return this.state.step.type === "finished";
  }

  seatOf(playerId: string): PlayerId | undefined {
    return this.seats.find((s) => s.playerId === playerId)?.seat;
  }

  playerOf(seat: PlayerId): string {
    return this.seats.find((s) => s.seat === seat)!.playerId;
  }

  /** Final standings: ranking (1st first), scores and 1-based ranks with shared ranks for ties. */
  results(): { ranking: PlayerId[]; scores: PerPlayer<number>; ranks: PerPlayer<number> } {
    const ranking = getRanking(this.state);
    const scores = getScores(this.state);
    const ranks: PerPlayer<number> = {};
    ranking.forEach((p, i) => {
      const prev = ranking[i - 1];
      const tied =
        prev !== undefined &&
        !this.state.eliminated.includes(p) &&
        !this.state.eliminated.includes(prev) &&
        scores[p] === scores[prev];
      ranks[p] = tied ? ranks[prev]! : i + 1;
    });
    return { ranking, scores, ranks };
  }

  // -------------------------------------------------------------------------
  // Client intents

  /** Applies a client intent for `playerId`, or throws AppError("illegal_action" | "not_in_match"). */
  handle(playerId: string, action: ClientAction, receivedAt = this.clock.now()): void {
    const seat = this.seatOf(playerId);
    if (!seat) throw new AppError("not_in_match", "You are not playing in this match");
    if (this.finished) throw new AppError("illegal_action", "The match is over");
    if (!action || typeof action !== "object") throw new AppError("bad_request", "Missing action");
    const prev = this.state;

    if (action.type === "CONTINUE") {
      if (this.state.step.type !== "reveal") throw new AppError("illegal_action", "Nothing to continue");
      this.continued.add(seat);
      if (this.everyoneContinued()) {
        this.apply({ type: "CONTINUE" }, playerId, "player");
        this.afterChange(prev);
      } else {
        this.broadcast();
      }
      return;
    }

    const game = this.toGameAction(seat, action, receivedAt);
    if (!this.apply(game, playerId, "player")) {
      throw new AppError("illegal_action", `${action.type} is not allowed now`);
    }
    this.afterChange(prev);
  }

  private toGameAction(seat: PlayerId, a: ClientAction, receivedAt: number): GameAction {
    const bad = (msg: string) => new AppError("bad_request", msg);
    switch (a.type) {
      case "ANSWER": {
        if (a.value !== null && (typeof a.value !== "number" || !Number.isFinite(a.value))) throw bad("Bad answer");
        if (this.state.step.type !== "question" || this.answersAt === undefined) {
          throw new AppError("illegal_action", "No active question");
        }
        if (receivedAt < this.answersAt) throw new AppError("illegal_action", "Answers are not open yet");
        return { type: "ANSWER", player: seat, value: a.value, elapsedMs: Math.max(0, receivedAt - this.answersAt) };
      }
      case "BOOST":
        if (a.booster !== "fifty" && a.booster !== "range") throw bad("Bad booster");
        return { type: "BOOST", player: seat, booster: a.booster };
      case "PICK":
        if (typeof a.planet !== "string") throw bad("Bad planet");
        return { type: "PICK", player: seat, planet: a.planet };
      case "ATTACK":
        if (typeof a.target !== "string") throw bad("Bad target");
        return { type: "ATTACK", player: seat, target: a.target };
      case "WAGER":
        if (typeof a.amount !== "number" || !Number.isFinite(a.amount)) throw bad("Bad wager");
        return { type: "WAGER", player: seat, amount: a.amount };
      default:
        throw bad("Unknown action");
    }
  }

  /** Runs one game action; returns whether it was accepted (game-core returns the same state otherwise). */
  private apply(action: GameAction, playerId: string | null, source: EventSource): boolean {
    const next = dispatch(this.state, action, this.ctx);
    if (next === this.state) return false;
    this.state = next;
    this.actionSeq++;
    this.hooks.onAction(this, { seq: this.actionSeq, playerId, source, action });
    return true;
  }

  // -------------------------------------------------------------------------
  // Presence

  /** A player's connection changed: update flags, maybe close the reveal, reschedule, rebroadcast. */
  presenceChanged(): void {
    if (!this.started || this.done) return;
    this.refreshPresence();
    if (this.finished) {
      this.broadcast();
      return;
    }
    const prev = this.state;
    if (this.state.step.type === "reveal" && this.everyoneContinued()) {
      this.apply({ type: "CONTINUE" }, null, "auto");
      this.afterChange(prev);
      return;
    }
    this.schedule();
    this.broadcast();
  }

  /**
   * Re-reads who is connected. With nobody online the match pauses; when someone comes back every
   * running clock (answers, deadline, reveal, turn) is pushed back by the length of the pause.
   */
  private refreshPresence(): void {
    const now = this.clock.now();
    for (const s of this.seats) {
      if (this.isConnected(s.playerId)) this.offlineSince.delete(s.seat);
      else if (!this.offlineSince.has(s.seat)) this.offlineSince.set(s.seat, now);
    }
    const anyoneOnline = this.offlineSince.size < this.seats.length;
    if (!anyoneOnline && this.pausedAt === undefined) {
      this.pausedAt = now;
    } else if (anyoneOnline && this.pausedAt !== undefined) {
      const shift = now - this.pausedAt;
      this.pausedAt = undefined;
      const later = (t: number | undefined) => (t === undefined ? undefined : t + shift);
      this.answersAt = later(this.answersAt);
      this.deadline = later(this.deadline);
      this.revealUntil = later(this.revealUntil);
      this.turnUntil = later(this.turnUntil);
      this.stepStartedAt += shift;
      for (const [seat, since] of this.offlineSince) this.offlineSince.set(seat, since + shift);
    }
  }

  /** Whether the match is paused because every player is offline. */
  get paused(): boolean {
    return this.pausedAt !== undefined;
  }

  private online(seat: PlayerId): boolean {
    return !this.offlineSince.has(seat);
  }

  /** Every connected player still in the match pressed "continue" (and at least one is connected). */
  private everyoneContinued(): boolean {
    const required = activePlayers(this.state).filter((p) => this.online(p));
    return required.length > 0 && required.every((p) => this.continued.has(p));
  }

  // -------------------------------------------------------------------------
  // State changes and timing

  /** After the state changed: update timing, schedule the timer, broadcast, finish if done. */
  private afterChange(prev: MatchState | undefined): void {
    const now = this.clock.now();
    const s = this.state;
    const step = s.step;
    const prevStep = prev?.step;

    if (step.type === "question") {
      const serial = s.usedQuestionIds.length;
      if (serial !== this.questionSerial || prevStep?.type !== "question") {
        this.questionSerial = serial;
        this.answersAt = now + Math.max(0, this.timing.readingMs(step.q.question.text));
        this.deadline = this.answersAt + step.q.timeLimitMs;
      }
    } else {
      this.answersAt = this.deadline = undefined;
    }

    if (step.type === "reveal") {
      if (prevStep?.type !== "reveal" || prevStep.reveal !== step.reveal) {
        this.revealUntil = now + this.timing.revealAutoContinue;
        this.stepStartedAt = now;
        this.continued.clear();
      }
    } else {
      this.revealUntil = undefined;
      this.continued.clear();
    }

    // Each pick and the attack get a fresh turn clock; the wager clock runs from the start of the wager step.
    if (step.type === "pick" || step.type === "attack" || (step.type === "wager" && prevStep?.type !== "wager")) {
      this.turnUntil = now + this.timing.turnTimeout;
      this.stepStartedAt = now;
    } else if (step.type !== "wager") {
      this.turnUntil = undefined;
    }

    if (step.type === "finished") {
      this.clearTimer();
      this.broadcast();
      if (!this.done) {
        this.done = true;
        this.hooks.onFinished(this);
      }
      return;
    }
    this.schedule();
    this.broadcast();
  }

  /** When an offline seat gets moved for: soon after it went offline / the step began, never later than the normal timeout. */
  private offlineAt(seat: PlayerId, from: number, normal: number): number {
    const since = this.offlineSince.get(seat) ?? from;
    return Math.min(normal, Math.max(from, since) + this.timing.offlineMoveDelay);
  }

  /** Moves the server owes, with the time each becomes due. */
  private pending(): Due[] {
    const step = this.state.step;
    switch (step.type) {
      case "question": {
        const hard = this.deadline! + this.timing.answerGrace;
        const silent = step.q.participants.filter((p) => !step.q.answers[p]);
        // Offline players are answered for early only once everyone online has answered.
        const onlyOfflineLeft = silent.every((p) => !this.online(p));
        return silent.map((p) => ({
          seat: p,
          at: !this.online(p) && onlyOfflineLeft ? this.offlineAt(p, this.answersAt!, hard) : hard,
        }));
      }
      case "reveal": {
        const anyoneOnline = activePlayers(this.state).some((p) => this.online(p));
        const at = anyoneOnline
          ? this.revealUntil!
          : Math.min(this.revealUntil!, this.stepStartedAt + this.timing.offlineMoveDelay);
        return [{ seat: null, at }];
      }
      case "pick":
      case "attack": {
        const seat = step.type === "pick" ? step.queue[0] : step.player;
        if (!seat) return [];
        const at = this.online(seat) ? this.turnUntil! : this.offlineAt(seat, this.stepStartedAt, this.turnUntil!);
        return [{ seat, at }];
      }
      case "wager":
        return activePlayers(this.state)
          .filter((p) => step.bets[p] === undefined)
          .map((p) => ({
            seat: p,
            at: this.online(p) ? this.turnUntil! : this.offlineAt(p, this.stepStartedAt, this.turnUntil!),
          }));
      default:
        return [];
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.clearTimer();
    if (this.done) return;
    if (this.pausedAt !== undefined) {
      const at = this.pausedAt + this.timing.abandonAfter;
      this.timer = this.clock.setTimeout(() => this.abandon(), Math.max(0, at - this.clock.now()));
      return;
    }
    const due = this.pending();
    if (!due.length) return;
    const at = Math.min(...due.map((d) => d.at));
    this.timer = this.clock.setTimeout(() => this.tick(), Math.max(0, at - this.clock.now()));
  }

  private abandon(): void {
    this.timer = null;
    if (this.done || this.pausedAt === undefined) return;
    this.done = true;
    this.abandoned = true;
    this.hooks.onAbandoned(this);
  }

  /** Timer fired: make every move that is due, then commit once. */
  private tick(): void {
    this.timer = null;
    if (this.done) return;
    const now = this.clock.now();
    const prev = this.state;
    const due = this.pending().filter((d) => d.at <= now);
    for (const d of due) {
      const action = this.autoMove(d.seat);
      if (action) this.apply(action, d.seat ? this.playerOf(d.seat) : null, d.seat ? "timeout" : "auto");
    }
    if (this.state !== prev) this.afterChange(prev);
    else this.schedule();
  }

  /** The move the server makes for an idle seat (or CONTINUE for the reveal), on the current state. */
  private autoMove(seat: PlayerId | null): GameAction | undefined {
    const s = this.state;
    const step = s.step;
    const rng = this.botCtx.rng;
    if (step.type === "reveal") return { type: "CONTINUE" };
    if (!seat) return undefined;
    switch (step.type) {
      case "question":
        if (step.q.answers[seat]) return undefined;
        return { type: "ANSWER", player: seat, value: null, elapsedMs: step.q.timeLimitMs };
      case "pick": {
        if (step.queue[0] !== seat) return undefined;
        const planet = botChoosePick(s, seat, AUTO_LEVEL, rng) ?? getLegalPicks(s, seat)[0];
        return planet ? { type: "PICK", player: seat, planet } : undefined;
      }
      case "attack": {
        if (step.player !== seat) return undefined;
        const target = botChooseAttack(s, seat, AUTO_LEVEL, rng) ?? getLegalAttackTargets(s, seat)[0];
        return target ? { type: "ATTACK", player: seat, target } : undefined;
      }
      case "wager":
        if (step.bets[seat] !== undefined) return undefined;
        return { type: "WAGER", player: seat, amount: botWager(s, seat, AUTO_LEVEL, rng) };
      default:
        return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Snapshots

  private broadcast(): void {
    this.seq++;
    this.hooks.onChange(this);
  }

  timingNow(): MatchTiming {
    return {
      serverNow: this.clock.now(),
      answersAt: this.answersAt,
      deadline: this.deadline,
      revealUntil: this.revealUntil,
      turnUntil: this.turnUntil,
    };
  }

  /** Snapshot for one player (or a spectator if `playerId` has no seat). */
  snapshotFor(playerId: string | undefined): MatchSnapshot {
    const mySeat = playerId ? this.seatOf(playerId) : undefined;
    return {
      matchId: this.id,
      roomCode: this.roomCode,
      seq: this.seq,
      state: publicState(this.state, mySeat),
      mySeat,
      seats: this.seats.map((s) => ({ ...s, connected: this.online(s.seat) })),
      continued: [...this.continued],
      timing: this.timingNow(),
    };
  }
}

/**
 * The state as one seat may see it. Questions are already PublicQuestion, but during an active
 * question three things would still leak, so they are masked:
 * - `choiceOrder` (display → original index): content mostly stores the correct choice first,
 *   so the order would give the answer away. Dropped.
 * - other players' answers: only the fact that they answered is kept (`value: null, elapsedMs: 0`).
 * - other players' booster aids (50/50 hides two wrong choices). Only the own aid is kept.
 * During the wager step other players' bets show as 0 (placed / not placed stays visible).
 */
export function publicState(state: MatchState, seat: PlayerId | undefined): MatchState {
  const step = state.step;
  if (step.type === "question") {
    const { choiceOrder: _hidden, ...q } = step.q;
    const answers: typeof q.answers = {};
    for (const p of Object.keys(q.answers) as PlayerId[]) {
      answers[p] = p === seat ? q.answers[p] : { value: null, elapsedMs: 0 };
    }
    const own = seat ? q.aids[seat] : undefined;
    const aids: typeof q.aids = seat && own ? { [seat]: own } : {};
    return { ...state, step: { type: "question", q: { ...q, answers, aids } } };
  }
  if (step.type === "wager") {
    const bets: typeof step.bets = {};
    for (const p of Object.keys(step.bets) as PlayerId[]) bets[p] = p === seat ? step.bets[p] : 0;
    return { ...state, step: { ...step, bets } };
  }
  return state;
}
