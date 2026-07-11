import { z } from "zod";

export const exerciseSchema = z.object({
  id: z.string(),
  kind: z.enum(["mcq", "numeric", "open"]),
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(5).optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)])
}).superRefine((e, ctx) => {
  if (e.kind === "mcq") {
    const i = Number(e.correctAnswer);
    if (!e.choices || !Number.isInteger(i) || i < 0 || i >= e.choices.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mcq needs choices and correctAnswer as a valid choice index" });
    }
  }
});
export const exerciseSetSchema = z.object({ exercises: z.array(exerciseSchema).min(1) });
export type Exercise = z.infer<typeof exerciseSchema>;

const num = (s: string): number => Number(s.trim().replace(",", "."));

/** Pure grading for mcq/numeric; null = needs model judgment (open). */
export function gradeDeterministic(e: Exercise, answer: string): boolean | null {
  if (e.kind === "mcq") return answer.trim() === e.correctAnswer.trim();
  if (e.kind === "numeric") {
    const a = num(answer), c = num(e.correctAnswer);
    if (Number.isNaN(a) || Number.isNaN(c)) return false;
    return Math.abs(a - c) < 1e-9;
  }
  return null;
}
