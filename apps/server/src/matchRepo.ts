import type { Db } from "./db";
import { json } from "./db";
import type { AcceptedAction, MatchRunner } from "./matchRunner";

/**
 * Match persistence. Events are written in order through one promise chain per match, so the
 * final write (and `match:ended`) happens after every event row is in.
 */
export class MatchRepo {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly db: Db,
    private readonly log: (msg: string, err?: unknown) => void,
  ) {}

  /** Inserts the match and its players, assigns seats and flips the room to "playing" — one transaction. */
  async create(runner: MatchRunner): Promise<void> {
    const seats = runner.seats.map((s) => ({ seat: s.seat, playerId: s.playerId, nickname: s.nickname }));
    await this.db.begin(async (tx) => {
      await tx`
        insert into matches (id, room_code, map_id, seats, rng_seed, status)
        values (${runner.id}, ${runner.roomCode}, ${runner.state.map.id}, ${json(tx, seats)}, ${runner.seed}, 'playing')`;
      for (const s of runner.seats) {
        await tx`insert into match_players (match_id, player_id, seat) values (${runner.id}, ${s.playerId}, ${s.seat})`;
        await tx`update room_members set seat = ${s.seat} where room_code = ${runner.roomCode} and player_id = ${s.playerId}`;
      }
      await tx`update rooms set status = 'playing', match_id = ${runner.id}, updated_at = now() where code = ${runner.roomCode}`;
    });
  }

  /** Queues an accepted action for insertion (fire-and-forget, ordered). */
  appendEvent(matchId: string, e: AcceptedAction): void {
    this.enqueue(matchId, async () => {
      await this.db`
        insert into match_events (match_id, seq, player_id, source, action)
        values (${matchId}, ${e.seq}, ${e.playerId}, ${e.source}, ${json(this.db, e.action)})`;
    });
  }

  /** Waits for queued events, then stores the result and marks the room finished. */
  async finish(runner: MatchRunner): Promise<void> {
    const { scores, ranks } = runner.results();
    const s = runner.state;
    await this.enqueue(runner.id, async () => {
      await this.db.begin(async (tx) => {
        await tx`
          update matches set status = 'finished', winner = ${s.winner}, end_reason = ${s.endReason},
            finished_at = now(), final_state = ${json(tx, s)}
          where id = ${runner.id}`;
        for (const seat of runner.seats) {
          await tx`
            update match_players set final_score = ${scores[seat.seat] ?? 0}, rank = ${ranks[seat.seat] ?? null}
            where match_id = ${runner.id} and seat = ${seat.seat}`;
        }
        await tx`update rooms set status = 'finished', updated_at = now() where code = ${runner.roomCode} and match_id = ${runner.id}`;
      });
    });
    this.queues.delete(runner.id);
  }

  /** An abandoned match: aborted, its room back in the lobby (members stay, readiness resets). */
  async abort(runner: MatchRunner): Promise<void> {
    await this.enqueue(runner.id, async () => {
      await this.db.begin(async (tx) => {
        await tx`update matches set status = 'aborted', finished_at = now() where id = ${runner.id} and status = 'playing'`;
        const rooms = await tx`
          update rooms set status = 'lobby', match_id = null, updated_at = now()
          where code = ${runner.roomCode} and match_id = ${runner.id} returning code`;
        if (rooms.length) {
          await tx`update room_members set ready = false, seat = null where room_code = ${runner.roomCode}`;
        }
      });
    });
    this.queues.delete(runner.id);
  }

  /**
   * Live matches only exist in memory: after a restart, matches left "playing" are aborted and
   * their rooms go back to the lobby (members stay, readiness resets).
   */
  async abortStale(): Promise<number> {
    return this.db.begin(async (tx) => {
      const rooms = await tx<{ code: string }[]>`select code from rooms where status = 'playing'`;
      const codes = rooms.map((r) => r.code);
      if (codes.length) {
        await tx`update room_members set ready = false, seat = null where room_code in ${tx(codes)}`;
        await tx`update rooms set status = 'lobby', match_id = null, updated_at = now() where code in ${tx(codes)}`;
      }
      const aborted = await tx`update matches set status = 'aborted', finished_at = now() where status = 'playing' returning id`;
      return aborted.length;
    });
  }

  /** Resolves once every queued write of the match has been attempted. */
  flush(matchId: string): Promise<void> {
    return this.queues.get(matchId) ?? Promise.resolve();
  }

  private enqueue(matchId: string, job: () => Promise<void>): Promise<void> {
    const next = (this.queues.get(matchId) ?? Promise.resolve()).then(job).catch((err) => {
      this.log(`match ${matchId}: write failed`, err);
    });
    this.queues.set(matchId, next);
    return next;
  }
}
