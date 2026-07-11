import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema: { ...schema, ...authSchema } });
}
export type Db = ReturnType<typeof createDb>;
