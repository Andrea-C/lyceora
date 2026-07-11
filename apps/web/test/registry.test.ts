import { describe, it, expect, vi } from "vitest";

// Wiring-level test: registry.ts's liveAssessor.grade must forward the 4th (opts) argument
// through to the real @lyceora/agents gradeAnswer — a prior version silently dropped it, which
// would have discarded the assessment-item candidateConcepts attribution before it ever reached
// the model, defeating routeNext's prerequisite-demotion path in production. Mock gradeAnswer so
// this asserts the wiring itself without needing a real model call.
const gradeAnswerMock = vi.fn(async () => ({ correct: true, feedback: "mock", failedConcepts: [] }));

vi.mock("@lyceora/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lyceora/agents")>();
  return { ...actual, gradeAnswer: gradeAnswerMock };
});

describe("registry liveAssessor wiring", () => {
  it("forwards grade() opts (candidateConcepts) through to gradeAnswer", async () => {
    const { liveAssessor } = await import("../src/server/registry");
    const exercise = { id: "e1", kind: "numeric" as const, prompt: "?", correctAnswer: "8", explanation: "e", difficulty: 2 as const };

    await liveAssessor.grade(exercise, "25", "it", { candidateConcepts: ["radici"] });

    expect(gradeAnswerMock).toHaveBeenCalledTimes(1);
    const [, calledExercise, calledAnswer, calledLocale, calledOpts] = gradeAnswerMock.mock.calls[0]!;
    expect(calledExercise).toEqual(exercise);
    expect(calledAnswer).toBe("25");
    expect(calledLocale).toBe("it");
    expect(calledOpts).toEqual({ candidateConcepts: ["radici"] });
  });
});
