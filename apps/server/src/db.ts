import postgres, { type ISql, type Sql } from "postgres";

export type Db = Sql;

export const DEFAULT_DATABASE_URL = "postgres://conquistador:conquistador@localhost:5433/conquistador";

/**
 * Opens a connection pool. With `schema`, every connection uses it as its search_path (tests run
 * in a throw-away schema of their own); the schema is created if missing.
 */
export async function openDb(url: string, schema?: string): Promise<Db> {
  if (schema) {
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Bad schema name: ${schema}`);
    const admin = postgres(url, { max: 1, onnotice: false });
    try {
      await admin.unsafe(`create schema if not exists ${schema}`);
    } finally {
      await admin.end();
    }
  }
  return postgres(url, {
    max: 10,
    onnotice: false,
    connection: schema ? { search_path: schema } : {},
  });
}

/** A value for a json/jsonb parameter. */
export function json(db: ISql, value: unknown) {
  return db.json(JSON.parse(JSON.stringify(value)) as postgres.JSONValue);
}
