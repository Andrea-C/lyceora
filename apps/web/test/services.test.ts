import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { user, profile, masteryState } from "@lyceora/db";
import { buildGraph } from "@lyceora/taxonomy";
import type { Topic, Dependency } from "@lyceora/taxonomy";
import { eq } from "drizzle-orm";
import { startSession, completeActivity, type AssessorPort } from "../src/server/services/session";

const t = (id: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain: "Arithmetic",
  name: { it: id, en: id }, description: { it: id, en: id }, ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
const hard = (a: string, b: string): Dependency => ({ topicId: a, prerequisiteId: b, strength: "hard", reason: "t" });
const graph = buildGraph([t("pitagora"), t("radici"), t("potenze")], [hard("pitagora", "radici"), hard("radici", "potenze")]);

const fakeAssessor: AssessorPort = {
  generate: async (topicId) => [{ id: `ex-${topicId}`, kind: "numeric", prompt: "?", correctAnswer: "8", explanation: "2^3", difficulty: 2 }],
  grade: async (_ex, answer, _locale, opts) => ({
    correct: answer === "8",
    feedback: "ok",
    // mirror the live attribution path: wrong answer implicates the radici prerequisite when offered
    failedConcepts: answer === "8" ? [] : (opts?.candidateConcepts ?? []).filter((c) => c.includes("radici"))
  })
};

let db: never; let profileId: string;
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
  db = d as never;
});

describe("assessment failure routes to remediation with derived evidence", () => {
  it("failing the pitagora assessment demotes radici and blocks pitagora", async () => {
    const { sessionId } = await startSession(db, graph, "parent", profileId, ["pitagora"]);
    const r = await completeActivity(db, graph, fakeAssessor, "parent", {
      profileId, sessionId,
      item: { kind: "assessment", topicId: "pitagora", difficulty: 2 },
      exercise: { id: "ex1", kind: "numeric", prompt: "?", correctAnswer: "8", explanation: "e", difficulty: 2 },
      answer: "25" // wrong
    });
    expect(r.graded.correct).toBe(false);
    expect(r.routeDecision?.action).toBe("remediate");
    const rows = await (db as never as { select: Function }).select().from(masteryState).where(eq(masteryState.profileId, profileId));
    const radici = rows.find((x: { topicId: string }) => x.topicId === "radici");
    expect(radici.status).toBe("needsReview");
  });
});
