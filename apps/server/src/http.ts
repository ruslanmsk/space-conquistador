import cors from "@fastify/cors";
import type { CreateRoomRequest, GuestRequest, UpdateMeRequest } from "@space-conquistador/protocol";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { bearer, type Players } from "./auth";
import type { Db } from "./db";
import { toApiError } from "./errors";
import type { RoomService } from "./rooms";

export type HttpDeps = {
  db: Db;
  players: Players;
  rooms: RoomService;
  corsOrigins: true | string[];
  logger: boolean;
};

/** Fastify app with the JSON API: guest identity and rooms. Errors come back as ApiError. */
export async function buildHttp(deps: HttpDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ? { level: "info" } : false });
  await app.register(cors, {
    origin: deps.corsOrigins,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.setErrorHandler((err, req, reply) => {
    const api = toApiError(err);
    // Fastify's own validation/parse errors carry a 4xx statusCode.
    const status = (err as { statusCode?: number }).statusCode;
    if (api.error === "internal" && status && status < 500) {
      return reply.status(status).send({ error: "bad_request", message: (err as Error).message });
    }
    if (api.status >= 500) req.log.error(err);
    return reply.status(api.status).send({ error: api.error, message: api.message });
  });

  const me = (req: FastifyRequest) => deps.players.requireToken(bearer(req.headers.authorization));

  app.get("/health", async () => {
    await deps.db`select 1`;
    return { ok: true };
  });

  app.post<{ Body: GuestRequest }>("/api/guest", async (req) => deps.players.createGuest(req.body?.nickname));

  app.get("/api/me", async (req) => me(req));

  app.patch<{ Body: UpdateMeRequest }>("/api/me", async (req) => {
    const player = await me(req);
    return deps.players.rename(player.id, req.body?.nickname);
  });

  app.post<{ Body: CreateRoomRequest | undefined }>("/api/rooms", async (req) => {
    const player = await me(req);
    return deps.rooms.create(player, req.body?.maxPlayers);
  });

  app.get<{ Params: { code: string } }>("/api/rooms/:code", async (req) => deps.rooms.view(req.params.code));

  return app;
}
