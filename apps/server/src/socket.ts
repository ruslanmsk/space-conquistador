import {
  PROTOCOL_VERSION,
  type Ack,
  type ClientToServerEvents,
  type PlayerProfile,
  type ServerToClientEvents,
} from "@space-conquistador/protocol";
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import type { Players } from "./auth";
import { AppError, toApiError } from "./errors";
import type { RoomService } from "./rooms";

type SocketData = { player: PlayerProfile };
export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type AckData<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]>[1] extends Ack<infer T> ? T : never;

/** Error raised from the connection middleware; the client sees it as `connect_error` with `.message` = code and `.data`. */
function connectError(code: "version_mismatch" | "unauthorized", message: string): Error {
  return Object.assign(new Error(code), { data: { error: code, message } });
}

export function attachSocket(
  httpServer: HttpServer,
  deps: { players: Players; rooms: RoomService; corsOrigins: true | string[]; log: (msg: string, err?: unknown) => void },
): IoServer {
  const io: IoServer = new Server(httpServer, {
    cors: { origin: deps.corsOrigins, methods: ["GET", "POST"] },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as { token?: unknown; protocol?: unknown };
    if (auth.protocol !== PROTOCOL_VERSION) {
      return next(connectError("version_mismatch", `Server speaks protocol ${PROTOCOL_VERSION}`));
    }
    try {
      const player = await deps.players.byToken(auth.token);
      if (!player) return next(connectError("unauthorized", "Unknown or missing token"));
      socket.data.player = player;
      next();
    } catch (err) {
      deps.log("socket auth failed", err);
      next(new Error("internal"));
    }
  });

  io.on("connection", (socket: IoSocket) => {
    const me = () => socket.data.player;

    /** Registers a handler whose result (or AppError) goes back through the ack. */
    function on<E extends keyof ClientToServerEvents>(
      event: E,
      handler: (p: Payload<E>) => AckData<E> | Promise<AckData<E>>,
    ): void {
      const raw = socket as unknown as { on(e: string, fn: (payload: Payload<E>, ack?: unknown) => void): void };
      raw.on(event, async (payload, ack) => {
        const reply = typeof ack === "function" ? (ack as (res: unknown) => void) : () => undefined;
        try {
          const data = await handler((payload ?? {}) as Payload<E>);
          reply({ ok: true, data });
        } catch (err) {
          const api = toApiError(err);
          if (api.error === "internal") deps.log(`socket ${event} failed`, err);
          reply({ ok: false, error: api.error, message: api.message });
        }
      });
    }

    on("room:join", (p) => deps.rooms.join(p.code, me(), socket.id));
    on("room:leave", async (p) => {
      await deps.rooms.leave(p.code, me().id);
      return undefined;
    });
    on("room:ready", (p) => deps.rooms.setReady(p.code, me().id, p.ready));
    on("room:start", (p) => deps.rooms.start(p.code, me().id));
    on("room:reset", (p) => deps.rooms.reset(p.code, me().id));
    on("match:action", (p) => {
      if (!p.action) throw new AppError("bad_request", "Missing action");
      // The runner stamps the receive time itself (elapsedMs = now − answersAt).
      deps.rooms.action(p.matchId, me().id, p.action);
      return undefined;
    });
    on("match:sync", (p) => deps.rooms.sync(p.matchId, me().id));

    socket.on("disconnect", () => {
      void deps.rooms.disconnect(socket.id);
      void deps.players.touch(me().id).catch(() => undefined);
    });
  });

  return io;
}
