import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import * as s from "../src/schema.js";
import * as auth from "../src/auth-schema.js";

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  db = drizzle(new PGlite(), { schema: { ...s, ...auth } });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
});

describe("schema", () => {
  it("supports the parent -> profile -> mastery/evidence write path", async () => {
    const [u] = await db.insert(auth.user).values({
      id: "u1", name: "Parent", email: "p@example.com", emailVerified: false
    }).returning();
    const [p] = await db.insert(s.profile).values({
      ownerUserId: u!.id, displayName: "Marco"
    }).returning();
    expect(p!.locale).toBe("it");
    expect(p!.dailyXpGoal).toBe(30);

    await db.insert(s.masteryState).values({ profileId: p!.id, topicId: "lyc_potenze_def", status: "inProgress" });
    await db.insert(s.evidenceRecord).values({
      profileId: p!.id, topicId: "lyc_potenze_def", source: "exercise", isCorrect: true, difficulty: 2
    });
    const rows = await db.select().from(s.masteryState);
    expect(rows).toHaveLength(1);
  });

  it("enforces one mastery row per (profile, topic)", async () => {
    const [p] = await db.select().from(s.profile);
    await expect(
      db.insert(s.masteryState).values({ profileId: p!.id, topicId: "lyc_potenze_def", status: "unknown" })
    ).rejects.toThrow();
  });

  it("enforces one review-queue row per (profile, topic) and one daily row per local date", async () => {
    const [p] = await db.select().from(s.profile);
    await db.insert(s.reviewQueue).values({ profileId: p!.id, topicId: "t1", dueOn: "2026-07-12" });
    await expect(
      db.insert(s.reviewQueue).values({ profileId: p!.id, topicId: "t1", dueOn: "2026-07-13" })
    ).rejects.toThrow();

    await db.insert(s.dailyActivity).values({ profileId: p!.id, activityDate: "2026-07-12", goalXp: 30 });
    await expect(
      db.insert(s.dailyActivity).values({ profileId: p!.id, activityDate: "2026-07-12", goalXp: 30 })
    ).rejects.toThrow();
  });
});

describe("m2 schema", () => {
  let profileId: string;
  let sessionId: string;

  beforeAll(async () => {
    const [u] = await db.insert(auth.user).values({
      id: "u-m2", name: "Parent M2", email: "m2@example.com", emailVerified: false
    }).returning();
    const [p] = await db.insert(s.profile).values({ ownerUserId: u!.id, displayName: "M2 Kid" }).returning();
    const [session] = await db.insert(s.learningSession).values({ profileId: p!.id }).returning();
    profileId = p!.id;
    sessionId = session!.id;
  });

  it("rejects out-of-range difficulty on served_exercise", async () => {
    // Postgres error code 23514 = check_violation; drizzle-orm's PGlite driver nests the
    // real pg error under `.cause` while the top-level message is just "Failed query: ...".
    await expect(
      db.insert(s.servedExercise).values({ profileId, sessionId, topicId: "t", difficulty: 4, exerciseJson: {} })
    ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514", constraint: "served_exercise_difficulty_check" }) });
  });

  it("rejects out-of-range difficulty on evidence_record", async () => {
    await expect(
      db.insert(s.evidenceRecord).values({ profileId, topicId: "t", source: "exercise", isCorrect: true, difficulty: 0 })
    ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514", constraint: "evidence_difficulty_check" }) });
  });

  it("rate_limit_window upserts atomically on the unique window key", async () => {
    const w = new Date("2026-07-12T10:00:00Z");
    await db.insert(s.rateLimitWindow).values({ profileId, route: "agent", windowStart: w, count: 1 });
    await db.insert(s.rateLimitWindow).values({ profileId, route: "agent", windowStart: w, count: 1 })
      .onConflictDoUpdate({
        target: [s.rateLimitWindow.profileId, s.rateLimitWindow.route, s.rateLimitWindow.windowStart],
        set: { count: sql`${s.rateLimitWindow.count} + 1` }
      });
    const [row] = await db.select().from(s.rateLimitWindow);
    expect(row!.count).toBe(2);
  });
});
