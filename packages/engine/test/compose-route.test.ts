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

  it("(Finding 1a) remediates a needsReview path target with no dependents (dependentless leaf) instead of re-teaching it as new content", () => {
    const mastery = new Map<string, MasteryState>([
      ["potenze", mastered],
      ["radici", mastered],
      ["pitagora", { ...EMPTY_MASTERY_STATE, status: "needsReview", lapses: 1, totalAttempts: 5 }]
    ]);
    const plan = composeSessionPlan({ graph, targetTopicIds: ["pitagora"], mastery, dueReviews: [], dailyXpGoal: 30 });
    expect(plan.items[0]).toMatchObject({ kind: "review", topicId: "pitagora", reason: "remediation" });
    const pitagoraItems = plan.items.filter((i) => i.topicId === "pitagora");
    expect(pitagoraItems.some((i) => i.kind === "lesson")).toBe(false); // short block: not thin evidence, not double-lapsed
    expect(pitagoraItems.map((i) => i.kind)).toEqual(["review", "exercise", "exercise", "assessment"]);
  });

  it("(Finding 4b) false test-out — thin evidence (totalAttempts <= 2) gets a full re-teach block with a lesson", () => {
    const mastery = new Map<string, MasteryState>([
      ["potenze", mastered],
      ["radici", { ...EMPTY_MASTERY_STATE, status: "needsReview", lapses: 0, totalAttempts: 1 }],
      ["pitagora", inProgress]
    ]);
    const plan = composeSessionPlan({ graph, targetTopicIds: ["pitagora"], mastery, dueReviews: [], dailyXpGoal: 30 });
    const radiciItems = plan.items.filter((i) => i.topicId === "radici");
    expect(radiciItems.map((i) => i.kind)).toEqual(["review", "lesson", "exercise", "exercise", "exercise", "assessment"]);
  });

  it("(Finding 1 dedupe) a needsReview topic that is also due is remediated once, never duplicated as a separate due-review item", () => {
    const mastery = new Map<string, MasteryState>([
      ["potenze", mastered],
      ["radici", mastered],
      ["pitagora", { ...EMPTY_MASTERY_STATE, status: "needsReview", lapses: 1, totalAttempts: 5 }]
    ]);
    const plan = composeSessionPlan({
      graph, targetTopicIds: ["pitagora"], mastery,
      dueReviews: [{ topicId: "pitagora", intervalRung: 1, dueOn: "2026-07-10", lapses: 1, suspended: false }],
      dailyXpGoal: 30
    });
    const pitagoraReviews = plan.items.filter((i) => i.kind === "review" && i.topicId === "pitagora");
    expect(pitagoraReviews).toHaveLength(1);
    expect(pitagoraReviews[0]).toMatchObject({ reason: "remediation" });
  });

  it("(Finding 3e) caps the plan at whole-block boundaries — never emits a partial block", () => {
    const thin = (): MasteryState => ({ ...EMPTY_MASTERY_STATE, status: "needsReview", lapses: 0, totalAttempts: 1 });
    const mastery = new Map<string, MasteryState>([
      ["potenze", thin()],
      ["radici", thin()],
      ["pitagora", thin()]
    ]);
    const plan = composeSessionPlan({ graph, targetTopicIds: ["pitagora"], mastery, dueReviews: [], dailyXpGoal: 30 });
    expect(plan.items).toHaveLength(12); // 3 full 6-item blocks (18) capped to exactly 2 whole blocks
    for (let i = 0; i < plan.items.length; i++) {
      const item = plan.items[i]!;
      if (item.kind === "lesson") {
        const next3 = plan.items.slice(i + 1, i + 4);
        expect(next3.every((x) => x.kind === "exercise" && x.topicId === item.topicId)).toBe(true);
        expect(plan.items[i + 4]).toMatchObject({ kind: "assessment", topicId: item.topicId });
      }
    }
  });
});

describe("routeNext — deepest-first prerequisite selection (Finding 2)", () => {
  it("descends to the deepest weak prerequisite by topo level (closest to foundations), not alphabetical order", () => {
    // a -> b -> c (hard chain) plus a -> d (hard); d mastered so only b is weak directly under a,
    // forcing the descent through b to c. Exercises topoLevel-based argmin at both the initial
    // pick and the deepestWeak descent (replacing the old alphabetical .sort()[0] pick).
    const g2 = buildGraph(
      [t("a"), t("b"), t("c"), t("d")],
      [hard("a", "b"), hard("b", "c"), hard("a", "d")]
    );
    const statusOf = (id: string) => (id === "d" ? ("mastered" as const) : ("unknown" as const));
    const decision = routeNext(g2, "a", { passed: false, masteryAfter: "inProgress", failedConcepts: [] }, statusOf);
    expect(decision).toEqual({
      action: "remediate", blockedTopicId: "a", remediationTopicId: "c", demotePrereq: false
    });
  });
});
