import { createDb } from "@lyceora/db";

const globalForDb = globalThis as unknown as { db?: ReturnType<typeof createDb> };
export const db = globalForDb.db ?? createDb(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
