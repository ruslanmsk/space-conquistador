import { createHash, randomBytes } from "node:crypto";
import { isValidNickname, type GuestSession, type PlayerProfile } from "@space-conquistador/protocol";
import { nanoid } from "nanoid";
import type { Db } from "./db";
import { AppError } from "./errors";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function cleanNickname(raw: unknown): string {
  if (typeof raw !== "string" || !isValidNickname(raw)) {
    throw new AppError("bad_request", "Nickname must be 2–16 characters");
  }
  return raw.trim().replace(/\s+/g, " ");
}

/** Guest identities: a random bearer token, stored only as its SHA-256 hash. */
export class Players {
  constructor(private readonly db: Db) {}

  async createGuest(nickname: unknown): Promise<GuestSession> {
    const nick = cleanNickname(nickname);
    const token = randomBytes(32).toString("base64url");
    const id = nanoid(12);
    await this.db`insert into players (id, nickname, token_hash) values (${id}, ${nick}, ${hashToken(token)})`;
    return { token, player: { id, nickname: nick } };
  }

  /** Player for a bearer token, or null. */
  async byToken(token: unknown): Promise<PlayerProfile | null> {
    if (typeof token !== "string" || !token || token.length > 200) return null;
    const [row] = await this.db<PlayerProfile[]>`
      update players set last_seen_at = now() where token_hash = ${hashToken(token)}
      returning id, nickname`;
    return row ?? null;
  }

  async requireToken(token: unknown): Promise<PlayerProfile> {
    const p = await this.byToken(token);
    if (!p) throw new AppError("unauthorized", "Unknown or missing token");
    return p;
  }

  async get(id: string): Promise<PlayerProfile | null> {
    const [row] = await this.db<PlayerProfile[]>`select id, nickname from players where id = ${id}`;
    return row ?? null;
  }

  async rename(id: string, nickname: unknown): Promise<PlayerProfile> {
    const nick = cleanNickname(nickname);
    const [row] = await this.db<PlayerProfile[]>`
      update players set nickname = ${nick} where id = ${id} returning id, nickname`;
    if (!row) throw new AppError("not_found", "Player not found");
    return row;
  }

  async touch(id: string): Promise<void> {
    await this.db`update players set last_seen_at = now() where id = ${id}`;
  }
}

/** Token from an `Authorization: Bearer …` header. */
export function bearer(header: string | undefined): string | undefined {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return m?.[1]?.trim();
}
