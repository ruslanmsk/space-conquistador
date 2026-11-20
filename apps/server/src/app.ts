import type { AddressInfo } from "node:net";
import type { QuestionRecord } from "@space-conquistador/game-core";
import type { FastifyInstance } from "fastify";
import { Players } from "./auth";
import { DEFAULT_MATCH_TIMING, type MatchTimingConfig, type ServerConfig } from "./config";
import { DEFAULT_DATABASE_URL, openDb, type Db } from "./db";
import { buildHttp } from "./http";
import type { Clock } from "./matchRunner";
import { migrate } from "./migrate";
import { loadQuestions } from "./questions";
import { RoomService } from "./rooms";
import { attachSocket, type IoServer } from "./socket";

export type CreateServerOptions = Partial<Omit<ServerConfig, "timing">> & {
  timing?: Partial<MatchTimingConfig>;
  questions?: QuestionRecord[];
  clock?: Clock;
};

export type RunningServer = {
  app: FastifyInstance;
  io: IoServer;
  db: Db;
  rooms: RoomService;
  /** http://host:port the server listens on. */
  url: string;
  port: number;
  close(): Promise<void>;
};

/**
 * Connects to Postgres, applies migrations, aborts matches left over from a previous run and
 * starts HTTP + Socket.IO on one port (`port: 0` picks a free one).
 */
export async function createServer(opts: CreateServerOptions = {}): Promise<RunningServer> {
  const logger = opts.logger ?? false;
  const log = (msg: string, err?: unknown) => {
    if (logger || err) console.error(`[server] ${msg}`, err ?? "");
  };
  const db = await openDb(opts.databaseUrl ?? DEFAULT_DATABASE_URL, opts.dbSchema);
  try {
    await migrate(db);
    const questions = opts.questions ?? loadQuestions(opts.questionsDir);
    const corsOrigins = opts.corsOrigins ?? true;
    const players = new Players(db);
    // The emitter is wired once Socket.IO exists (rooms only emit after a client connected).
    let io: IoServer | undefined;
    const rooms = new RoomService({
      db,
      questions,
      timing: { ...DEFAULT_MATCH_TIMING, ...opts.timing },
      clock: opts.clock,
      log,
      emit: (ids, event, ...args) => {
        const list = [...ids];
        if (io && list.length) io.to(list).emit(event, ...args);
      },
    });
    const aborted = await rooms.repo.abortStale();
    if (aborted) log(`aborted ${aborted} match(es) left from a previous run`);

    const app = await buildHttp({ db, players, rooms, corsOrigins, logger });
    io = attachSocket(app.server, { players, rooms, corsOrigins, log });
    await app.listen({ port: opts.port ?? 3001, host: opts.host ?? "0.0.0.0" });
    const port = (app.server.address() as AddressInfo).port;

    return {
      app,
      io,
      db,
      rooms,
      port,
      url: `http://localhost:${port}`,
      async close() {
        await rooms.close();
        io?.disconnectSockets(true);
        await new Promise<void>((resolve) => io!.close(() => resolve()));
        await app.close().catch(() => undefined);
        await db.end();
      },
    };
  } catch (err) {
    await db.end();
    throw err;
  }
}
