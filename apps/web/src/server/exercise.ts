import type { Exercise } from "@lyceora/agents";

export type RedactedExercise = Omit<Exercise, "correctAnswer" | "explanation">;

/** Strip grading-only fields before an exercise is ever sent to the client. */
export function redactExercise(e: Exercise): RedactedExercise {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit them
  const { correctAnswer, explanation, ...rest } = e;
  return rest;
}
