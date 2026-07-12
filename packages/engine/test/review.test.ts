import { describe, it, expect } from "vitest";
import {
  applyReviewOutcome,
  applyImplicitReview,
  computeImplicitReviews,
  enterReviewRotation,
  INTERVAL_LADDER_DAYS,
  FAST_PROMOTE_STREAK,
  FAST_PROMOTE_STEP,
  addDays
} from "../src/index.js";

describe("spaced repetition ladder", () => {
  it("enters rotation at rung 0, due tomorrow", () => {
    const r = enterReviewRotation("t1", "2026-07-11");
    expect(r).toMatchObject({ topicId: "t1", intervalRung: 0, dueOn: "2026-07-12", lapses: 0, suspended: false });
  });
  it("climbs a rung on pass and schedules by the ladder", () => {
    const r0 = enterReviewRotation("t1", "2026-07-11");
    const r1 = applyReviewOutcome(r0, true, "2026-07-12");
    expect(r1.intervalRung).toBe(1);
    expect(r1.dueOn).toBe("2026-07-15"); // +3 days
  });
  it("caps at the top rung", () => {
    let r = { topicId: "t1", intervalRung: 5, dueOn: "2026-07-11", lapses: 0, suspended: false };
    r = applyReviewOutcome(r, true, "2026-07-11");
    expect(r.intervalRung).toBe(5);
    expect(r.dueOn).toBe("2026-09-09"); // +60 days
  });
  it("drops a rung and surfaces today on fail; suspends on second lapse", () => {
    let r = { topicId: "t1", intervalRung: 2, dueOn: "2026-07-11", lapses: 0, suspended: false };
    r = applyReviewOutcome(r, false, "2026-07-11");
    expect(r).toMatchObject({ intervalRung: 1, dueOn: "2026-07-11", lapses: 1, suspended: false });
    r = applyReviewOutcome(r, false, "2026-07-12");
    expect(r).toMatchObject({ intervalRung: 0, lapses: 2, suspended: true });
  });
  it("ladder is the agreed M1 scheme", () => {
    expect(INTERVAL_LADDER_DAYS).toEqual([1, 3, 7, 14, 30, 60]);
  });
});

describe("streak-aware promotion", () => {
  const row = { topicId: "t", intervalRung: 2, dueOn: "2026-07-12", lapses: 0, suspended: false };
  it("passes with streak < 4 promote +1 (legacy)", () => {
    const n = applyReviewOutcome(row, true, "2026-07-12", { masteryStreak: 3 });
    expect(n.intervalRung).toBe(3); expect(n.dueOn).toBe(addDays("2026-07-12", INTERVAL_LADDER_DAYS[3]!));
  });
  it("passes with no opts behave exactly as legacy", () => {
    expect(applyReviewOutcome(row, true, "2026-07-12")).toEqual(applyReviewOutcome(row, true, "2026-07-12", {}));
  });
  it("passes with streak >= 4 promote +2", () => {
    const n = applyReviewOutcome(row, true, "2026-07-12", { masteryStreak: 4 });
    expect(n.intervalRung).toBe(4); expect(n.dueOn).toBe(addDays("2026-07-12", INTERVAL_LADDER_DAYS[4]!));
  });
  it("caps at the top rung (adversarial index-bounds)", () => {
    const top = { ...row, intervalRung: 4 };
    const n = applyReviewOutcome(top, true, "2026-07-12", { masteryStreak: 9 });
    expect(n.intervalRung).toBe(5); expect(n.dueOn).toBe(addDays("2026-07-12", 60));
    const atTop = { ...row, intervalRung: 5 };
    expect(applyReviewOutcome(atTop, true, "2026-07-12", { masteryStreak: 9 }).intervalRung).toBe(5);
  });
  it("post-lapse re-mastery with small streak promotes only +1", () => {
    const n = applyReviewOutcome({ ...row, intervalRung: 1, lapses: 1 }, true, "2026-07-12", { masteryStreak: 2 });
    expect(n.intervalRung).toBe(2);
  });
  it("fail path ignores streak entirely", () => {
    const n = applyReviewOutcome(row, false, "2026-07-12", { masteryStreak: 10 });
    expect(n).toEqual(applyReviewOutcome(row, false, "2026-07-12"));
    expect(n.intervalRung).toBe(1); expect(n.dueOn).toBe("2026-07-12"); expect(n.lapses).toBe(1);
  });
});

describe("implicit review", () => {
  const row = { topicId: "p", intervalRung: 2, dueOn: "2026-07-15", lapses: 0, suspended: false };
  it("refreshes a mastered in-rotation prereq to today + LADDER[rung]", () => {
    const n = applyImplicitReview({ row, masteryStatus: "mastered" }, "2026-07-12");
    expect(n.dueOn).toBe("2026-07-19"); expect(n.intervalRung).toBe(2);
  });
  it("is a no-op for needsReview", () => {
    expect(applyImplicitReview({ row, masteryStatus: "needsReview" }, "2026-07-12")).toBe(row);
  });
  it("is a no-op when suspended", () => {
    expect(applyImplicitReview({ row: { ...row, suspended: true }, masteryStatus: "mastered" }, "2026-07-12")).toEqual({ ...row, suspended: true });
  });
  it("never pulls dueOn earlier (monotonic)", () => {
    const far = { ...row, dueOn: "2026-09-01" };
    expect(applyImplicitReview({ row: far, masteryStatus: "mastered" }, "2026-07-12").dueOn).toBe("2026-09-01");
  });
  it("does not extend a rung-0 confirmation review (adversarial)", () => {
    const confirm = { ...row, intervalRung: 0, dueOn: "2026-07-13" };
    expect(applyImplicitReview({ row: confirm, masteryStatus: "mastered" }, "2026-07-12").dueOn).toBe("2026-07-13");
  });
  it("computeImplicitReviews skips missing rows (never creates) and non-listed ids", () => {
    const changed = computeImplicitReviews(["p", "absent"], (id) => (id === "p" ? row : undefined), () => "mastered", "2026-07-12");
    expect(changed).toHaveLength(1); expect(changed[0]!.topicId).toBe("p");
  });
  it("is deterministic", () => {
    const a = computeImplicitReviews(["p"], () => row, () => "mastered", "2026-07-12");
    const b = computeImplicitReviews(["p"], () => row, () => "mastered", "2026-07-12");
    expect(a).toEqual(b);
  });
});
