import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile, masteryState, reviewQueue, dailyActivity, servedExercise, evidenceRecord, learningSession, xpEvent } from "@lyceora/db";
import { buildGraph, type Topic, type Dependency } from "@lyceora/taxonomy";
import { addDays, INTERVAL_LADDER_DAYS } from "@lyceora/engine";
import { eq, and } from "drizzle-orm";
import { startSession, completeActivity, localToday, type AssessorPort } from "../src/server/services/session";
import { ConflictError } from "../src/server/repo";

const t = (id: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain: "Arithmetic",
  name: { it: id, en: id }, description: { it: id, en: id }, ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
const hard = (a: string, b: string): Dependency => ({ topicId: a, prerequisiteId: b, strength: "hard", reason: "t" });
const graph = buildGraph(
  [
    t("pitagora"), t("radici"), t("potenze"),
    t("avanzamento"), t("ripasso"), t("custodyA"), t("custodyB"), t("custodyC"), t("custodyD"),
    t("streakA"), t("streakB"), t("replayLesson"), t("reserveTopic")
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

/** Server-side custody fixture: mirrors what GET /api/activity/exercise would have inserted
 * (including the itemKind folded into exerciseJson, never a dedicated column). */
async function serveExercise(args: {
  sessionId: string; topicId: string; difficulty: 1 | 2 | 3;
  itemKind: "review" | "exercise" | "assessment"; correctAnswer?: string; forProfileId?: string;
}) {
  const [row] = await rawDb.insert(servedExercise).values({
    profileId: args.forProfileId ?? profileId, sessionId: args.sessionId, topicId: args.topicId, difficulty: args.difficulty,
    exerciseJson: {
      id: `ex-${args.topicId}`, kind: "numeric", prompt: "?", correctAnswer: args.correctAnswer ?? "8",
      explanation: "e", difficulty: args.difficulty, itemKind: args.itemKind
    }
  }).returning();
  return row!;
}

let isolatedProfileId: string;

/** Helper: select a profile's review_queue row by topic (Task 7 implicit-review tests). */
async function getReviewRow(pid: string, topicId: string) {
  const [row] = await rawDb.select().from(reviewQueue)
    .where(and(eq(reviewQueue.profileId, pid), eq(reviewQueue.topicId, topicId)));
  return row;
}
/** Helper: total review_queue row count for a profile (asserts no rows were created/destroyed). */
async function countReviewRows(pid: string) {
  const rows = await rawDb.select().from(reviewQueue).where(eq(reviewQueue.profileId, pid));
  return rows.length;
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
  // a SEPARATE profile with zero mastery/reviewQueue rows, used below wherever a test needs a
  // predictable composeSessionPlan output (2 new-topic slots, no remediation/due tiers) — sharing
  // `profileId` above would make plan composition depend on whatever needsReview/due state
  // earlier tests in this file happened to leave behind on it.
  const [p2] = await d.insert(profile).values({ ownerUserId: "parent", displayName: "Isolata" }).returning();
  isolatedProfileId = p2!.id;
  rawDb = d;
  db = d as never;
});

describe("assessment failure routes to remediation with derived evidence", () => {
  it("failing the pitagora assessment demotes radici and blocks pitagora", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["pitagora"]);
    const served = await serveExercise({ sessionId, topicId: "pitagora", difficulty: 2, itemKind: "assessment" });
    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "assessment", topicId: "pitagora", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "25" // wrong
    }, ["pitagora"]);
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
    const served = await serveExercise({ sessionId, topicId: "avanzamento", difficulty: 2, itemKind: "assessment" });

    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "assessment", topicId: "avanzamento", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "8" // correct -> consecutiveCorrectAtLevel 1 -> 2 -> mastered -> routeNext "advance"
    }, ["avanzamento"]);
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
    const served = await serveExercise({ sessionId, topicId: "ripasso", difficulty: 2, itemKind: "review" });

    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "review", topicId: "ripasso", reason: "due", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "8" // correct
    }, ["ripasso"]);
    expect(r.graded.correct).toBe(true);

    const [row] = await rawDb.select().from(reviewQueue)
      .where(and(eq(reviewQueue.profileId, profileId), eq(reviewQueue.topicId, "ripasso")));
    expect(row!.intervalRung).toBe(1);
    expect(row!.dueOn).toBe(addDays(today, INTERVAL_LADDER_DAYS[1]));
  });
});

describe("served-exercise custody", () => {
  it("rejects grading against a servedExercise owned by a different profile (never claimed/burned)", async () => {
    const [otherProfile] = await rawDb.insert(profile).values({ ownerUserId: "parent", displayName: "Luca" }).returning();
    const { sessionId: otherSessionId } = await startSession(db, graph, "parent", otherProfile!.id, ["custodyA"]);
    const foreign = await serveExercise({
      sessionId: otherSessionId, topicId: "custodyA", difficulty: 2, itemKind: "exercise", forProfileId: otherProfile!.id
    });

    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyA"]);
    // the atomic claim's WHERE clause includes profile_id, so a foreign servedExerciseId simply
    // never matches a row to claim — indistinguishable from "missing or already consumed"
    // (ConflictError), and critically the other profile's exercise is never touched/burned by this.
    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyA", difficulty: 2 },
      servedExerciseId: foreign.id,
      answer: "8"
    }, ["custodyA"])).rejects.toBeInstanceOf(ConflictError);

    // confirm it truly was never touched: the other profile can still claim/grade it themselves
    const otherResult = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: otherProfile!.id, sessionId: otherSessionId,
      item: { kind: "exercise", topicId: "custodyA", difficulty: 2 },
      servedExerciseId: foreign.id,
      answer: "8"
    }, ["custodyA"]);
    expect(otherResult.graded.correct).toBe(true);
  });

  it("rejects grading against a servedExercise for a different topic/session", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyA", "custodyB"]);
    const servedForA = await serveExercise({ sessionId, topicId: "custodyA", difficulty: 2, itemKind: "exercise" });

    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyB", difficulty: 2 }, // topic mismatch
      servedExerciseId: servedForA.id,
      answer: "8"
    }, ["custodyA", "custodyB"])).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects re-grading an already-consumed servedExercise (atomic claim closes the race too)", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyB"]);
    const served = await serveExercise({ sessionId, topicId: "custodyB", difficulty: 2, itemKind: "exercise" });

    const first = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyB", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "8"
    }, ["custodyB"]);
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
    }, ["custodyB"])).rejects.toBeInstanceOf(ConflictError);

    const evidenceAfter = await rawDb.select().from(evidenceRecord)
      .where(and(eq(evidenceRecord.profileId, profileId), eq(evidenceRecord.sessionId, sessionId)));
    expect(evidenceAfter).toHaveLength(evidenceBefore.length);
  });

  it("pins difficulty from the served row: a mismatched item.difficulty is rejected with no mastery movement", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyC"]);
    const served = await serveExercise({ sessionId, topicId: "custodyC", difficulty: 1, itemKind: "exercise" }); // served at difficulty 1

    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "exercise", topicId: "custodyC", difficulty: 2 }, // client claims difficulty 2
      servedExerciseId: served.id,
      answer: "8"
    }, ["custodyC"])).rejects.toBeInstanceOf(ConflictError);

    const rows = await rawDb.select().from(masteryState)
      .where(and(eq(masteryState.profileId, profileId), eq(masteryState.topicId, "custodyC")));
    expect(rows).toHaveLength(0); // no fold happened at all
  });

  it("pins item kind from the served row: fetched as one kind, graded as another is rejected", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["custodyD"]);
    // served for a plain "exercise" item...
    const served = await serveExercise({ sessionId, topicId: "custodyD", difficulty: 2, itemKind: "exercise" });

    // ...but graded as the higher-stakes "assessment" (same topic+difficulty, would otherwise
    // trigger candidateConcepts attribution, assessmentPass XP, and post-assessment routing).
    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "assessment", topicId: "custodyD", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "8"
    }, ["custodyD"])).rejects.toBeInstanceOf(ConflictError);

    const rows = await rawDb.select().from(masteryState)
      .where(and(eq(masteryState.profileId, profileId), eq(masteryState.topicId, "custodyD")));
    expect(rows).toHaveLength(0); // no fold happened at all
  });
});

describe("awardXp goal + streak accounting", () => {
  it("computes cumulative goalMet per local day and does not double-count same-day streaks", async () => {
    const today = localToday("Europe/Rome");
    // isolatedProfileId: has zero mastery/reviewQueue rows, so composeSessionPlan's remediation
    // and due tiers are guaranteed empty here and both new-topic slots are granted — using the
    // shared `profileId` would make this depend on whatever needsReview/due state earlier tests
    // in this file left behind on it (composeSessionPlan only grants 2 new-topic slots when the
    // remediation AND due tiers are both empty).
    await rawDb.delete(dailyActivity).where(and(eq(dailyActivity.profileId, isolatedProfileId), eq(dailyActivity.activityDate, today)));
    await rawDb.update(profile).set({ dailyXpGoal: 8, currentStreak: 0, longestStreak: 0, lastActiveOn: null })
      .where(eq(profile.id, isolatedProfileId));

    // two DIFFERENT fresh topics, each producing its own lesson plan slot — this test is about
    // cumulative same-day XP/streak accounting, not per-item idempotency (see "lesson
    // plan-membership + idempotency" below for that), so two distinct completions are used
    // rather than replaying the same one.
    const { sessionId } = await startSession(db, graph, "parent", isolatedProfileId, ["streakA", "streakB"]);

    const first = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: isolatedProfileId, sessionId, item: { kind: "lesson", topicId: "streakA" }
    }, ["streakA", "streakB"]);
    expect(first.xp).toBe(5);
    const [afterFirst] = await rawDb.select().from(dailyActivity)
      .where(and(eq(dailyActivity.profileId, isolatedProfileId), eq(dailyActivity.activityDate, today)));
    expect(afterFirst!.xpEarned).toBe(5);
    expect(afterFirst!.goalMet).toBe(false); // 5 < 8
    const [profileAfterFirst] = await rawDb.select().from(profile).where(eq(profile.id, isolatedProfileId));
    expect(profileAfterFirst!.currentStreak).toBe(1);
    expect(profileAfterFirst!.lastActiveOn).toBe(today);

    const second = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: isolatedProfileId, sessionId, item: { kind: "lesson", topicId: "streakB" }
    }, ["streakA", "streakB"]);
    expect(second.xp).toBe(5);
    const [afterSecond] = await rawDb.select().from(dailyActivity)
      .where(and(eq(dailyActivity.profileId, isolatedProfileId), eq(dailyActivity.activityDate, today)));
    expect(afterSecond!.xpEarned).toBe(10);
    expect(afterSecond!.goalMet).toBe(true); // 10 >= 8

    // same local day again: nextStreak must be a no-op, not a second increment
    const [profileAfterSecond] = await rawDb.select().from(profile).where(eq(profile.id, isolatedProfileId));
    expect(profileAfterSecond!.currentStreak).toBe(1);
  });
});

describe("lesson plan-membership + idempotency (CRITICAL 1)", () => {
  it("rejects a lesson POST for a topic that is not on this session's plan", async () => {
    const { sessionId } = await startSession(db, graph, "parent", isolatedProfileId, ["replayLesson"]);
    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: isolatedProfileId, sessionId, item: { kind: "lesson", topicId: "not-on-any-plan" }
    }, ["replayLesson"])).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a replayed lesson POST (409) and awards exactly one lessonComplete xp_event", async () => {
    const { sessionId } = await startSession(db, graph, "parent", isolatedProfileId, ["replayLesson"]);

    const first = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: isolatedProfileId, sessionId, item: { kind: "lesson", topicId: "replayLesson" }
    }, ["replayLesson"]);
    expect(first.xp).toBe(5);

    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: isolatedProfileId, sessionId, item: { kind: "lesson", topicId: "replayLesson" }
    }, ["replayLesson"])).rejects.toBeInstanceOf(ConflictError);

    const xpRows = await rawDb.select().from(xpEvent)
      .where(and(eq(xpEvent.profileId, isolatedProfileId), eq(xpEvent.sessionId, sessionId), eq(xpEvent.reason, "lessonComplete")));
    expect(xpRows).toHaveLength(1);
  });

  it("rejects any activity POST against a session that is no longer active", async () => {
    const { sessionId } = await startSession(db, graph, "parent", isolatedProfileId, ["replayLesson"]);
    await rawDb.update(learningSession).set({ status: "completed" }).where(eq(learningSession.id, sessionId));

    await expect(completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: isolatedProfileId, sessionId, item: { kind: "lesson", topicId: "replayLesson" }
    }, ["replayLesson"])).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("gradeable-item XP consumption (CRITICAL 2)", () => {
  it("a re-fetched exercise for an already-consumed plan slot grades honestly but earns xp: 0", async () => {
    const { sessionId } = await startSession(db, graph, "parent", isolatedProfileId, ["reserveTopic"]);

    const served1 = await serveExercise({
      sessionId, topicId: "reserveTopic", difficulty: 1, itemKind: "exercise", forProfileId: isolatedProfileId
    });
    const first = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: isolatedProfileId, sessionId,
      item: { kind: "exercise", topicId: "reserveTopic", difficulty: 1 },
      servedExerciseId: served1.id, answer: "8" // correct
    }, ["reserveTopic"]);
    expect(first.graded.correct).toBe(true);
    expect(first.xp).toBe(2); // XP_AMOUNTS.exerciseCorrect

    // re-serve a second instance of the SAME plan slot (allowed up to repo.MAX_SERVED_PER_ITEM)
    // and grade it too — legitimate extra practice, not a replay of the first servedExerciseId.
    const served2 = await serveExercise({
      sessionId, topicId: "reserveTopic", difficulty: 1, itemKind: "exercise", forProfileId: isolatedProfileId
    });
    const second = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: isolatedProfileId, sessionId,
      item: { kind: "exercise", topicId: "reserveTopic", difficulty: 1 },
      servedExerciseId: served2.id, answer: "8" // also correct
    }, ["reserveTopic"]);
    expect(second.graded.correct).toBe(true); // honest feedback, still graded
    expect(second.xp).toBe(0); // but the plan slot was already consumed — no second payout

    const xpRows = await rawDb.select().from(xpEvent)
      .where(and(eq(xpEvent.profileId, isolatedProfileId), eq(xpEvent.sessionId, sessionId), eq(xpEvent.reason, "exerciseCorrect")));
    expect(xpRows).toHaveLength(1);
  });
});

describe("implicit review + streak promotion in the grade path (Task 7)", () => {
  it("a correct exercise pushes out the direct hard prereq's review, not the grandparent's, creating no rows", async () => {
    const today = localToday("Europe/Rome");
    const [p] = await rawDb.insert(profile).values({ ownerUserId: "parent", displayName: "Implicit1" }).returning();
    const pid = p!.id;
    // radici mastered (pitagora's DIRECT hard prereq) and potenze mastered (radici's prereq, i.e.
    // pitagora's grandparent) — both due later than today, both hold a review_queue row already.
    await rawDb.insert(masteryState).values([
      { profileId: pid, topicId: "radici", status: "mastered", consecutiveCorrectAtLevel: 2 },
      { profileId: pid, topicId: "potenze", status: "mastered", consecutiveCorrectAtLevel: 2 }
    ]);
    await rawDb.insert(reviewQueue).values([
      { profileId: pid, topicId: "radici", intervalRung: 2, dueOn: addDays(today, 3), lapses: 0, suspended: false },
      { profileId: pid, topicId: "potenze", intervalRung: 2, dueOn: addDays(today, 3), lapses: 0, suspended: false }
    ]);

    const { sessionId } = await startSession(db, graph, "parent", pid, ["pitagora"]);
    const served = await serveExercise({
      sessionId, topicId: "pitagora", difficulty: 1, itemKind: "exercise", forProfileId: pid
    });
    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: pid, sessionId,
      item: { kind: "exercise", topicId: "pitagora", difficulty: 1 },
      servedExerciseId: served.id,
      answer: "8" // correct
    }, ["pitagora"]);
    expect(r.graded.correct).toBe(true);

    const radici = await getReviewRow(pid, "radici");
    expect(radici!.dueOn).toBe(addDays(today, INTERVAL_LADDER_DAYS[2]!)); // pushed to today+7
    const potenze = await getReviewRow(pid, "potenze");
    expect(potenze!.dueOn).toBe(addDays(today, 3)); // untouched (grandparent)
    expect(await countReviewRows(pid)).toBe(2); // no new rows
  });

  it("implicit review does not refresh a lapsed (needsReview) prereq", async () => {
    const today = localToday("Europe/Rome");
    const [p] = await rawDb.insert(profile).values({ ownerUserId: "parent", displayName: "Implicit2" }).returning();
    const pid = p!.id;
    // radici starts mastered so pitagora is plannable/frontier-eligible (composeSessionPlan only
    // ever offers "new" content once its hard prereqs are mastered); it's lapsed to needsReview
    // below, AFTER the plan is composed and the exercise served — completeActivity only reads the
    // already-persisted plan, so this mutation doesn't affect plan membership at grade time.
    await rawDb.insert(masteryState).values([
      { profileId: pid, topicId: "radici", status: "mastered", consecutiveCorrectAtLevel: 2 },
      { profileId: pid, topicId: "potenze", status: "mastered", consecutiveCorrectAtLevel: 2 }
    ]);
    const { sessionId } = await startSession(db, graph, "parent", pid, ["pitagora"]);
    const served = await serveExercise({
      sessionId, topicId: "pitagora", difficulty: 1, itemKind: "exercise", forProfileId: pid
    });

    // now lapse radici: needsReview status + a review row due today (the state at grade time)
    await rawDb.update(masteryState).set({ status: "needsReview" })
      .where(and(eq(masteryState.profileId, pid), eq(masteryState.topicId, "radici")));
    await rawDb.insert(reviewQueue).values({
      profileId: pid, topicId: "radici", intervalRung: 1, dueOn: today, lapses: 1, suspended: false
    });

    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: pid, sessionId,
      item: { kind: "exercise", topicId: "pitagora", difficulty: 1 },
      servedExerciseId: served.id,
      answer: "8" // correct
    }, ["pitagora"]);
    expect(r.graded.correct).toBe(true);

    const radici = await getReviewRow(pid, "radici");
    expect(radici!.dueOn).toBe(today); // unchanged — surfaces as remediation
  });

  it("review pass with masteryStreak >= 4 climbs two rungs", async () => {
    const today = localToday("Europe/Rome");
    const [p] = await rawDb.insert(profile).values({ ownerUserId: "parent", displayName: "Implicit3" }).returning();
    const pid = p!.id;
    await rawDb.insert(masteryState).values({
      profileId: pid, topicId: "ripasso", status: "mastered", consecutiveCorrectAtLevel: 4
    });
    await rawDb.insert(reviewQueue).values({
      profileId: pid, topicId: "ripasso", intervalRung: 1, dueOn: today, lapses: 0, suspended: false
    });
    const { sessionId } = await startSession(db, graph, "parent", pid, ["ripasso"]);
    const served = await serveExercise({
      sessionId, topicId: "ripasso", difficulty: 2, itemKind: "review", forProfileId: pid
    });

    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId: pid, sessionId,
      item: { kind: "review", topicId: "ripasso", reason: "due", difficulty: 2 },
      servedExerciseId: served.id,
      answer: "8" // correct
    }, ["ripasso"]);
    expect(r.graded.correct).toBe(true);

    const row = await getReviewRow(pid, "ripasso");
    expect(row!.intervalRung).toBe(3);
  });
});
