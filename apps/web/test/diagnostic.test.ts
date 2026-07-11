import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile, masteryState, reviewQueue, xpEvent, enrollment, learningSession } from "@lyceora/db";
import { buildGraph, type Topic, type Dependency } from "@lyceora/taxonomy";
import { eq, and } from "drizzle-orm";
import { startDiagnostic, answerDiagnostic } from "../src/server/services/diagnostic";
import type { AssessorPort } from "../src/server/services/session";
import { ConflictError } from "../src/server/repo";

const t = (id: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain: "Arithmetic",
  name: { it: id, en: id }, description: { it: id, en: id }, ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
const hard = (a: string, b: string): Dependency => ({ topicId: a, prerequisiteId: b, strength: "hard", reason: "t" });
// diag_top depends (hard) on diag_mid, which depends (hard) on diag_base — a single correct
// answer on the target should prune both prerequisites to "assumedMastered".
const graph = buildGraph(
  [t("diag_top"), t("diag_mid"), t("diag_base")],
  [hard("diag_top", "diag_mid"), hard("diag_mid", "diag_base")]
);

const fakeAssessor: AssessorPort = {
  generate: async (topicId) => [{ id: `ex-${topicId}`, kind: "numeric", prompt: "?", correctAnswer: "8", explanation: "2^3", difficulty: 2 }],
  grade: async (_ex, answer) => ({ correct: answer === "8", feedback: "ok", failedConcepts: [] })
};

let rawDb: ReturnType<typeof drizzle>;
let db: never;
let profileId: string;

beforeAll(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)) });
  await d.insert(user).values({ id: "diag-parent", name: "P", email: "diag@x.it", emailVerified: false });
  const [p] = await d.insert(profile).values({ ownerUserId: "diag-parent", displayName: "Sara" }).returning();
  profileId = p!.id;
  await d.insert(enrollment).values({ profileId, pathId: "path_test" });
  rawDb = d;
  db = d as never;
});

describe("diagnostic happy path + replay idempotency", () => {
  it("passing the target topic test-outs the whole chain and awards XP exactly once", async () => {
    const started = await startDiagnostic(db, graph, fakeAssessor, "diag-parent", profileId, "path_test", ["diag_top"]);
    expect(started.done).toBe(false);
    if (started.done) throw new Error("expected a pending question");
    expect(started.question.topicId).toBe("diag_top");
    // custody: the client never sees correctAnswer/explanation server-side either way, but the
    // service itself still holds the full exercise internally for grading — assert redaction is
    // the route's job, not the service's, by confirming the service DOES return the full exercise
    // (the route is responsible for stripping it before it reaches the client).
    expect(started.question.exercise.correctAnswer).toBe("8");

    const answered = await answerDiagnostic(db, graph, fakeAssessor, "diag-parent", {
      profileId, sessionId: started.sessionId, answer: "8" // correct
    });
    expect(answered.done).toBe(true);
    if (!answered.done) throw new Error("expected diagnostic to finish");
    expect(answered.result.mastered).toEqual(["diag_top"]);
    expect([...answered.result.assumedMastered].sort()).toEqual(["diag_base", "diag_mid"]);
    expect(answered.result.unmastered).toEqual([]);

    // mastery upserts for the whole chain
    const masteryRows = await rawDb.select().from(masteryState).where(eq(masteryState.profileId, profileId));
    for (const topicId of ["diag_top", "diag_mid", "diag_base"]) {
      expect(masteryRows.find((r) => r.topicId === topicId)?.status).toBe("mastered");
    }

    // rung-0 confirm reviews for the assumed (never directly tested) topics only
    const reviewRows = await rawDb.select().from(reviewQueue).where(eq(reviewQueue.profileId, profileId));
    expect(reviewRows.map((r) => r.topicId).sort()).toEqual(["diag_base", "diag_mid"]);
    for (const row of reviewRows) {
      expect(row.intervalRung).toBe(0);
      expect(row.suspended).toBe(false);
    }

    // exactly one diagnosticComplete xp_event
    const xpRows = await rawDb.select().from(xpEvent)
      .where(and(eq(xpEvent.profileId, profileId), eq(xpEvent.reason, "diagnosticComplete")));
    expect(xpRows).toHaveLength(1);

    // enrollment stamped with this diagnostic session, session marked completed
    const [enr] = await rawDb.select().from(enrollment).where(eq(enrollment.profileId, profileId));
    expect(enr?.diagnosticSessionId).toBe(started.sessionId);
    const [sessionRow] = await rawDb.select().from(learningSession).where(eq(learningSession.id, started.sessionId));
    expect(sessionRow?.status).toBe("completed");

    // REPLAY: answering again after completion must be rejected — no re-grade, no re-award
    await expect(answerDiagnostic(db, graph, fakeAssessor, "diag-parent", {
      profileId, sessionId: started.sessionId, answer: "8"
    })).rejects.toBeInstanceOf(ConflictError);

    const xpRowsAfterReplay = await rawDb.select().from(xpEvent)
      .where(and(eq(xpEvent.profileId, profileId), eq(xpEvent.reason, "diagnosticComplete")));
    expect(xpRowsAfterReplay).toHaveLength(1);
  });
});
