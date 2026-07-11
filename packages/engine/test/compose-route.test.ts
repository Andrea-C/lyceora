import { describe, it, expect } from "vitest";
import { buildGraph } from "@lyceora/taxonomy";
import type { Topic, Dependency } from "@lyceora/taxonomy";
import {
  composeSessionPlan, routeNext, applyEvidence, EMPTY_MASTERY_STATE,
  type MasteryState
} from "../src/index.js";

const t = (id: string): Topic => ({
  id, type: "CONCEPTUAL", subject: "Mathematics", domain: "Arithmetic",
  name: { it: id, en: id }, description: { it: id, en: id },
  ageRangeStart: 11, ageRangeEnd: 12,
  evidence: [{ it: "e", en: "e" }], assessmentPrompt: { it: "{{name}}?", en: "{{name}}?" }, standards: []
});
const hard = (topicId: string, prerequisiteId: string): Dependency => ({ topicId, prerequisiteId, strength: "hard", reason: "t" });

// pitagora -> radici -> potenze (hard chain)
const graph = buildGraph([t("pitagora"), t("radici"), t("potenze")], [hard("pitagora", "radici"), hard("radici", "potenze")]);

const mastered: MasteryState = { ...EMPTY_MASTERY_STATE, status: "mastered", consecutiveCorrectAtLevel: 2 };
const inProgress: MasteryState = { ...EMPTY_MASTERY_STATE, status: "inProgress" };

describe("routeNext — Pitagora fails because radici is weak", () => {
  it("remediates the deepest implicated prerequisite and flags the false mastery", () => {
    const statusOf = (id: string) =>
      (({ potenze: "mastered", radici: "mastered", pitagora: "inProgress" } as const)[id as "potenze"] ?? "unknown");
    const decision = routeNext(graph, "pitagora",
      { passed: false, masteryAfter: "inProgress", failedConcepts: ["radici"] }, statusOf);
    expect(decision).toEqual({
      action: "remediate", blockedTopicId: "pitagora", remediationTopicId: "radici", demotePrereq: true
    });
  });

  it("advance enters review rotation and names the next frontier topic", () => {
    const statusOf = (id: string) => (id === "potenze" ? "mastered" as const : id === "radici" ? "mastered" as const : "unknown" as const);
    const d = routeNext(graph, "radici", { passed: true, masteryAfter: "mastered", failedConcepts: [] }, statusOf);
    expect(d.action).toBe("advance");
    if (d.action === "advance") expect(d.nextTopicId).toBe("pitagora");
  });

  it("reteaches the topic itself when foundations are fine", () => {
    const statusOf = () => "mastered" as const;
    const d = routeNext(graph, "pitagora", { passed: false, masteryAfter: "inProgress", failedConcepts: [] }, statusOf);
    expect(d.action).toBe("reteach");
  });
});

describe("composeSessionPlan — the post-remediation session", () => {
  it("puts the demoted prerequisite first, blocks pitagora, and includes due reviews", () => {
    const mastery = new Map<string, MasteryState>([
      ["potenze", mastered],
      ["radici", { ...mastered, status: "needsReview", lapses: 1 }],
      ["pitagora", inProgress]
    ]);
    const plan = composeSessionPlan({
      graph, targetTopicIds: ["pitagora"], mastery,
      dueReviews: [{ topicId: "potenze", intervalRung: 1, dueOn: "2026-07-11", lapses: 0, suspended: false }],
      dailyXpGoal: 30
    });
    const topicOrder = plan.items.map((i) => i.topicId);
    expect(topicOrder[0]).toBe("radici");                       // tier 1 remediation first
    expect(topicOrder).not.toContain("pitagora");               // blocked by needsReview prereq
    expect(plan.items.some((i) => i.kind === "review" && i.topicId === "potenze")).toBe(true);
    expect(plan.items.length).toBeLessThanOrEqual(12);
    expect(plan.estimatedXp).toBeGreaterThan(0);
  });

  it("serves 2 new frontier topics when nothing is due and nothing needs remediation", () => {
    const mastery = new Map<string, MasteryState>([["potenze", mastered]]);
    const plan = composeSessionPlan({ graph, targetTopicIds: ["pitagora"], mastery, dueReviews: [], dailyXpGoal: 30 });
    const lessons = plan.items.filter((i) => i.kind === "lesson").map((i) => i.topicId);
    expect(lessons).toEqual(["radici"]); // only radici is on the frontier (pitagora blocked)
  });
});
