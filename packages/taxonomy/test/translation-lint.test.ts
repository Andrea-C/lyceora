import { describe, it, expect } from "vitest";
import junior from "../data/math-junior.json";

const EN_STOPWORDS = /\b(the|and|which|with|of|to|for)\b/i;

// Guard: skip the whole suite while the overlay is still English-copy
// placeholders (Task 12's itPending: true). Once translate-overlay.ts runs
// and removes the flag, this suite flips on and enforces overlay quality.
describe.skipIf((junior as { itPending?: boolean }).itPending === true)("math-junior Italian overlay", () => {
  it("overlay is complete: itPending flag removed", () => {
    expect((junior as { itPending?: boolean }).itPending).toBeUndefined();
  });

  it("every it field is non-empty, not identical to en, and free of English stopwords", () => {
    for (const t of junior.topics) {
      for (const [it, en] of [[t.name.it, t.name.en], [t.description.it, t.description.en]] as const) {
        expect(it.length).toBeGreaterThan(0);
        expect(it).not.toBe(en);
        expect(it).not.toMatch(EN_STOPWORDS);
        expect(it.length).toBeGreaterThan(en.length * 0.5);
        expect(it.length).toBeLessThan(en.length * 3);
      }
      for (const ev of t.evidence) { expect(ev.it.length).toBeGreaterThan(0); expect(ev.it).not.toMatch(EN_STOPWORDS); }
    }
  });
});
