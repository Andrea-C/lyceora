import { describe, it, expect } from "vitest";
import { gradeDeterministic, exerciseSetSchema } from "../src/index.js";
import type { Exercise } from "../src/index.js";

const mcq: Exercise = {
  id: "e1", kind: "mcq", prompt: "2^3 = ?", choices: ["6", "8", "9"],
  correctAnswer: "1", explanation: "2*2*2 = 8", difficulty: 1
};
const num: Exercise = {
  id: "e2", kind: "numeric", prompt: "3/2 in decimale?", correctAnswer: "1.5",
  explanation: "3 diviso 2", difficulty: 1
};
const open: Exercise = {
  id: "e3", kind: "open", prompt: "Spiega il teorema di Pitagora", correctAnswer: "-",
  explanation: "-", difficulty: 2
};

describe("gradeDeterministic", () => {
  it("grades mcq by choice index", () => {
    expect(gradeDeterministic(mcq, "1")).toBe(true);
    expect(gradeDeterministic(mcq, "0")).toBe(false);
  });
  it("grades numeric tolerating Italian comma decimals and whitespace", () => {
    expect(gradeDeterministic(num, "1,5")).toBe(true);
    expect(gradeDeterministic(num, " 1.5 ")).toBe(true);
    expect(gradeDeterministic(num, "2")).toBe(false);
  });
  it("returns null for open answers (model required)", () => {
    expect(gradeDeterministic(open, "anything")).toBeNull();
  });
});

describe("exerciseSetSchema", () => {
  it("rejects an mcq whose correctAnswer is out of range", () => {
    const bad = { exercises: [{ ...mcq, correctAnswer: "7" }] };
    expect(exerciseSetSchema.safeParse(bad).success).toBe(false);
  });
});
