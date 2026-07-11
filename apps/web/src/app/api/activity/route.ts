import { z } from "zod";
import { db } from "@/lib/db";
import { getGraph } from "@/server/content";
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
// servedExerciseId + answer are REQUIRED for every non-lesson item (grading needs the
// server-custodied exercise, never a client-supplied blob); malformed -> 400, not a 500 deep
// inside the service.
const bodySchema = z.object({
  profileId: z.string().min(1), sessionId: z.string().min(1),
  item: sessionItemSchema,
  servedExerciseId: z.string().min(1).optional(),
  answer: z.string().min(1).optional()
}).superRefine((val, ctx) => {
  if (val.item.kind !== "lesson") {
    if (!val.servedExerciseId) {
      ctx.addIssue({ code: "custom", path: ["servedExerciseId"], message: "servedExerciseId is required for non-lesson items" });
    }
    if (!val.answer) {
      ctx.addIssue({ code: "custom", path: ["answer"], message: "answer is required for non-lesson items" });
    }
  }
});

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });

  return guarded(async () => {
    const result = await completeActivity(db, getGraph(), liveAssessor, userId, {
      profileId: parsed.data.profileId, sessionId: parsed.data.sessionId,
      item: parsed.data.item, servedExerciseId: parsed.data.servedExerciseId, answer: parsed.data.answer
    });
    return Response.json(result);
  });
}
