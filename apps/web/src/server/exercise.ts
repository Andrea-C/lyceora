import { randomUUID } from "node:crypto";
import type { Exercise } from "@lyceora/agents";

export type RedactedExercise = Omit<Exercise, "correctAnswer" | "explanation">;

/** Strip grading-only fields before an exercise is ever sent to the client. */
export function redactExercise(e: Exercise): RedactedExercise {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit them
  const { correctAnswer, explanation, ...rest } = e;
  return rest;
}

/**
 * Overwrites a freshly generated exercise's id with a server-minted UUID. Custody/nonce checks
 * (servedExerciseId's stored exerciseJson, the diagnostic exerciseId nonce) ultimately compare
 * against this id — it must never depend on whatever string a model happens to emit, which could
 * collide, repeat across calls, or in principle be steered by prompt content.
 */
export function withServerExerciseId(e: Exercise): Exercise {
  return { ...e, id: randomUUID() };
}
