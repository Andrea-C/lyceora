import { describe, it, expect } from "vitest";
import { applyReviewOutcome, enterReviewRotation, INTERVAL_LADDER_DAYS } from "../src/index.js";

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
