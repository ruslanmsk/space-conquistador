import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Db } from "./db";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

/**
 * Applies `migrations/*.sql` in name order, each once, in its own transaction. Applied names are
 * kept in `schema_migrations`. An advisory lock keeps two servers starting together from racing.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  await db.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727274)`;
    await tx`create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
    const done = new Set((await tx<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const text = await readFile(dir + file, "utf8");
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${file})`;
      applied.push(file);
    }
  });
  return applied;
}
