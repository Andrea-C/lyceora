import { z } from "zod";

export const localizedTextSchema = z.object({ it: z.string().min(1), en: z.string().min(1) });

export const topicSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["CONCEPTUAL", "PROCEDURAL", "REPRESENTATIONAL", "DISPOSITIONAL", "METACOGNITIVE", "PSYCHOMOTOR"]),
  subject: z.string(),
  domain: z.string(),
  name: localizedTextSchema,
  description: localizedTextSchema,
  ageRangeStart: z.number().int().min(3).max(18),
  ageRangeEnd: z.number().int().min(3).max(18),
  centrality: z.number().optional(),
  evidence: z.array(localizedTextSchema).min(1),
  assessmentPrompt: localizedTextSchema,
  standards: z.array(z.string()).default([])
});

export const dependencySchema = z.object({
  topicId: z.string().min(1),
  prerequisiteId: z.string().min(1),
  strength: z.enum(["hard", "soft"]),
  reason: z.string()
});
