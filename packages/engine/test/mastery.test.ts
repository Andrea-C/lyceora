import { describe, it, expect } from "vitest";
import {
  applyEvidence,
  EMPTY_MASTERY_STATE,
  type EvidenceInput
} from "../src/index.js";

const ev = (
  isCorrect: boolean,
  over: Partial<EvidenceInput> = {}
): EvidenceInput => ({
  source: "exercise",
  isCorrect,
  difficulty: 2,
  createdAt: new Date("2026-07-11T10:00:00Z"),
  ...over
});

describe("applyEvidence", () => {
  it("promotes to mastered after 2 consecutive at-level correct", () => {
    const s = applyEvidence(EMPTY_MASTERY_STATE, [ev(true), ev(true)]);
    expect(s.status).toBe("mastered");
    expect(s.masteredAt).not.toBeNull();
  });

  it("tests out with a single at-level diagnostic correct", () => {
    const s = applyEvidence(EMPTY_MASTERY_STATE, [
      ev(true, { source: "diagnostic" })
    ]);
    expect(s.status).toBe("mastered");
  });

  it("below-level correct keeps the streak but never grants mastery", () => {
    const s = applyEvidence(EMPTY_MASTERY_STATE, [
      ev(true, { difficulty: 1 }),
      ev(true, { difficulty: 1 })
    ]);
    expect(s.status).toBe("inProgress");
    const s2 = applyEvidence(s, [ev(true), ev(true)]);
    expect(s2.status).toBe("mastered");
  });

  it("any incorrect resets the streak", () => {
    const s = applyEvidence(EMPTY_MASTERY_STATE, [
      ev(true),
      ev(false),
      ev(true)
    ]);
    expect(s.status).toBe("inProgress");
    expect(s.consecutiveCorrectAtLevel).toBe(1);
  });

  it("demotes mastered to needsReview on any miss, counting a lapse", () => {
    const m = applyEvidence(EMPTY_MASTERY_STATE, [ev(true), ev(true)]);
    const s = applyEvidence(m, [ev(false, { source: "review" })]);
    expect(s.status).toBe("needsReview");
    expect(s.lapses).toBe(1);
    expect(s.consecutiveCorrectAtLevel).toBe(0);
  });

  it("re-masters from needsReview after 2 at-level correct", () => {
    const m = applyEvidence(EMPTY_MASTERY_STATE, [ev(true), ev(true)]);
    const nr = applyEvidence(m, [ev(false)]);
    const s = applyEvidence(nr, [ev(true), ev(true)]);
    expect(s.status).toBe("mastered");
  });

  it("drops to inProgress (full reteach) on repeated failure while re-learning", () => {
    const m = applyEvidence(EMPTY_MASTERY_STATE, [ev(true), ev(true)]);
    const s = applyEvidence(m, [ev(false), ev(false)]);
    expect(s.status).toBe("inProgress");
    expect(s.lapses).toBe(2);
  });
});
