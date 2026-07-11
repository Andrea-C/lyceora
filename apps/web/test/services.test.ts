import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile, masteryState, reviewQueue, dailyActivity, servedExercise, evidenceRecord } from "@lyceora/db";
import { buildGraph, type Topic, type Dependency } from "@lyceora/taxonomy";
import { addDays, INTERVAL_LADDER_DAYS } from "@lyceora/engine";
import { eq, and } from "drizzle-orm";
import { startSession, completeActivity, localToday, type AssessorPort } from "../src/server/services/session";
import { ConflictError, ForbiddenError } from "../src/server/repo";

const t = (id: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain: "Arithmetic",
  name: { it: id, en: id }, description: { it: id, en: id }, ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
const hard = (a: string, b: string): Dependency => ({ topicId: a, prerequisiteId: b, strength: "hard", reason: "t" });
const graph = buildGraph(
  [
    t("pitagora"), t("radici"), t("potenze"),
    t("avanzamento"), t("ripasso"), t("custodyA"), t("custodyB"), t("custodyC")
  ],
  [hard("pitagora", "radici"), hard("radici", "potenze")]
);

const fakeAssessor: AssessorPort = {
  generate: async (topicId) => [{ id: `ex-${topicId}`, kind: "numeric", prompt: "?", correctAnswer: "8", explanation: "2^3", difficulty: 2 }],
  grade: async (_ex, answer, _locale, opts) => ({
    correct: answer === "8",
    feedback: "ok",
    // mirror the live attribution path: wrong answer implicates the radici prerequisite when offered
    failedConcepts: answer === "8" ? [] : (opts?.candidateConcepts ?? []).filter((c) => c.includes("radici"))
  })
};

let rawDb: ReturnType<typeof drizzle>;
let db: never;
let profileId: string;

/** Server-side custody fixture: mirrors what GET /api/activity/exercise would have inserted. */
async function serveExercise(args: { sessionId: string; topicId: string; difficulty: 1 | 2 | 3; correctAnswer?: string; forProfileId?: string }) {
  const [row] = await rawDb.insert(servedExercise).values({
    profileId: args.forProfileId ?? profileId, sessionId: args.sessionId, topicId: args.topicId, difficulty: args.difficulty,
    exerciseJson: { id: `ex-${args.topicId}`, kind: "numeric", prompt: "?", correctAnswer: args.correctAnswer ?? "8", explanation: "e", difficulty: args.difficulty }
  }).returning();
  return row!;
}

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  await d.insert(user).values({ id: "parent", name: "P", email: "p@x.it", emailVerified: false });
  const [p] = await d.insert(profile).values({ ownerUserId: "parent", displayName: "Marco" }).returning();
  profileId = p!.id;
  // radici falsely mastered; potenze solid; pitagora in progress
  await d.insert(masteryState).values([
    { profileId, topicId: "potenze", status: "mastered", consecutiveCorrectAtLevel: 2 },
    { profileId, topicId: "radici", status: "mastered", consecutiveCorrectAtLevel: 1 },
    { profileId, topicId: "pitagora", status: "inProgress" }
  ]);
  rawDb = d;
  db = d as never;
});

describe("assessment failure routes to remediation with derived evidence", () => {
  it("failing the pitagora assessment demotes radici and blocks pitagora", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["pitagora"]);
    const served = await serveExercise({ sessionId, topicId: "pitagora", difficulty: 2 });
    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "assessment", topicId: "pitagora", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "25" // wrong
    });
    expect(r.graded.correct).toBe(false);
    expect(r.routeDecision?.action).toBe("remediate");
    const rows = await rawDb.select().from(masteryState).where(eq(masteryState.profileId, profileId));
    const radici = rows.find((x) => x.topicId === "radici");
    expect(radici?.status).toBe("needsReview");
  });
});

describe("completeActivity advance branch", () => {
  it("mastering an assessment enters the topic into review rotation", async () => {
    await rawDb.insert(masteryState).values({
      profileId, topicId: "avanzamento", status: "inProgress", consecutiveCorrectAtLevel: 1
    });
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["avanzamento"]);
    const served = await serveExercise({ sessionId, topicId: "avanzamento", difficulty: 2 });

    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "assessment", topicId: "avanzamento", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "8" // correct -> consecutiveCorrectAtLevel 1 -> 2 -> mastered -> routeNext "advance"
    });
    expect(r.graded.correct).toBe(true);
    expect(r.routeDecision?.action).toBe("advance");

    const [row] = await rawDb.select().from(reviewQueue)
      .where(and(eq(reviewQueue.profileId, profileId), eq(reviewQueue.topicId, "avanzamento")));
    expect(row).toBeDefined();
    expect(row!.intervalRung).toBe(0);
    expect(row!.suspended).toBe(false);
  });
});

describe("completeActivity review item", () => {
  it("a passed review climbs the interval rung and pushes dueOn out", async () => {
    const today = localToday("Europe/Rome");
    await rawDb.insert(reviewQueue).values({
      profileId, topicId: "ripasso", intervalRung: 0, dueOn: today, lapses: 0, suspended: false
    });
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["ripasso"]);
    const served = await serveExercise({ sessionId, topicId: "ripasso", difficulty: 2 });

    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "review", topicId: "ripasso", reason: "due", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "8" // correct
    });
    expect(r.graded.correct).toBe(true);

    const [row] = await rawDb.select().from(reviewQueue)
      .where(and(eq(reviewQueue.profileId, profileId), eq(reviewQueue.topicId, "ripasso")));
    expect(row!.intervalRung).toBe(1);
    expect(row!.dueOn).toBe(addDays(today, INTERVAL_LADDER_DAYS[1]));
  });
});

describe("served-exercise custody", () => {
  it("rejects grading against a servedExercise owned by a different profile", async () => {
    const [otherProfile] = await rawDb.insert(profile).values({ ownerUserId: "parent", displayName: "Luca" }).returning();
    const { sessionId: otherSessionId } = await startSession(db, graph, "parent", otherProfile!.id, ["custodyA"]);
    const foreign = await serveExercise({ sessionId: otherSessionId, topicId: "custodyA", difficulty: 2, forProfileId: otherProfile!.id });

    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyA"]);
    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyA", difficulty: 2 },
      servedExerciseId: foreign.id,
      answer: "8"
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects grading against a servedExercise for a different topic/session", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyA", "custodyB"]);
    const servedForA = await serveExercise({ sessionId, topicId: "custodyA", difficulty: 2 });

    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyB", difficulty: 2 }, // topic mismatch
      servedExerciseId: servedForA.id,
      answer: "8"
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects re-grading an already-consumed servedExercise (atomic claim closes the race too)", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyB"]);
    const served = await serveExercise({ sessionId, topicId: "custodyB", difficulty: 2 });

    const first = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyB", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "8"
    });
    expect(first.graded.correct).toBe(true);

    const evidenceBefore = await rawDb.select().from(evidenceRecord)
      .where(and(eq(evidenceRecord.profileId, profileId), eq(evidenceRecord.sessionId, sessionId)));

    // second call with the SAME servedExerciseId: the atomic UPDATE...WHERE consumed_at IS NULL
    // claim returns zero rows the second time (same mechanism that would close a real concurrent
    // race, not just a sequential replay) -> ConflictError, and nothing further is written.
    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyB", difficulty: 2 },
      servedExerciseId: served.id, // same row, already consumed
      answer: "8"
    })).rejects.toBeInstanceOf(ConflictError);

    const evidenceAfter = await rawDb.select().from(evidenceRecord)
      .where(and(eq(evidenceRecord.profileId, profileId), eq(evidenceRecord.sessionId, sessionId)));
    expect(evidenceAfter).toHaveLength(evidenceBefore.length);
  });

  it("pins difficulty from the served row: a mismatched item.difficulty is rejected with no mastery movement", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyC"]);
    const served = await serveExercise({ sessionId, topicId: "custodyC", difficulty: 1 }); // served at difficulty 1

    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyC", difficulty: 2 }, // client claims difficulty 2
      servedExerciseId: served.id,
      answer: "8"
    })).rejects.toBeInstanceOf(ConflictError);

    const rows = await rawDb.select().from(masteryState)
      .where(and(eq(masteryState.profileId, profileId), eq(masteryState.topicId, "custodyC")));
    expect(rows).toHaveLength(0); // no fold happened at all
  });
});

describe("awardXp goal + streak accounting", () => {
  it("computes cumulative goalMet per local day and does not double-count same-day streaks", async () => {
    const today = localToday("Europe/Rome");
    // isolate from whatever earlier tests in this file already did today
    await rawDb.delete(dailyActivity).where(and(eq(dailyActivity.profileId, profileId), eq(dailyActivity.activityDate, today)));
    await rawDb.update(profile).set({ dailyXpGoal: 8, currentStreak: 0, longestStreak: 0, lastActiveOn: null })
      .where(eq(profile.id, profileId));

    const { sessionId } = await startSession(db, graph, "parent", profileId, ["avanzamento"]);

    const first = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId, item: { kind: "lesson", topicId: "avanzamento" }
    });
    expect(first.xp).toBe(5);
    const [afterFirst] = await rawDb.select().from(dailyActivity)
      .where(and(eq(dailyActivity.profileId, profileId), eq(dailyActivity.activityDate, today)));
    expect(afterFirst!.xpEarned).toBe(5);
    expect(afterFirst!.goalMet).toBe(false); // 5 < 8
    const [profileAfterFirst] = await rawDb.select().from(profile).where(eq(profile.id, profileId));
    expect(profileAfterFirst!.currentStreak).toBe(1);
    expect(profileAfterFirst!.lastActiveOn).toBe(today);

    const second = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId, item: { kind: "lesson", topicId: "avanzamento" }
    });
    expect(second.xp).toBe(5);
    const [afterSecond] = await rawDb.select().from(dailyActivity)
      .where(and(eq(dailyActivity.profileId, profileId), eq(dailyActivity.activityDate, today)));
    expect(afterSecond!.xpEarned).toBe(10);
    expect(afterSecond!.goalMet).toBe(true); // 10 >= 8

    // same local day again: nextStreak must be a no-op, not a second increment
    const [profileAfterSecond] = await rawDb.select().from(profile).where(eq(profile.id, profileId));
    expect(profileAfterSecond!.currentStreak).toBe(1);
  });
});
