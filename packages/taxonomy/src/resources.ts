import { z } from "zod";
import { localizedTextSchema } from "./schema";

export const resourceSchema = z.object({
  id: z.string().min(1),
  topicIds: z.array(z.string().min(1)).min(1),
  kind: z.enum(["video", "exercises", "assessment"]),
  provider: z.string().min(1),
  title: localizedTextSchema,
  url: z.string().url(),
  lang: z.enum(["it", "en"]),
  summary: localizedTextSchema.optional(),
  addedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

export type CuratedResource = z.infer<typeof resourceSchema>;
