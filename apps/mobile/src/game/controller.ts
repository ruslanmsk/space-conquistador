import type { BoosterType, MatchState, PlayerId } from "@space-conquistador/game-core";

/**
 * What the match screen needs, whoever runs the match: the local bot store or the online server.
 * Times are local `Date.now()` values.
 */
export type MatchController = {
  state: MatchState;
  /** Seat of the local player. */
  me: PlayerId;
  /** Changes with every new question (remounts the question stage). */
  questionKey: number;
  questionShownAt: number;
  /** When the current question's answers show and its clock starts. */
  answersAt: number;
  answer: (value: number | null) => void;
  boost: (booster: BoosterType) => void;
  pick: (planet: string) => void;
  attack: (planet: string) => void;
  wager: (amount: number) => void;
  next: () => void;
  /** Online only. */
  online?: {
    connected: boolean;
    /** Seats that pressed "Дальше" on the current reveal. */
    continued: PlayerId[];
    /** Pick / attack / wager: when the server moves for an idle player. */
    turnUntil: number | null;
    /** Seats whose players are offline right now. */
    offline: PlayerId[];
  };
};
