import {
  botAnswer,
  botChooseAttack,
  botChoosePick,
  createMatch,
  dispatch,
  restartQuestion,
  type Answer,
  type BotLevel,
  type GameAction,
  type GameContext,
  type MatchState,
} from "@space-conquistador/game-core";
import { create } from "zustand";
import { RU_QUESTIONS } from "../data/questions";
import { loadMatchState, saveMatchState } from "../storage/matchPersist";
import { recordResult } from "../storage/settings";

const ctx: GameContext = { questions: RU_QUESTIONS, rng: Math.random };

const BOT_PICK_DELAY_MS = 900;
const BOT_ATTACK_DELAY_MS = 1400;
/** Once the human has answered, the bot "finishes thinking" quickly so nobody waits long. */
const BOT_HURRY_MS = 700;

type Store = {
  match: MatchState | null;
  /** Date.now() when the current question appeared on screen. */
  questionStartedAt: number;
  /** usedQuestionIds.length of the current question; changes for every new question. */
  questionSerial: number;
  newMatch: (level: BotLevel) => void;
  answer: (value: number | null) => void;
  pick: (planet: string) => void;
  attack: (planet: string) => void;
  next: () => void;
  abandon: () => void;
  /** Restores a saved match; returns true if there is one. */
  restore: () => Promise<boolean>;
};

let botTimer: ReturnType<typeof setTimeout> | null = null;
let botPlan: { serial: number; answer: Answer } | null = null;

export const useMatchStore = create<Store>((set, get) => {
  function commit(next: MatchState) {
    const prev = get().match;
    const serial = next.usedQuestionIds.length;
    const newQuestion = next.step.type === "question" && serial !== get().questionSerial;
    set({
      match: next,
      ...(newQuestion ? { questionStartedAt: Date.now(), questionSerial: serial } : {}),
    });
    void saveMatchState(next);
    if (next.phase === "finished" && prev?.phase !== "finished") {
      void recordResult(next.winner === "human" ? "win" : next.winner === "bot" ? "loss" : "draw");
    }
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
    const { match, questionStartedAt, questionSerial } = get();
    if (!match) return;
    const step = match.step;
    const run = (delay: number, action: () => GameAction | undefined) => {
      botTimer = setTimeout(() => {
        if (get().match !== match) return;
        const a = action();
        if (a) act(a);
      }, Math.max(0, delay));
    };

    if (step.type === "question" && step.q.participants.includes("bot") && !step.q.answers.bot) {
      if (botPlan?.serial !== questionSerial) {
        botPlan = { serial: questionSerial, answer: botAnswer(match, ctx, match.config.botLevel) };
      }
      const plan = botPlan.answer;
      let delay = plan.elapsedMs - (Date.now() - questionStartedAt);
      if (step.q.answers.human) delay = Math.min(delay, BOT_HURRY_MS);
      run(delay, () => ({ type: "ANSWER", player: "bot", value: plan.value, elapsedMs: plan.elapsedMs }));
    } else if (step.type === "pick" && step.queue[0] === "bot") {
      run(BOT_PICK_DELAY_MS, () => {
        const planet = botChoosePick(match, "bot", match.config.botLevel, ctx.rng);
        return planet ? { type: "PICK", player: "bot", planet } : undefined;
      });
    } else if (step.type === "attack" && step.player === "bot") {
      run(BOT_ATTACK_DELAY_MS, () => {
        const target = botChooseAttack(match, "bot", match.config.botLevel, ctx.rng);
        return target ? { type: "ATTACK", player: "bot", target } : undefined;
      });
    }
  }

  return {
    match: null,
    questionStartedAt: 0,
    questionSerial: -1,

    newMatch: (level) => {
      botPlan = null;
      set({ questionSerial: -1 });
      commit(createMatch(ctx, { botLevel: level }));
    },

    answer: (value) => {
      const { match, questionStartedAt } = get();
      if (match?.step.type !== "question") return;
      act({ type: "ANSWER", player: "human", value, elapsedMs: Date.now() - questionStartedAt });
    },

    pick: (planet) => act({ type: "PICK", player: "human", planet }),
    attack: (target) => act({ type: "ATTACK", player: "human", target }),
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
