export type PlayerId = "human" | "bot";

export const PLAYERS: readonly PlayerId[] = ["human", "bot"];

export type BotLevel = "easy" | "normal" | "hard";

export type QuestionType = "mcq" | "numeric";

/** Full question as stored in content. Never hand this to UI while a question is active. */
export type QuestionRecord = {
  id: string;
  type: QuestionType;
  text: string;
  category: string;
  difficulty: 1 | 2 | 3;
  choices?: string[];
  correctIndex?: number;
  correctValue?: number;
  tolerance?: number;
  /** Optional unit shown next to numeric input, e.g. "км" or "год". */
  unit?: string;
};

/** What UI may see during an active question: no answer fields, choices already shuffled. */
export type PublicQuestion = {
  id: string;
  type: QuestionType;
  text: string;
  category: string;
  difficulty: 1 | 2 | 3;
  choices?: string[];
  unit?: string;
};

export type PlanetId = string;

export type Planet = {
  id: PlanetId;
  name: string;
  /** Map coordinates in the map's viewBox units. */
  x: number;
  y: number;
  /** Starting capital of this player. */
  capitalOf?: PlayerId;
  neighbors: PlanetId[];
};

export type StarMap = {
  id: string;
  name: string;
  width: number;
  height: number;
  planets: Planet[];
};

export type Owner = PlayerId | null;

export type MatchConfig = {
  /** Total attack turns in the battle phase (shared, alternating). */
  battleTurns: number;
  mcqTimeMs: number;
  numericTimeMs: number;
  botLevel: BotLevel;
  capitalShields: number;
  /** Probability that an expansion question is numeric ("closest wins"). */
  expansionNumericShare: number;
};

export type QuestionKind = "expansion" | "battle" | "tiebreak";

/** `value === null` means the player did not answer in time. */
export type Answer = { value: number | null; elapsedMs: number };

export type ActiveQuestion = {
  kind: QuestionKind;
  question: PublicQuestion;
  /** displayed choice index -> original index in QuestionRecord.choices */
  choiceOrder?: number[];
  participants: PlayerId[];
  answers: Partial<Record<PlayerId, Answer>>;
  timeLimitMs: number;
};

export type BattleInfo = { attacker: PlayerId; defender: PlayerId; target: PlanetId };

export type RevealAnswer = Answer & { correct: boolean; distance?: number };

export type RevealOutcome =
  | { type: "expansion"; picks: Record<PlayerId, number> }
  | { type: "tiebreak-needed" }
  | { type: "captured"; battle: BattleInfo }
  | { type: "shield-down"; battle: BattleInfo; shieldsLeft: number }
  | { type: "capital-fell"; battle: BattleInfo }
  | { type: "defended"; battle: BattleInfo };

export type Reveal = {
  kind: QuestionKind;
  question: PublicQuestion;
  /** Correct choice in displayed order (mcq). */
  correctIndex?: number;
  correctValue?: number;
  answers: Partial<Record<PlayerId, RevealAnswer>>;
  /** Who won the question, null if nobody. */
  winner: PlayerId | null;
  outcome: RevealOutcome;
};

export type AfterReveal =
  | { type: "expansion-question" }
  | { type: "pick"; queue: PlayerId[] }
  | { type: "tiebreak" }
  | { type: "next-battle-turn" }
  | { type: "finished" };

export type Step =
  | { type: "question"; q: ActiveQuestion }
  | { type: "reveal"; reveal: Reveal; next: AfterReveal }
  | { type: "pick"; queue: PlayerId[] }
  | { type: "attack"; player: PlayerId }
  | { type: "finished" };

export type GamePhase = "expansion" | "battle" | "finished";

export type MatchState = {
  version: 2;
  map: StarMap;
  config: MatchConfig;
  phase: GamePhase;
  /** Expansion: question number. Battle: 1-based attack turn. */
  round: number;
  owners: Record<PlanetId, Owner>;
  planetValue: Record<PlanetId, number>;
  shields: Record<PlayerId, number>;
  bonus: Record<PlayerId, number>;
  battle: BattleInfo | null;
  /** Who attacks on the next battle turn. */
  nextAttacker: PlayerId;
  step: Step;
  usedQuestionIds: string[];
  winner: PlayerId | "draw" | null;
  endReason: "score" | "capital" | null;
};

export type GameAction =
  | { type: "ANSWER"; player: PlayerId; value: number | null; elapsedMs: number }
  | { type: "CONTINUE" }
  | { type: "PICK"; player: PlayerId; planet: PlanetId }
  | { type: "ATTACK"; player: PlayerId; target: PlanetId };

export type Rng = () => number;

export type GameContext = {
  questions: QuestionRecord[];
  rng: Rng;
};
