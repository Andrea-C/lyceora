import type { Locale } from "@lyceora/taxonomy";
import { gradeDeterministic, type Exercise } from "./exercise";

const PROMPT: Record<Locale, string> = { it: "Quanto fa 2^3?", en: "What is 2^3?" };
const EXPLANATION: Record<Locale, string> = {
  it: "2^3 vuol dire 2 moltiplicato per se stesso 3 volte: 2 × 2 × 2 = 8.",
  en: "2^3 means 2 multiplied by itself 3 times: 2 × 2 × 2 = 8."
};

export interface FakeAssessorPort {
  generate(topicId: string, locale: Locale, difficulty: 1 | 2 | 3, count: number): Promise<Exercise[]>;
  grade(
    exercise: Exercise, answer: string, locale: Locale, opts?: { candidateConcepts?: string[] }
  ): Promise<{ correct: boolean; feedback: string; failedConcepts: string[] }>;
}

/**
 * Deterministic, no-API-key stand-in for the live assessor (./assessor.ts), switched in by
 * apps/web/src/server/registry.ts — the ONE place that reads `LYCEORA_FAKE_MODELS` — so the
 * whole product (and Task 17's Playwright E2E flow) runs end-to-end with no provider keys.
 *
 * Every generated exercise is the same fixed numeric "2^3" question (correctAnswer "8"),
 * localized per the requested locale, at whatever difficulty was requested — deterministic
 * content means anyone driving the app without keys always knows the right answer up front.
 * Grading reuses the real `gradeDeterministic` numeric path (so e.g. the Italian comma-decimal
 * "8,0" is tolerated exactly like production), and wrong-answer attribution mirrors the live
 * shape (./assessor.ts's gradeAnswer): failedConcepts is only ever a subset of the offered
 * candidateConcepts, restricted to ids that look like a "radici" (roots) prerequisite — the same
 * fixture convention already used by apps/web/test/services.test.ts and diagnostic.test.ts.
 */
export function createFakeAssessorPort(): FakeAssessorPort {
  return {
    async generate(topicId, locale, difficulty, count) {
      return Array.from({ length: count }, (_, i) => ({
        id: `fake-${topicId}-${difficulty}-${i}`,
        kind: "numeric" as const,
        prompt: PROMPT[locale],
        correctAnswer: "8",
        explanation: EXPLANATION[locale],
        difficulty
      }));
    },
    async grade(exercise, answer, locale, opts) {
      const correct = gradeDeterministic(exercise, answer) === true;
      return {
        correct,
        feedback: EXPLANATION[locale],
        failedConcepts: correct ? [] : (opts?.candidateConcepts ?? []).filter((c) => c.includes("radici"))
      };
    }
  };
}

const TEACHER_DELTAS: Record<Locale, string[]> = {
  it: [
    "Ciao! ",
    "Sono il maestro di prova (nessuna chiave API configurata). ",
    "Prova a calcolare 2^3: la risposta è 8."
  ],
  en: [
    "Hi! ",
    "I'm the fake teacher (no provider API key configured). ",
    "Try working out 2^3: the answer is 8."
  ]
};

/**
 * Fixed 3-delta teacher reply, localized. Consumed by registry.ts's teacherStream, which streams
 * these deltas through the exact same aguiSSE encoder a real streamTeacher() run would use — the
 * client can't tell the difference except for the content.
 */
export function fakeTeacherDeltas(locale: Locale): string[] {
  return TEACHER_DELTAS[locale];
}
