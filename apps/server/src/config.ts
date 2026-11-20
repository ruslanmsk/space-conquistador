import { TIMING } from "@space-conquistador/protocol";
import { DEFAULT_DATABASE_URL } from "./db";

/** Timing rules of the match loop. Defaults follow the protocol; tests shorten them. */
export type MatchTimingConfig = {
  answerGrace: number;
  revealAutoContinue: number;
  turnTimeout: number;
  /** How soon the server moves for a seat whose player is offline. */
  offlineMoveDelay: number;
  /** With every player offline the match pauses; after this long it is abandoned (aborted). */
  abandonAfter: number;
  /** Reading beat before the answers of a question appear (same formula as the client). */
  readingMs: (text: string) => number;
  /** Question time limits passed to createMatch (undefined = game-core defaults). */
  mcqTimeMs?: number;
  numericTimeMs?: number;
};

/**
 * Reading beat: the question shows alone before the answers appear and the clock starts, so the
 * race is about knowledge, not reading speed. Mirrors `readingMs` in apps/mobile matchStore.
 */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1200, Math.min(3000, words * 150));
}

export const DEFAULT_MATCH_TIMING: MatchTimingConfig = {
  answerGrace: TIMING.answerGrace,
  revealAutoContinue: TIMING.revealAutoContinue,
  turnTimeout: TIMING.turnTimeout,
  offlineMoveDelay: 2_000,
  abandonAfter: TIMING.reconnectWindow,
  readingMs,
};

export type ServerConfig = {
  port: number;
  host: string;
  databaseUrl: string;
  /** Postgres schema to use (default: the database's search_path, i.e. public). */
  dbSchema?: string;
  /** `true` reflects any origin (dev); otherwise an allow-list. */
  corsOrigins: true | string[];
  timing: MatchTimingConfig;
  /** Directory with question JSON files (default: <repo>/content/questions). */
  questionsDir?: string;
  logger: boolean;
};

function num(v: string | undefined, fallback: number): number {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Reads the configuration from environment variables (see docs/MULTIPLAYER.md). */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === "production";
  const origins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    port: num(env.PORT, 3001),
    host: env.HOST ?? "0.0.0.0",
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    dbSchema: env.DB_SCHEMA || undefined,
    corsOrigins: origins.includes("*") || (!production && !origins.length) ? true : origins.length ? origins : ["http://localhost:8081"],
    timing: {
      ...DEFAULT_MATCH_TIMING,
      answerGrace: num(env.ANSWER_GRACE_MS, TIMING.answerGrace),
      revealAutoContinue: num(env.REVEAL_AUTO_CONTINUE_MS, TIMING.revealAutoContinue),
      turnTimeout: num(env.TURN_TIMEOUT_MS, TIMING.turnTimeout),
      offlineMoveDelay: num(env.OFFLINE_MOVE_DELAY_MS, DEFAULT_MATCH_TIMING.offlineMoveDelay),
      abandonAfter: num(env.ABANDON_AFTER_MS, DEFAULT_MATCH_TIMING.abandonAfter),
    },
    questionsDir: env.QUESTIONS_DIR || undefined,
    logger: env.LOG !== "0",
  };
}
