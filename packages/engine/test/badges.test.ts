import { describe, it, expect } from "vitest";
import { BADGE_DEFINITIONS, evaluateBadges, type BadgeSnapshot } from "../src/badges";

const zero: BadgeSnapshot = {
  totalXp: 0, currentStreak: 0, masteredCount: 0, domainsCompleted: 0,
  reviewsPassedTotal: 0, cameBackAfterLapse: false, diagnosticCompleted: false, goalMetDays: 0
};

describe("badges", () => {
  it("awards nothing on a zero snapshot", () => {
    expect(evaluateBadges(zero, new Set())).toEqual([]);
  });
  it("awards primi-passi on diagnostic completion", () => {
    expect(evaluateBadges({ ...zero, diagnosticCompleted: true }, new Set())).toEqual(["primi-passi"]);
  });
  it("never re-awards already-earned badges (idempotent)", () => {
    expect(evaluateBadges({ ...zero, diagnosticCompleted: true }, new Set(["primi-passi"]))).toEqual([]);
  });
  it("awards multiple thresholds crossed in one check, in definition order", () => {
    const s = { ...zero, currentStreak: 7, masteredCount: 1 };
    expect(evaluateBadges(s, new Set())).toEqual(["streak-3", "streak-7", "prima-maestria"]);
  });
  it("streak-30 requires exactly >= 30", () => {
    expect(evaluateBadges({ ...zero, currentStreak: 29 }, new Set())).not.toContain("streak-30");
    expect(evaluateBadges({ ...zero, currentStreak: 30 }, new Set())).toContain("streak-30");
  });
  it("all definitions have bilingual, non-empty copy and unique ids", () => {
    const ids = new Set<string>();
    for (const b of BADGE_DEFINITIONS) {
      expect(ids.has(b.id)).toBe(false); ids.add(b.id);
      for (const f of [b.name.it, b.name.en, b.description.it, b.description.en]) expect(f.length).toBeGreaterThan(0);
    }
    expect(BADGE_DEFINITIONS).toHaveLength(10);
  });
});
