import {
  getLegalAttackTargets,
  getLegalPicks,
  maxWager,
  type PlayerId,
} from "@space-conquistador/game-core";
import {
  PROTOCOL_VERSION,
  type Ack,
  type ClientAction,
  type ClientToServerEvents,
  type GuestSession,
  type MatchSnapshot,
  type RoomView,
  type ServerToClientEvents,
} from "@space-conquistador/protocol";
import { nanoid } from "nanoid";
import postgres from "postgres";
import { io as ioClient, type Socket } from "socket.io-client";
import { createServer, type CreateServerOptions, type RunningServer } from "../src/app";
import { DEFAULT_DATABASE_URL } from "../src/db";

export const DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

/** Fast timing for tests: no reading beat, short grace and offline delays. */
export const FAST_TIMING: CreateServerOptions["timing"] = {
  readingMs: () => 0,
  answerGrace: 100,
  revealAutoContinue: 3_000,
  turnTimeout: 3_000,
  offlineMoveDelay: 50,
};

export type TestServer = RunningServer & { schema: string; dispose(): Promise<void> };

/** Starts a server on a random port in a throw-away Postgres schema. */
export async function startServer(opts: CreateServerOptions = {}): Promise<TestServer> {
  const schema = `t_${nanoid(10).toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  const server = await createServer({
    port: 0,
    host: "127.0.0.1",
    databaseUrl: DATABASE_URL,
    dbSchema: schema,
    logger: false,
    ...opts,
    timing: { ...FAST_TIMING, ...opts.timing },
  });
  return {
    ...server,
    schema,
    async dispose() {
      await server.close();
      const admin = postgres(DATABASE_URL, { max: 1, onnotice: false });
      await admin.unsafe(`drop schema if exists ${schema} cascade`);
      await admin.end();
    },
  };
}

export async function http<T>(server: RunningServer, method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(server.url + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

export async function guest(server: RunningServer, nickname: string): Promise<GuestSession> {
  const res = await http<GuestSession>(server, "POST", "/api/guest", { nickname });
  if (res.status !== 200) throw new Error(`guest failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

type AckRes<T> = { ok: true; data: T } | { ok: false; error: string; message: string };
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Looks for anything that would reveal the answer of an active question in a snapshot. */
export function leakProblems(snap: MatchSnapshot): string[] {
  const step = snap.state.step;
  if (step.type !== "question") return [];
  const problems: string[] = [];
  const text = JSON.stringify(snap);
  for (const key of ["correctIndex", "correctValue", "choiceOrder", "tolerance", '"fact"']) {
    if (text.includes(key)) problems.push(`snapshot ${snap.seq} contains ${key}`);
  }
  for (const [p, a] of Object.entries(step.q.answers)) {
    if (p !== snap.mySeat && (a?.value !== null || a.elapsedMs !== 0)) problems.push(`snapshot ${snap.seq} shows ${p}'s answer`);
  }
  for (const p of Object.keys(step.q.aids)) {
    if (p !== snap.mySeat) problems.push(`snapshot ${snap.seq} shows ${p}'s aid`);
  }
  return problems;
}

/** A socket.io test client that records what the server sends and can play automatically. */
export class TestClient {
  socket!: ClientSocket;
  snapshots: MatchSnapshot[] = [];
  rooms: RoomView[] = [];
  ended: Parameters<ServerToClientEvents["match:ended"]>[0][] = [];
  leaks: string[] = [];
  rejected: { action: ClientAction; error: string; message: string }[] = [];
  private auto = false;
  /** While set and true for the newest snapshot, autoplay holds still. */
  holdWhen?: (snap: MatchSnapshot) => boolean;
  private actedSeq = -1;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly server: RunningServer,
    readonly session: GuestSession,
  ) {}

  get id() {
    return this.session.player.id;
  }

  get latest(): MatchSnapshot | undefined {
    return this.snapshots.at(-1);
  }

  async connect(protocol: number = PROTOCOL_VERSION, token = this.session.token): Promise<void> {
    this.socket = ioClient(this.server.url, {
      auth: { token, protocol },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    this.socket.on("match:snapshot", (s) => {
      this.leaks.push(...leakProblems(s));
      const last = this.latest;
      if (last && last.matchId === s.matchId && s.seq < last.seq) return;
      this.snapshots.push(s);
      if (this.auto) this.play();
    });
    this.socket.on("room:update", (r) => this.rooms.push(r));
    this.socket.on("match:ended", (e) => this.ended.push(e));
    await new Promise<void>((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (err) => reject(err));
    });
  }

  disconnect(): void {
    this.auto = false;
    if (this.retry) clearTimeout(this.retry);
    this.socket.disconnect();
  }

  emit<E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ): Promise<AckRes<Parameters<ClientToServerEvents[E]>[1] extends Ack<infer T> ? T : never>> {
    return new Promise((resolve) => {
      (this.socket.emit as unknown as (e: string, p: unknown, ack: (r: unknown) => void) => void)(event, payload, (r) =>
        resolve(r as never),
      );
    });
  }

  async ok<E extends keyof ClientToServerEvents>(event: E, payload: Parameters<ClientToServerEvents[E]>[0]) {
    const res = await this.emit(event, payload);
    if (!res.ok) throw new Error(`${event} failed: ${res.error} ${res.message}`);
    return res.data;
  }

  act(action: ClientAction) {
    return this.emit("match:action", { matchId: this.latest!.matchId, action });
  }

  /** Start answering / picking / attacking / betting / continuing on every snapshot. */
  autoplay(on = true): void {
    this.auto = on;
    if (on) this.play();
  }

  async waitFor<T>(what: string, check: () => T, timeoutMs = 20_000): Promise<Exclude<T, false | undefined | null | 0 | "">> {
    const start = Date.now();
    for (;;) {
      const v = check();
      if (v) return v as Exclude<T, false | undefined | null | 0 | "">;
      if (Date.now() - start > timeoutMs) {
        const step = this.latest?.state.step;
        throw new Error(
          `${this.session.player.nickname}: timed out waiting for ${what} (seq ${this.latest?.seq}, step ${JSON.stringify(step)?.slice(0, 300)}, rejected ${JSON.stringify(this.rejected.slice(-3))})`,
        );
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  private play(): void {
    const snap = this.latest;
    if (!snap || !this.auto || snap.seq === this.actedSeq || !snap.mySeat) return;
    if (this.holdWhen?.(snap)) return;
    const action = decide(snap, snap.mySeat);
    if (!action) return;
    this.actedSeq = snap.seq;
    void this.act(action).then((res) => {
      if (res.ok) return;
      this.rejected.push({ action, error: res.error, message: res.message });
      // The state may have moved on meanwhile; try again on the newest snapshot.
      if (this.retry) clearTimeout(this.retry);
      this.retry = setTimeout(() => {
        this.actedSeq = -1;
        this.play();
      }, 20);
    });
  }
}

/** A legal move for `me` in the snapshot, or null if it is not this player's move. */
export function decide(snap: MatchSnapshot, me: PlayerId): ClientAction | null {
  const s = snap.state;
  const step = s.step;
  switch (step.type) {
    case "question": {
      const q = step.q;
      if (!q.participants.includes(me) || q.answers[me]) return null;
      if (q.question.type === "mcq") {
        return { type: "ANSWER", value: Math.floor(Math.random() * (q.question.choices?.length ?? 4)) };
      }
      return { type: "ANSWER", value: Math.round(Math.random() * 2000) };
    }
    case "reveal":
      return snap.continued.includes(me) ? null : { type: "CONTINUE" };
    case "pick": {
      if (step.queue[0] !== me) return null;
      const planet = getLegalPicks(s, me)[0];
      return planet ? { type: "PICK", planet } : null;
    }
    case "attack": {
      if (step.player !== me) return null;
      const target = getLegalAttackTargets(s, me)[0];
      return target ? { type: "ATTACK", target } : null;
    }
    case "wager":
      if (s.eliminated.includes(me) || step.bets[me] !== undefined) return null;
      return { type: "WAGER", amount: Math.floor(maxWager(s, me) / 2) };
    default:
      return null;
  }
}

/** Guests + connected clients; the first one creates a room for `maxPlayers`, the rest join it. */
export async function roomWith(server: RunningServer, nicknames: string[], maxPlayers = nicknames.length) {
  const clients: TestClient[] = [];
  for (const n of nicknames) {
    const c = new TestClient(server, await guest(server, n));
    await c.connect();
    clients.push(c);
  }
  const created = await http<RoomView>(server, "POST", "/api/rooms", { maxPlayers }, clients[0]!.session.token);
  if (created.status !== 200) throw new Error(`create room: ${JSON.stringify(created.body)}`);
  const code = created.body.code;
  for (const c of clients) await c.ok("room:join", { code });
  return { code, clients };
}

/** Everyone but the host gets ready, the host starts. */
export async function startMatch(code: string, clients: TestClient[]): Promise<string> {
  for (const c of clients.slice(1)) await c.ok("room:ready", { code, ready: true });
  const { matchId } = await clients[0]!.ok("room:start", { code });
  await Promise.all(clients.map((c) => c.waitFor("first snapshot", () => c.latest?.matchId === matchId)));
  return matchId;
}
