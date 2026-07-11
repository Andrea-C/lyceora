import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  // An idle pooled client throws an unhandled "Connection terminated unexpectedly" if the
  // backend goes away first (e.g. a test harness tearing down its ephemeral DB after the app's
  // pool has already opened connections) — swallow it here rather than crashing the process.
  pool.on("error", () => {});
  return drizzle(pool, { schema: { ...schema, ...authSchema } });
}
export type Db = ReturnType<typeof createDb>;
