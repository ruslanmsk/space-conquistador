import { randomInt } from "node:crypto";
import type { PlayerId, QuestionRecord } from "@space-conquistador/game-core";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  type ClientAction,
  type MatchSnapshot,
  type PlayerProfile,
  type RoomMember,
  type RoomStatus,
  type RoomView,
  type ServerToClientEvents,
} from "@space-conquistador/protocol";
import { nanoid } from "nanoid";
import type { MatchTimingConfig } from "./config";
import type { Db } from "./db";
import { AppError } from "./errors";
import { MatchRepo } from "./matchRepo";
import { MatchRunner, type Clock, type SeatInfo } from "./matchRunner";

/** Delivers server events to specific sockets (implemented by the Socket.IO layer). */
export type Emitter = <E extends keyof ServerToClientEvents>(
  socketIds: Iterable<string>,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) => void;

/** Seat ids in order. (game-core's SEAT_IDS comes through `export *`, which tsx cannot see from ESM.) */
const SEAT_ORDER: readonly PlayerId[] = ["p1", "p2", "p3", "p4"];

type RoomRow = { code: string; host_id: string; max_players: number; status: RoomStatus; match_id: string | null };
type MemberRow = { player_id: string; nickname: string; ready: boolean; seat: PlayerId | null };

export type RoomServiceOptions = {
  db: Db;
  questions: QuestionRecord[];
  timing: MatchTimingConfig;
  emit: Emitter;
  log: (msg: string, err?: unknown) => void;
  clock?: Clock;
};

/**
 * Rooms (persisted) plus everything live about them: which sockets are subscribed (presence) and
 * the running matches. Room mutations run one at a time per room.
 */
export class RoomService {
  private readonly db: Db;
  readonly repo: MatchRepo;
  /** room code → player id → socket ids subscribed to the room. */
  private readonly presence = new Map<string, Map<string, Set<string>>>();
  /** Running and recently finished matches, by id. Lost on restart. */
  private readonly runners = new Map<string, MatchRunner>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private closed = false;

  constructor(private readonly opts: RoomServiceOptions) {
    this.db = opts.db;
    this.repo = new MatchRepo(opts.db, opts.log);
  }

  // -------------------------------------------------------------------------
  // Queries

  async view(rawCode: string): Promise<RoomView> {
    const code = normalizeRoomCode(String(rawCode ?? ""));
    const [room] = await this.db<RoomRow[]>`
      select code, host_id, max_players, status, match_id from rooms where code = ${code}`;
    if (!room) throw new AppError("not_found", "Room not found");
    const members = await this.db<MemberRow[]>`
      select m.player_id, p.nickname, m.ready, m.seat
      from room_members m join players p on p.id = m.player_id
      where m.room_code = ${code}
      order by m.joined_at, m.player_id`;
    return {
      code: room.code,
      hostId: room.host_id,
      maxPlayers: room.max_players,
      status: room.status,
      members: members.map(
        (m): RoomMember => ({
          playerId: m.player_id,
          nickname: m.nickname,
          // The host is always ready.
          ready: m.ready || m.player_id === room.host_id,
          connected: this.isConnected(code, m.player_id),
          ...(m.seat ? { seat: m.seat } : {}),
        }),
      ),
      ...(room.match_id ? { matchId: room.match_id } : {}),
    };
  }

  isConnected(code: string, playerId: string): boolean {
    return (this.presence.get(code)?.get(playerId)?.size ?? 0) > 0;
  }

  runner(matchId: string): MatchRunner {
    const r = this.runners.get(String(matchId ?? ""));
    if (!r) throw new AppError("not_found", "Match not found (it may have ended before a server restart)");
    return r;
  }

  // -------------------------------------------------------------------------
  // Room lifecycle

  /** Creates a room with the player as host and only member. */
  async create(host: PlayerProfile, maxPlayers: unknown = MIN_PLAYERS): Promise<RoomView> {
    const max = maxPlayers === undefined || maxPlayers === null ? MIN_PLAYERS : Number(maxPlayers);
    if (!Number.isInteger(max) || max < MIN_PLAYERS || max > MAX_PLAYERS) {
      throw new AppError("bad_request", `maxPlayers must be ${MIN_PLAYERS}–${MAX_PLAYERS}`);
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = randomCode();
      const created = await this.db.begin(async (tx) => {
        const rows = await tx`
          insert into rooms (code, host_id, max_players) values (${code}, ${host.id}, ${max})
          on conflict (code) do nothing returning code`;
        if (!rows.length) return false;
        await tx`insert into room_members (room_code, player_id) values (${code}, ${host.id})`;
        return true;
      });
      if (created) return this.view(code);
    }
    throw new AppError("internal", "Could not allocate a room code");
  }

  /** Joins (or rejoins) a room and subscribes the socket to its updates. */
  join(rawCode: string, player: PlayerProfile, socketId: string): Promise<RoomView> {
    const code = normalizeRoomCode(String(rawCode ?? ""));
    return this.locked(code, async () => {
      const room = await this.view(code);
      const member = room.members.some((m) => m.playerId === player.id);
      if (!member) {
        if (room.status === "playing") throw new AppError("room_started", "The match has already started");
        if (room.members.length >= room.maxPlayers) throw new AppError("room_full", "The room is full");
        await this.db.begin(async (tx) => {
          await tx`insert into room_members (room_code, player_id) values (${code}, ${player.id})`;
          // An empty room is adopted by whoever comes in first.
          if (!room.members.length) await tx`update rooms set host_id = ${player.id} where code = ${code}`;
        });
      }
      const wasConnected = this.isConnected(code, player.id);
      this.subscribe(code, player.id, socketId);
      const view = await this.view(code);
      this.emitRoom(view);
      if (!wasConnected) this.liveRunner(view)?.presenceChanged();
      else this.sendSnapshot(view, player.id, [socketId]);
      return view;
    });
  }

  /** Leaves a room. In the lobby (or after a match) the membership goes; during a match the seat stays and gets auto-played. */
  leave(rawCode: string, playerId: string): Promise<void> {
    const code = normalizeRoomCode(String(rawCode ?? ""));
    return this.locked(code, async () => {
      const room = await this.view(code);
      this.presence.get(code)?.delete(playerId);
      const member = room.members.some((m) => m.playerId === playerId);
      if (member && room.status !== "playing") {
        await this.db.begin(async (tx) => {
          await tx`delete from room_members where room_code = ${code} and player_id = ${playerId}`;
          if (room.hostId === playerId) {
            const next = room.members.find((m) => m.playerId !== playerId);
            if (next) await tx`update rooms set host_id = ${next.playerId} where code = ${code}`;
          }
        });
      }
      const view = await this.view(code);
      this.emitRoom(view);
      this.liveRunner(view)?.presenceChanged();
    });
  }

  setReady(rawCode: string, playerId: string, ready: boolean): Promise<RoomView> {
    const code = normalizeRoomCode(String(rawCode ?? ""));
    return this.locked(code, async () => {
      const room = await this.view(code);
      if (room.status !== "lobby") throw new AppError("room_started", "The room is not in the lobby");
      this.requireMember(room, playerId);
      await this.db`update room_members set ready = ${!!ready} where room_code = ${code} and player_id = ${playerId}`;
      const view = await this.view(code);
      this.emitRoom(view);
      return view;
    });
  }

  /** Host only: seats members p1..pN in join order and starts the match. */
  start(rawCode: string, playerId: string): Promise<{ matchId: string }> {
    const code = normalizeRoomCode(String(rawCode ?? ""));
    return this.locked(code, async () => {
      const room = await this.view(code);
      if (room.hostId !== playerId) throw new AppError("not_host", "Only the host can start");
      if (room.status !== "lobby") throw new AppError("room_started", "The room is not in the lobby");
      if (room.members.length < MIN_PLAYERS) throw new AppError("not_enough_players", "Need at least 2 players");
      if (room.members.length > room.maxPlayers) throw new AppError("room_full", "Too many players");
      if (!room.members.every((m) => m.ready)) throw new AppError("not_ready", "Not everyone is ready");

      const seats: SeatInfo[] = room.members.map((m, i) => ({
        seat: SEAT_ORDER[i]!,
        playerId: m.playerId,
        nickname: m.nickname,
      }));
      const runner = new MatchRunner({
        id: nanoid(12),
        roomCode: code,
        seats,
        questions: this.opts.questions,
        seed: randomInt(0, 2 ** 31),
        timing: this.opts.timing,
        clock: this.opts.clock,
        isConnected: (pid) => this.isConnected(code, pid),
        hooks: {
          onChange: (r) => this.sendSnapshots(r),
          onAction: (r, e) => this.repo.appendEvent(r.id, e),
          onFinished: (r) => void this.onFinished(r),
          onAbandoned: (r) => void this.onAbandoned(r),
        },
      });
      await this.repo.create(runner);
      // Only the newest match of a room stays in memory.
      if (room.matchId) this.dropRunner(room.matchId);
      this.runners.set(runner.id, runner);
      this.emitRoom(await this.view(code));
      runner.start();
      return { matchId: runner.id };
    });
  }

  /** Host only, after a match: back to the lobby for a rematch. */
  reset(rawCode: string, playerId: string): Promise<RoomView> {
    const code = normalizeRoomCode(String(rawCode ?? ""));
    return this.locked(code, async () => {
      const room = await this.view(code);
      if (room.hostId !== playerId) throw new AppError("not_host", "Only the host can reset the room");
      if (room.status === "playing") throw new AppError("room_started", "The match is still running");
      await this.db.begin(async (tx) => {
        await tx`update room_members set ready = false, seat = null where room_code = ${code}`;
        await tx`update rooms set status = 'lobby', updated_at = now() where code = ${code}`;
      });
      const view = await this.view(code);
      this.emitRoom(view);
      return view;
    });
  }

  // -------------------------------------------------------------------------
  // Match

  action(matchId: string, playerId: string, action: ClientAction, receivedAt?: number): void {
    this.runner(matchId).handle(playerId, action, receivedAt);
  }

  sync(matchId: string, playerId: string): MatchSnapshot {
    const r = this.runner(matchId);
    if (!r.seatOf(playerId)) throw new AppError("not_in_match", "You are not playing in this match");
    return r.snapshotFor(playerId);
  }

  private async onFinished(r: MatchRunner): Promise<void> {
    try {
      await this.repo.finish(r);
    } catch (err) {
      this.opts.log(`match ${r.id}: finish failed`, err);
    }
    const { ranking } = r.results();
    const sockets = this.socketsOf(r.roomCode);
    this.opts.emit(sockets, "match:ended", { matchId: r.id, ranking, winner: r.state.winner });
    try {
      this.emitRoom(await this.view(r.roomCode));
    } catch (err) {
      this.opts.log(`room ${r.roomCode}: update after match failed`, err);
    }
  }

  /** Everyone stayed away too long: abort the match, room back to the lobby. */
  private async onAbandoned(r: MatchRunner): Promise<void> {
    try {
      await this.locked(r.roomCode, async () => {
        await this.repo.abort(r);
        this.runners.delete(r.id);
        this.emitRoom(await this.view(r.roomCode));
      });
    } catch (err) {
      this.opts.log(`match ${r.id}: abort failed`, err);
    }
  }

  // -------------------------------------------------------------------------
  // Sockets

  /** A socket went away: drop it everywhere and tell the rooms whose player went offline. */
  async disconnect(socketId: string): Promise<void> {
    if (this.closed) return;
    for (const [code, players] of this.presence) {
      for (const [playerId, sockets] of players) {
        if (!sockets.delete(socketId)) continue;
        if (sockets.size) continue;
        players.delete(playerId);
        try {
          const view = await this.view(code);
          this.emitRoom(view);
          this.liveRunner(view)?.presenceChanged();
        } catch (err) {
          this.opts.log(`room ${code}: disconnect update failed`, err);
        }
      }
    }
  }

  /** Stops all match timers (server shutdown) and waits for pending writes. */
  async close(): Promise<void> {
    this.closed = true;
    for (const r of this.runners.values()) r.stop();
    await Promise.all([...this.runners.keys()].map((id) => this.repo.flush(id)));
    this.runners.clear();
  }

  private subscribe(code: string, playerId: string, socketId: string): void {
    let players = this.presence.get(code);
    if (!players) this.presence.set(code, (players = new Map()));
    let sockets = players.get(playerId);
    if (!sockets) players.set(playerId, (sockets = new Set()));
    sockets.add(socketId);
  }

  private socketsOf(code: string, playerId?: string): string[] {
    const players = this.presence.get(code);
    if (!players) return [];
    if (playerId) return [...(players.get(playerId) ?? [])];
    return [...players.values()].flatMap((s) => [...s]);
  }

  private emitRoom(view: RoomView): void {
    this.opts.emit(this.socketsOf(view.code), "room:update", view);
  }

  private sendSnapshots(r: MatchRunner): void {
    for (const s of r.seats) {
      const sockets = this.socketsOf(r.roomCode, s.playerId);
      if (sockets.length) this.opts.emit(sockets, "match:snapshot", r.snapshotFor(s.playerId));
    }
  }

  private sendSnapshot(view: RoomView, playerId: string, sockets: string[]): void {
    const r = this.liveRunner(view);
    if (r?.seatOf(playerId)) this.opts.emit(sockets, "match:snapshot", r.snapshotFor(playerId));
  }

  /** The room's current (or just finished) match runner, if it is in memory and the room is not back in the lobby. */
  private liveRunner(view: RoomView): MatchRunner | undefined {
    return view.matchId && view.status !== "lobby" ? this.runners.get(view.matchId) : undefined;
  }

  private dropRunner(matchId: string): void {
    this.runners.get(matchId)?.stop();
    this.runners.delete(matchId);
  }

  private requireMember(room: RoomView, playerId: string): void {
    if (!room.members.some((m) => m.playerId === playerId)) {
      throw new AppError("bad_request", "You are not a member of this room");
    }
  }

  /** Runs room mutations one after another per room code. */
  private locked<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(code) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(code, tail);
    void tail.then(() => {
      if (this.locks.get(code) === tail) this.locks.delete(code);
    });
    return run;
  }
}

function randomCode(): string {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return s;
}
