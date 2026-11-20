/**
 * Client ↔ server contract for online matches. Shared by apps/server and apps/mobile.
 *
 * Transport: HTTP (JSON) for guest identity and room creation, Socket.IO for everything live.
 * The server is authoritative: it alone holds the question answers and calls game-core `dispatch`.
 * Clients send intents (`ClientAction`); the server fills in the seat and the elapsed time.
 */
import type { BoosterType, MatchState, PlanetId, PlayerId } from "@space-conquistador/game-core";

export const PROTOCOL_VERSION = 1;

/** Room codes: 4 chars from an alphabet without look-alikes (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const NICKNAME_MAX = 16;

/** Server-side timing rules (ms). */
export const TIMING = {
  /** Extra time after a question deadline before the server answers "no answer" for silent players. */
  answerGrace: 1_500,
  /** A reveal closes when every connected player pressed "continue", or after this long. */
  revealAutoContinue: 8_000,
  /** Pick / attack / wager: if the player in turn does nothing (or is offline), the server plays a random legal move. */
  turnTimeout: 20_000,
  /** How long a disconnected player keeps their seat before being treated as permanently absent. */
  reconnectWindow: 120_000,
} as const;

// ---------------------------------------------------------------------------
// HTTP

/** POST /api/guest  { nickname } → GuestSession. Token goes into `Authorization: Bearer` and the socket auth. */
export type GuestRequest = { nickname: string };
export type PlayerProfile = { id: string; nickname: string };
export type GuestSession = { token: string; player: PlayerProfile };

/** GET /api/me → PlayerProfile.  PATCH /api/me { nickname } → PlayerProfile. */
export type UpdateMeRequest = { nickname: string };

/** POST /api/rooms { maxPlayers? } → RoomView (the creator joins as host). */
export type CreateRoomRequest = { maxPlayers?: number };

/** GET /api/rooms/:code → RoomView, 404 if unknown. */

export type ApiError = { error: ErrorCode; message: string };

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "room_full"
  | "room_started"
  | "not_host"
  | "not_enough_players"
  | "not_ready"
  | "not_in_match"
  | "illegal_action"
  | "version_mismatch"
  | "internal";

// ---------------------------------------------------------------------------
// Rooms

export type RoomStatus = "lobby" | "playing" | "finished";

export type RoomMember = {
  playerId: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
  /** Seat in the current match (assigned when the match starts, in join order). */
  seat?: PlayerId;
};

export type RoomView = {
  code: string;
  hostId: string;
  maxPlayers: number;
  status: RoomStatus;
  members: RoomMember[];
  /** Current or last match in this room. */
  matchId?: string;
};

// ---------------------------------------------------------------------------
// Match

/** Intents a client may send. The server adds `player` (its seat) and, for answers, `elapsedMs`. */
export type ClientAction =
  | { type: "ANSWER"; value: number | null }
  | { type: "BOOST"; booster: BoosterType }
  | { type: "PICK"; planet: PlanetId }
  | { type: "ATTACK"; target: PlanetId }
  | { type: "WAGER"; amount: number }
  | { type: "CONTINUE" };

export type MatchTiming = {
  /** Server clock when this snapshot was sent; clients use it to compute their clock offset. */
  serverNow: number;
  /** Active question: when answers appear and the clock starts (after the reading beat). */
  answersAt?: number;
  /** Active question: answers after this are "no answer". */
  deadline?: number;
  /** Reveal: when it auto-closes. */
  revealUntil?: number;
  /** Pick / attack / wager: when the server moves for an idle player. */
  turnUntil?: number;
};

/**
 * Full picture for one client. `state` is safe to share: questions in it are PublicQuestion (no answers)
 * and the correct answer only appears inside a reveal.
 *
 * The server personalises `state` per seat while a step is open:
 * - active question: `q.choiceOrder` is omitted; other seats' entries in `q.answers` are
 *   `{ value: null, elapsedMs: 0 }` (only *that* they answered is visible); `q.aids` holds only your own aid;
 * - wager step: other seats' entries in `bets` are 0 (only *that* they bet is visible).
 * Everything is revealed in the following reveal / `finaleBets`.
 */
export type MatchSnapshot = {
  matchId: string;
  roomCode: string;
  /** Increments with every state change; clients ignore older snapshots. */
  seq: number;
  state: MatchState;
  /** Seat of the receiving client (undefined for spectators). */
  mySeat?: PlayerId;
  seats: { seat: PlayerId; playerId: string; nickname: string; connected: boolean }[];
  /** Seats that already pressed "continue" on the current reveal. */
  continued: PlayerId[];
  timing: MatchTiming;
};

// ---------------------------------------------------------------------------
// Socket.IO events. Connect with `auth: { token, protocol: PROTOCOL_VERSION }`.

export type Ack<T = undefined> = (res: { ok: true; data: T } | { ok: false; error: ErrorCode; message: string }) => void;

export interface ClientToServerEvents {
  /** Join (or rejoin) a room; also subscribes to its live updates. */
  "room:join": (p: { code: string }, ack: Ack<RoomView>) => void;
  "room:leave": (p: { code: string }, ack: Ack) => void;
  "room:ready": (p: { code: string; ready: boolean }, ack: Ack<RoomView>) => void;
  /** Host only; needs MIN_PLAYERS..maxPlayers members, all ready. */
  "room:start": (p: { code: string }, ack: Ack<{ matchId: string }>) => void;
  /** Host only, after a match finished: back to the lobby for a rematch. */
  "room:reset": (p: { code: string }, ack: Ack<RoomView>) => void;
  "match:action": (p: { matchId: string; action: ClientAction }, ack: Ack) => void;
  /** Ask for the current snapshot (e.g. after reconnecting). */
  "match:sync": (p: { matchId: string }, ack: Ack<MatchSnapshot>) => void;
}

export interface ServerToClientEvents {
  "room:update": (room: RoomView) => void;
  "match:snapshot": (snap: MatchSnapshot) => void;
  "match:ended": (p: { matchId: string; ranking: PlayerId[]; winner: PlayerId | "draw" | null }) => void;
  "server:error": (e: ApiError) => void;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isValidNickname(nick: string): boolean {
  const n = nick.trim();
  return n.length >= 2 && n.length <= NICKNAME_MAX;
}
