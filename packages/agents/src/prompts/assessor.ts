import type { Topic, Locale } from "@lyceora/taxonomy";
import { KID_SAFETY_GUARDRAILS } from "./guardrails";

const langName = { it: "Italian", en: "English" } as const;

export function exerciseGenPrompt(topic: Topic, locale: Locale, count: number, difficulty: 1 | 2 | 3): string {
  return [
    `You create math exercises for an Italian middle-school student (age ${topic.ageRangeStart}-${topic.ageRangeEnd}).`,
    KID_SAFETY_GUARDRAILS,
    `Topic: ${topic.name[locale]} — ${topic.description[locale]}`,
    `Mastery evidence this must probe: ${topic.evidence.map((e) => e[locale]).join("; ")}`,
    `Write ${count} exercises in ${langName[locale]}, difficulty ${difficulty}/3.`,
    `Prefer kind "mcq" (3-4 plausible choices; correctAnswer = index of the right choice as a string) or "numeric" (correctAnswer = the number as a string). Use "open" at most once.`,
    `Each explanation teaches the step-by-step path to the answer, warmly and without jargon.`,
    `Give each exercise a unique short id.`
  ].join("\n");
}

export function gradingPrompt(
  prompt: string, correctAnswer: string, explanation: string, studentAnswer: string,
  locale: Locale, candidateConcepts: string[]
): string {
  return [
    `You grade one answer from a middle-school student. Reply in ${langName[locale]}.`,
    KID_SAFETY_GUARDRAILS,
    `Exercise: ${prompt}`,
    `Reference correct answer: ${correctAnswer}`,
    `Reference explanation (for your own grounding — don't just repeat it verbatim): ${explanation}`,
    `Student answer: ${studentAnswer}`,
    `Judge correctness on substance against the reference answer, not spelling or exact wording. Feedback: 2-3 warm sentences; if wrong, show the correct reasoning.`,
    candidateConcepts.length
      ? `If the answer is wrong, set failedConcepts to the subset of these prerequisite ids the error indicates (empty if the error is within the topic itself): ${candidateConcepts.join(", ")}`
      : `Set failedConcepts to [].`
  ].join("\n");
}
