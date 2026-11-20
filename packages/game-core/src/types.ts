/** Seat ids. A match uses the first N of them (2–4), in this order. */
export type PlayerId = "p1" | "p2" | "p3" | "p4";

export const SEAT_IDS: readonly PlayerId[] = ["p1", "p2", "p3", "p4"];

/** Per-player record that only holds the seats taking part in the match. */
export type PerPlayer<T> = Partial<Record<PlayerId, T>>;

export type BotLevel = "easy" | "normal" | "hard";

export type QuestionType = "mcq" | "numeric";

/** Fixed question categories. Space is only the visual theme of the game. */
export const CATEGORIES = [
  "История",
  "География",
  "Наука",
  "Природа",
  "Космос",
  "Искусство",
  "Литература",
  "Кино и ТВ",
  "Музыка",
  "Спорт",
  "Язык",
  "Технологии",
  "Еда",
  "Разное",
] as const;

export type Category = (typeof CATEGORIES)[number] | (string & {});

/** Full question as stored in content. Never hand this to UI while a question is active. */
export type QuestionRecord = {
  id: string;
  type: QuestionType;
  text: string;
  category: Category;
  difficulty: 1 | 2 | 3;
  choices?: string[];
  correctIndex?: number;
  correctValue?: number;
  tolerance?: number;
  /** Optional unit shown next to numeric input, e.g. "км" or "год". */
  unit?: string;
  /** Short tidbit shown after the answer. */
  fact?: string;
  /** Where the question came from: absent = hand-written core, else "wikidata" / "quiz-sites" / "chgk". */
  source?: string;
};

/** What UI may see during an active question: no answer fields, choices already shuffled. */
export type PublicQuestion = {
  id: string;
  type: QuestionType;
  text: string;
  category: Category;
  difficulty: 1 | 2 | 3;
  choices?: string[];
  unit?: string;
};

export type PlanetId = string;

/**
 * - `capital`  — home world with shields
 * - `world`    — ordinary planet
 * - `giant`    — gas giant: worth more points
 * - `outpost`  — small body that grants a booster to whoever takes it
 */
export type PlanetKind = "capital" | "world" | "giant" | "outpost";

export type Planet = {
  id: PlanetId;
  name: string;
  kind: PlanetKind;
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

/** A bot opponent with a personality: level plus categories it is good or bad at. */
export type Opponent = {
  id: string;
  name: string;
  /** Short flavour line shown before the match. */
  title: string;
  level: BotLevel;
  strong: Category[];
  weak: Category[];
};

export type SeatKind = "human" | "bot";

/** Who sits in a seat. Bot seats carry their opponent profile (level, strong/weak categories). */
export type Seat = {
  id: PlayerId;
  kind: SeatKind;
  name: string;
  opponent?: Opponent;
};

export type MatchConfig = {
  /** Total attack turns in the battle phase (shared, round-robin). Default: 4 per player. */
  battleTurns: number;
  mcqTimeMs: number;
  numericTimeMs: number;
  /** 2–4 seats; their ids are exactly p1..pN. */
  seats: Seat[];
  capitalShields: number;
  /** Probability that an expansion question is numeric ("closest wins"). */
  expansionNumericShare: number;
  /** Max share of own score a player may bet in the final question. */
  finaleMaxShare: number;
  /** Correct answers in a row that earn a booster. */
  streakForBooster: number;
};

export type BoosterType = "fifty" | "range";
export type Boosters = Record<BoosterType, number>;

export type QuestionKind = "expansion" | "battle" | "tiebreak" | "finale";

/** `value === null` means the player did not answer in time. */
export type Answer = { value: number | null; elapsedMs: number };

/** Help a player got for the active question from a booster. */
export type QuestionAid = {
  /** Displayed choice indexes removed by 50/50. */
  hidden?: number[];
  /** Numeric bracket that contains the answer. */
  range?: [number, number];
};

export type ActiveQuestion = {
  kind: QuestionKind;
  question: PublicQuestion;
  /** displayed choice index -> original index in QuestionRecord.choices */
  choiceOrder?: number[];
  participants: PlayerId[];
  answers: Partial<Record<PlayerId, Answer>>;
  aids: Partial<Record<PlayerId, QuestionAid>>;
  timeLimitMs: number;
};

export type BattleInfo = {
  attacker: PlayerId;
  defender: PlayerId;
  target: PlanetId;
  category?: Category;
};

export type RevealAnswer = Answer & { correct: boolean; distance?: number };

export type RevealOutcome =
  /** Picks per player in the match (0 for those who got none). */
  | { type: "expansion"; picks: PerPlayer<number> }
  | { type: "tiebreak-needed" }
  | { type: "captured"; battle: BattleInfo }
  | { type: "shield-down"; battle: BattleInfo; shieldsLeft: number }
  /** The defender is out. `final` = the match ends (one player left). */
  | { type: "capital-fell"; battle: BattleInfo; final: boolean }
  | { type: "defended"; battle: BattleInfo }
  | { type: "finale"; bets: PerPlayer<number>; deltas: PerPlayer<number> };

/** Something extra a player earned on this question. */
export type RevealReward = { player: PlayerId; booster: BoosterType; reason: "streak" | "outpost" };

export type Reveal = {
  kind: QuestionKind;
  question: PublicQuestion;
  /** Correct choice in displayed order (mcq). */
  correctIndex?: number;
  correctValue?: number;
  fact?: string;
  answers: Partial<Record<PlayerId, RevealAnswer>>;
  /** Who won the question, null if nobody. */
  winner: PlayerId | null;
  outcome: RevealOutcome;
  rewards: RevealReward[];
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
  | { type: "wager"; category: Category; bets: Partial<Record<PlayerId, number>> }
  | { type: "finished" };

export type GamePhase = "expansion" | "battle" | "finale" | "finished";

/** Running per-player numbers used for the end screen. */
export type PlayerTally = {
  answered: number;
  correct: number;
  /** Sum of response times of correct answers. */
  correctMs: number;
  bestStreak: number;
  captured: number;
  defended: number;
};

/** Event log entry for the end-of-match timeline. */
export type MatchEvent =
  | { type: "picked"; player: PlayerId; planet: PlanetId }
  | { type: "captured"; player: PlayerId; planet: PlanetId }
  | { type: "defended"; player: PlayerId; planet: PlanetId }
  | { type: "shield-down"; player: PlayerId; shieldsLeft: number }
  | { type: "capital-fell"; player: PlayerId; loser: PlayerId }
  | { type: "booster"; player: PlayerId; booster: BoosterType }
  | { type: "finale"; player: PlayerId; delta: number };

export type MatchState = {
  version: 5;
  map: StarMap;
  config: MatchConfig;
  /** Seats in the match, in seat order (p1..pN). */
  players: PlayerId[];
  /** Players whose capital fell (3–4 player matches), in the order they dropped out. */
  eliminated: PlayerId[];
  phase: GamePhase;
  /** Expansion: question number. Battle: 1-based attack turn. */
  round: number;
  owners: Record<PlanetId, Owner>;
  /** Question category of each planet (null for capitals: their questions are mixed). */
  sectors: Record<PlanetId, Category | null>;
  planetValue: Record<PlanetId, number>;
  shields: PerPlayer<number>;
  bonus: PerPlayer<number>;
  boosters: PerPlayer<Boosters>;
  streak: PerPlayer<number>;
  tally: PerPlayer<PlayerTally>;
  events: MatchEvent[];
  battle: BattleInfo | null;
  /** Bets placed for the final question, once all are in. */
  finaleBets: PerPlayer<number> | null;
  /** Whose turn comes next in the battle rotation (seat order, skipping the eliminated). */
  nextAttacker: PlayerId;
  step: Step;
  usedQuestionIds: string[];
  /** Winner: last player standing, or the top score after the finale ("draw" if it is shared). */
  winner: PlayerId | "draw" | null;
  endReason: "score" | "capital" | null;
};

export type GameAction =
  | { type: "ANSWER"; player: PlayerId; value: number | null; elapsedMs: number }
  | { type: "BOOST"; player: PlayerId; booster: BoosterType }
  | { type: "CONTINUE" }
  | { type: "PICK"; player: PlayerId; planet: PlanetId }
  | { type: "ATTACK"; player: PlayerId; target: PlanetId }
  | { type: "WAGER"; player: PlayerId; amount: number };

export type Rng = () => number;

export type GameContext = {
  questions: QuestionRecord[];
  rng: Rng;
};
