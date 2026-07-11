import { describe, it, expect } from "vitest";
import { createFakeAssessorPort, fakeTeacherDeltas } from "../src/index.js";

describe("createFakeAssessorPort", () => {
  it("generates the requested count of localized, fixed-difficulty numeric exercises", async () => {
    const fake = createFakeAssessorPort();

    const [itEx] = await fake.generate("lyc_potenze_def", "it", 2, 1);
    expect(itEx).toMatchObject({ kind: "numeric", correctAnswer: "8", difficulty: 2 });
    expect(itEx!.prompt).toBe("Quanto fa 2^3?");

    const [enEx] = await fake.generate("lyc_potenze_def", "en", 3, 1);
    expect(enEx!.prompt).toBe("What is 2^3?");
    expect(enEx!.difficulty).toBe(3);

    const three = await fake.generate("t1", "it", 1, 3);
    expect(three).toHaveLength(3);
  });

  it("is deterministic: identical inputs produce identical output", async () => {
    const fake = createFakeAssessorPort();
    const first = await fake.generate("t1", "it", 2, 1);
    const second = await fake.generate("t1", "it", 2, 1);
    expect(first).toEqual(second);
  });

  it("grades '8' (and Italian comma-decimal/whitespace variants) as correct", async () => {
    const fake = createFakeAssessorPort();
    const [exercise] = await fake.generate("t1", "it", 2, 1);

    await expect(fake.grade(exercise!, "8", "it")).resolves.toMatchObject({ correct: true, failedConcepts: [] });
    await expect(fake.grade(exercise!, " 8 ", "it")).resolves.toMatchObject({ correct: true });
    await expect(fake.grade(exercise!, "8,0", "it")).resolves.toMatchObject({ correct: true });
  });

  it("grades a wrong answer incorrect, attributing only radici-suffixed candidate concepts", async () => {
    const fake = createFakeAssessorPort();
    const [exercise] = await fake.generate("t1", "it", 2, 1);

    const wrongNoCandidates = await fake.grade(exercise!, "25", "it");
    expect(wrongNoCandidates.correct).toBe(false);
    expect(wrongNoCandidates.failedConcepts).toEqual([]);

    const wrongWithCandidates = await fake.grade(exercise!, "25", "it", {
      candidateConcepts: ["lyc_radici_espressioni", "lyc_potenze_def"]
    });
    expect(wrongWithCandidates.correct).toBe(false);
    expect(wrongWithCandidates.failedConcepts).toEqual(["lyc_radici_espressioni"]);
  });
});

describe("fakeTeacherDeltas", () => {
  it("returns 2-3 fixed, non-empty deltas per locale, deterministically", () => {
    const it1 = fakeTeacherDeltas("it");
    const it2 = fakeTeacherDeltas("it");
    expect(it1).toEqual(it2);
    expect(it1.length).toBeGreaterThanOrEqual(2);
    expect(it1.length).toBeLessThanOrEqual(3);
    for (const delta of it1) expect(delta.length).toBeGreaterThan(0);

    const en = fakeTeacherDeltas("en");
    expect(en).not.toEqual(it1);
    expect(en.length).toBeGreaterThanOrEqual(2);
    expect(en.length).toBeLessThanOrEqual(3);
  });
});
