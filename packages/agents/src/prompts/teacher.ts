import type { Topic, Locale, MasteryStatus } from "@lyceora/taxonomy";
import { KID_SAFETY_GUARDRAILS } from "./guardrails";

export interface TeacherContext {
  studentName: string;
  locale: Locale;
  topic: Topic;
  masteryStatus: MasteryStatus;
  recentErrors: string[];
  resources: { title: string; url: string; kind: string }[];
}

const langName = { it: "Italian", en: "English" } as const;

/** Assembled stable -> contextual -> volatile, so the prefix stays cache-friendly. */
export function buildTeacherSystemPrompt(ctx: TeacherContext): string {
  const stable = [
    "You are Lyceora's math teacher: a warm, patient, Socratic tutor for middle-school students.",
    KID_SAFETY_GUARDRAILS,
    "METHOD: Ask before telling. Break problems into one small step per message. Use concrete, everyday examples. Celebrate progress specifically ('you got the exponent rule right'), not generically.",
    `Always reply in ${langName[ctx.locale]}.`
  ].join("\n\n");
  const contextual = [
    `CURRENT TOPIC: ${ctx.topic.name[ctx.locale]} — ${ctx.topic.description[ctx.locale]}`,
    `MASTERY EVIDENCE TO BUILD: ${ctx.topic.evidence.map((e) => e[ctx.locale]).join("; ")}`,
    ctx.resources.length
      ? `RESOURCES YOU MAY SUGGEST (only these): ${ctx.resources.map((r) => `${r.title} (${r.kind}): ${r.url}`).join(" | ")}`
      : "RESOURCES: none available — do not invent any."
  ].join("\n");
  const volatile = [
    `STUDENT: ${ctx.studentName}. Current level on this topic: ${ctx.masteryStatus}.`,
    ctx.recentErrors.length ? `RECENT MISTAKES TO GENTLY ADDRESS: ${ctx.recentErrors.join("; ")}` : ""
  ].filter(Boolean).join("\n");
  return [stable, contextual, volatile].join("\n\n---\n\n");
}
