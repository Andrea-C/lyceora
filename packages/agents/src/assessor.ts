import { generateObject } from "ai";
import { z } from "zod";
import type { Topic, Locale } from "@lyceora/taxonomy";
import type { Registry } from "./registry";
import { exerciseSetSchema, gradeDeterministic, type Exercise } from "./exercise";
import { exerciseGenPrompt, gradingPrompt } from "./prompts/assessor";

export async function generateExercises(
  reg: Registry, topic: Topic, locale: Locale,
  opts: { count: number; difficulty: 1 | 2 | 3 }
): Promise<Exercise[]> {
  return reg.withFallback("assessor", async ({ model }) => {
    const { object } = await generateObject({
      model,
      schema: exerciseSetSchema,
      prompt: exerciseGenPrompt(topic, locale, opts.count, opts.difficulty)
    });
    return object.exercises;
  });
}

const gradeResultSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().min(1),
  failedConcepts: z.array(z.string()).default([])
});
export type GradeResult = z.infer<typeof gradeResultSchema>;

export async function gradeAnswer(
  reg: Registry, exercise: Exercise, answer: string, locale: Locale,
  opts: { candidateConcepts?: string[] } = {}
): Promise<GradeResult> {
  const candidates = opts.candidateConcepts ?? [];
  const det = gradeDeterministic(exercise, answer);
  // deterministic result is final unless we need model attribution for a wrong answer
  if (det === true) return { correct: true, feedback: exercise.explanation, failedConcepts: [] };
  if (det === false && candidates.length === 0) {
    return { correct: false, feedback: exercise.explanation, failedConcepts: [] };
  }
  return reg.withFallback("assessor", async ({ model }) => {
    const { object } = await generateObject({
      model,
      schema: gradeResultSchema,
      prompt: gradingPrompt(exercise.prompt, answer, locale, candidates)
    });
    // never trust attribution outside the candidate set
    const failedConcepts = object.failedConcepts.filter((c) => candidates.includes(c));
    return { ...object, correct: det ?? object.correct, failedConcepts };
  });
}
