import { describe, it, expect, beforeAll } from "vitest";
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
  });
});
