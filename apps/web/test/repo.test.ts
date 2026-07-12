import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile, learningSession } from "@lyceora/db";
import { getOwnedProfile, ForbiddenError, createServedExerciseCapped, ConflictError, MAX_SERVED_PER_ITEM, consumeRateLimit, isTopicInActivePlan } from "../src/server/repo";

let db: never;
let profileA: { id: string };

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  await d.insert(user).values([
    { id: "parentA", name: "A", email: "a@x.it", emailVerified: false },
    { id: "parentB", name: "B", email: "b@x.it", emailVerified: false }
  ]);
  [profileA] = await d.insert(profile).values({ ownerUserId: "parentA", displayName: "Marco" }).returning();
  db = d as never;
});

describe("tenant isolation", () => {
  it("returns the profile to its owner", async () => {
    const p = await getOwnedProfile(db, "parentA", profileA.id);
    expect(p.displayName).toBe("Marco");
  });
  it("throws ForbiddenError for any other user", async () => {
    await expect(getOwnedProfile(db, "parentB", profileA.id)).rejects.toThrow(ForbiddenError);
  });
});

describe("served-exercise serve cap (CRITICAL 2)", () => {
  it(`rejects the ${MAX_SERVED_PER_ITEM + 1}th serve of the same (session, topic, difficulty, kind) triple`, async () => {
    const [session] = await db.insert(learningSession).values({ profileId: profileA.id, kind: "daily" }).returning();
    const serveArgs = {
      profileId: profileA.id, sessionId: session!.id, topicId: "capped-topic", difficulty: 2, itemKind: "exercise" as const,
      exercise: { id: "ex-1", kind: "numeric" as const, prompt: "?", correctAnswer: "1", explanation: "e", difficulty: 2 as const }
    };
    for (let i = 0; i < MAX_SERVED_PER_ITEM; i++) {
      await expect(createServedExerciseCapped(db, serveArgs)).resolves.toBeDefined();
    }
    // the (MAX_SERVED_PER_ITEM + 1)th serve of this exact triple is rejected
    await expect(createServedExerciseCapped(db, serveArgs)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not cap a DIFFERENT triple (topic/difficulty/kind each isolate the count)", async () => {
    const [session] = await db.insert(learningSession).values({ profileId: profileA.id, kind: "daily" }).returning();
    const base = {
      profileId: profileA.id, sessionId: session!.id, difficulty: 1,
      exercise: { id: "ex-2", kind: "numeric" as const, prompt: "?", correctAnswer: "1", explanation: "e", difficulty: 1 as const }
    };
    for (let i = 0; i < MAX_SERVED_PER_ITEM; i++) {
      await createServedExerciseCapped(db, { ...base, topicId: "isolated-topic", itemKind: "exercise" });
    }
    // a different itemKind for the SAME topic/difficulty is a different triple, unaffected
    await expect(createServedExerciseCapped(db, { ...base, topicId: "isolated-topic", itemKind: "assessment" }))
      .resolves.toBeDefined();
  });
});

describe("rate limiting", () => {
  it("consumeRateLimit allows up to the limit within one hour window, then refuses", async () => {
    const now = new Date("2026-07-12T10:15:00Z");
    for (let i = 0; i < 3; i++) expect(await consumeRateLimit(db, profileA.id, "test", 3, now)).toBe(true);
    expect(await consumeRateLimit(db, profileA.id, "test", 3, now)).toBe(false);
  });
  it("consumeRateLimit resets in the next hour window", async () => {
    const now = new Date("2026-07-12T10:15:00Z");
    for (let i = 0; i < 3; i++) await consumeRateLimit(db, profileA.id, "test2", 3, now);
    const nextHour = new Date("2026-07-12T11:01:00Z");
    expect(await consumeRateLimit(db, profileA.id, "test2", 3, nextHour)).toBe(true);
  });
});

describe("isTopicInActivePlan", () => {
  it("matches only topics in an active session's plan", async () => {
    await db.insert(learningSession).values({
      profileId: profileA.id, kind: "daily", status: "active",
      planJson: {
        sessionKind: "daily",
        items: [{ kind: "lesson", topicId: "radici" }],
        estimatedXp: 10, dailyXpGoal: 30
      }
    });
    expect(await isTopicInActivePlan(db, profileA.id, "radici")).toBe(true);
    expect(await isTopicInActivePlan(db, profileA.id, "not-in-plan")).toBe(false);
  });
});
