import { z } from "zod";
import { db } from "@/lib/db";
import { getGraph } from "@/server/content";
import { exerciseSchema } from "@lyceora/agents";
import { completeActivity } from "@/server/services/session";
import { liveAssessor } from "@/server/registry";
import { requireUserId, guarded } from "@/server/http";

const difficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const sessionItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("review"), topicId: z.string().min(1), reason: z.enum(["due", "remediation"]), difficulty: difficultySchema }),
  z.object({ kind: z.literal("lesson"), topicId: z.string().min(1) }),
  z.object({ kind: z.literal("exercise"), topicId: z.string().min(1), difficulty: difficultySchema }),
  z.object({ kind: z.literal("assessment"), topicId: z.string().min(1), difficulty: difficultySchema })
]);
const bodySchema = z.object({
  profileId: z.string().min(1), sessionId: z.string().min(1),
  item: sessionItemSchema, exerciseJson: z.unknown().optional(), answer: z.string().optional()
});

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });

  return guarded(async () => {
    // exerciseJson validated separately with @lyceora/agents' own (zod v3) schema instance —
    // never nested inside this file's zod v4 schemas, which would mix incompatible zod majors.
    const exercise = parsed.data.exerciseJson !== undefined ? exerciseSchema.parse(parsed.data.exerciseJson) : undefined;
    const result = await completeActivity(db, getGraph(), liveAssessor, userId, {
      profileId: parsed.data.profileId, sessionId: parsed.data.sessionId,
      item: parsed.data.item, exercise, answer: parsed.data.answer
    });
    return Response.json(result);
  });
}
