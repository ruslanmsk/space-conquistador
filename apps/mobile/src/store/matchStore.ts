import {
  botAnswer,
  botChooseAttack,
  botChoosePick,
  botWager,
  botWantsBooster,
  createMatch,
  dispatch,
  restartQuestion,
  type Answer,
  type BoosterType,
  type GameAction,
  type GameContext,
  type MatchState,
  type Opponent,
} from "@space-conquistador/game-core";
import { create } from "zustand";
import { RU_QUESTIONS } from "../data/questions";
import { loadMatchState, saveMatchState } from "../storage/matchPersist";
import { recordAnswer, recordMatch } from "../storage/progress";

const ctx: GameContext = { questions: RU_QUESTIONS, rng: Math.random };

const BOT_PICK_DELAY_MS = 900;
const BOT_ATTACK_DELAY_MS = 1500;
const BOT_WAGER_DELAY_MS = 1400;
/** Once the human has answered, the bot "finishes thinking" quickly so nobody waits long. */
const BOT_HURRY_MS = 700;

/**
 * Reading beat: the question shows alone before the answers appear and the clock starts,
 * so the race is about knowledge, not reading speed.
 */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1200, Math.min(3000, words * 150));
}

type Store = {
  match: MatchState | null;
  /** Date.now() when the current question's answers appear and its clock starts. */
  answersAt: number;
  /** Date.now() when the question text appeared. */
  questionShownAt: number;
  /** usedQuestionIds.length of the current question; changes for every new question. */
  questionSerial: number;
  newMatch: (opponent: Opponent) => void;
  answer: (value: number | null) => void;
  boost: (booster: BoosterType) => void;
  pick: (planet: string) => void;
  attack: (planet: string) => void;
  wager: (amount: number) => void;
  next: () => void;
  abandon: () => void;
  /** Restores a saved match; returns true if there is one. */
  restore: () => Promise<boolean>;
};

let botTimer: ReturnType<typeof setTimeout> | null = null;
let botPlan: { serial: number; answer: Answer; boost: BoosterType | null; boosted: boolean } | null = null;

export const useMatchStore = create<Store>((set, get) => {
  function commit(next: MatchState) {
    const prev = get().match;
    const serial = next.usedQuestionIds.length;
    const newQuestion = next.step.type === "question" && serial !== get().questionSerial;
    if (newQuestion && next.step.type === "question") {
      const now = Date.now();
      set({ questionShownAt: now, answersAt: now + readingMs(next.step.q.question.text), questionSerial: serial });
    }
    set({ match: next });
    void saveMatchState(next);

    // Learn the player's strengths per category from every question they took part in.
    if (next.step.type === "reveal" && prev?.step.type === "question") {
      const r = next.step.reveal;
      const mine = r.answers.human;
      if (mine) void recordAnswer(r.question.category, mine.correct);
    }
    if (next.phase === "finished" && prev?.phase !== "finished") void recordMatch(next);
    scheduleBot();
  }

  function act(action: GameAction) {
    const m = get().match;
    if (!m) return;
    const next = dispatch(m, action, ctx);
    if (next !== m) commit(next);
  }

  function scheduleBot() {
    if (botTimer) clearTimeout(botTimer);
    botTimer = null;
    const { match, answersAt, questionSerial } = get();
    if (!match) return;
    const step = match.step;
    const level = match.config.botLevel;
    const run = (delay: number, action: () => GameAction | undefined) => {
      botTimer = setTimeout(() => {
        if (get().match !== match) return;
        const a = action();
        if (a) act(a);
      }, Math.max(0, delay));
    };

    if (step.type === "question" && step.q.participants.includes("bot") && !step.q.answers.bot) {
      if (botPlan?.serial !== questionSerial) {
        const boost = botWantsBooster(match, ctx, level);
        botPlan = { serial: questionSerial, answer: { value: null, elapsedMs: 0 }, boost, boosted: false };
        if (!boost) botPlan.answer = botAnswer(match, ctx, level);
      }
      const plan = botPlan;
      const sinceStart = Date.now() - answersAt;
      if (plan.boost && !plan.boosted) {
        // Spend the booster a moment after the answers show, then think with its help.
        run(1000 - sinceStart, () => {
          plan.boosted = true;
          return { type: "BOOST", player: "bot", booster: plan.boost! };
        });
        return;
      }
      if (plan.boost && plan.answer.elapsedMs === 0) plan.answer = botAnswer(match, ctx, level);
      let delay = plan.answer.elapsedMs - sinceStart;
      if (step.q.answers.human) delay = Math.min(delay, BOT_HURRY_MS);
      run(delay, () => ({ type: "ANSWER", player: "bot", value: plan.answer.value, elapsedMs: plan.answer.elapsedMs }));
    } else if (step.type === "pick" && step.queue[0] === "bot") {
      run(BOT_PICK_DELAY_MS, () => {
        const planet = botChoosePick(match, "bot", level, ctx.rng);
        return planet ? { type: "PICK", player: "bot", planet } : undefined;
      });
    } else if (step.type === "attack" && step.player === "bot") {
      run(BOT_ATTACK_DELAY_MS, () => {
        const target = botChooseAttack(match, "bot", level, ctx.rng);
        return target ? { type: "ATTACK", player: "bot", target } : undefined;
      });
    } else if (step.type === "wager" && step.bets.bot === undefined) {
      run(BOT_WAGER_DELAY_MS, () => ({ type: "WAGER", player: "bot", amount: botWager(match, "bot", level, ctx.rng) }));
    }
  }

  return {
    match: null,
    answersAt: 0,
    questionShownAt: 0,
    questionSerial: -1,

    newMatch: (opponent) => {
      botPlan = null;
      set({ questionSerial: -1 });
      commit(createMatch(ctx, { opponent }));
    },

    answer: (value) => {
      const { match, answersAt } = get();
      if (match?.step.type !== "question") return;
      act({ type: "ANSWER", player: "human", value, elapsedMs: Math.max(0, Date.now() - answersAt) });
    },

    boost: (booster) => act({ type: "BOOST", player: "human", booster }),
    pick: (planet) => act({ type: "PICK", player: "human", planet }),
    attack: (target) => act({ type: "ATTACK", player: "human", target }),
    wager: (amount) => act({ type: "WAGER", player: "human", amount }),
    next: () => act({ type: "CONTINUE" }),

    abandon: () => {
      if (botTimer) clearTimeout(botTimer);
      botTimer = null;
      botPlan = null;
      set({ match: null, questionSerial: -1 });
      void saveMatchState(null);
    },

    restore: async () => {
      if (get().match && get().match!.phase !== "finished") return true;
      const saved = await loadMatchState();
      if (!saved) return false;
      botPlan = null;
      set({ questionSerial: -1 });
      // A question in progress restarts from zero: the timer did not run while the app was closed.
      commit(restartQuestion(saved));
      return true;
    },
  };
});

// Dev-only handle for poking at the match from the browser console while testing.
if (__DEV__ && typeof globalThis !== "undefined") {
  (globalThis as unknown as { __sc: typeof useMatchStore }).__sc = useMatchStore;
}
