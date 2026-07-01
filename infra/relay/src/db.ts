import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as schema from "./persistence/schema.ts";
import { RELAY_MIGRATIONS } from "./persistence/migrations.ts";

export type RelayDatabase = SQLiteBunDatabase<typeof schema>;

/**
 * The relay's SQLite database (via `bun:sqlite` + drizzle).
 *
 * Unlike the previous Cloudflare/Postgres build, drizzle's `bun-sqlite` driver
 * executes synchronously. Repositories wrap query builders in
 * `Effect.try(() => query.run()/.all()/.get())` rather than `yield*`-ing them.
 *
 * `bun:sqlite` and the drizzle driver are imported lazily inside `makeRelayDb`,
 * so importing this module (e.g. for the `RelayDb` service tag in unit tests
 * running under Node) does not require the Bun runtime.
 */
export class RelayDb extends Context.Service<RelayDb, RelayDatabase>()("t3code-relay/db/RelayDb") {}

export const makeRelayDb = (databasePath: string): Effect.Effect<RelayDatabase> =>
  Effect.promise(async () => {
    const { Database } = await import("bun:sqlite");
    const { drizzle } = await import("drizzle-orm/bun-sqlite");
    const sqlite = new Database(databasePath, { create: true });
    sqlite.exec("PRAGMA journal_mode = WAL;");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    for (const statement of RELAY_MIGRATIONS) {
      sqlite.exec(statement);
    }
    return drizzle({ client: sqlite, schema });
  });

export const layer = (databasePath: string): Layer.Layer<RelayDb> =>
  Layer.effect(RelayDb, makeRelayDb(databasePath));
