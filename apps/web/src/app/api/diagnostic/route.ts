import { z } from "zod";
import { db } from "@/lib/db";
import { getGraph, getPath } from "@/server/content";
import { redactExercise } from "@/server/exercise";
import * as repo from "@/server/repo";
import { startDiagnostic, answerDiagnostic } from "@/server/services/diagnostic";
import { liveAssessor } from "@/server/registry";
import { requireUserId, guarded } from "@/server/http";

const startSchema = z.object({ profileId: z.string().min(1), action: z.literal("start") });
const answerSchema = z.object({
  profileId: z.string().min(1), action: z.literal("answer"),
  sessionId: z.string().min(1), exerciseId: z.string().min(1), answer: z.string().min(1)
});
const bodySchema = z.union([startSchema, answerSchema]);

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });

  return guarded(async () => {
    const graph = getGraph();

    if (parsed.data.action === "start") {
      // resolve the enrolled path's target topics up front (startDiagnostic's params); it
      // re-gates the profile internally too, so this pre-check is defense-in-depth, same
      // pattern as /api/session.
      const owned = await repo.getOwnedProfile(db, userId, parsed.data.profileId);
      const enr = await repo.getActiveEnrollment(db, owned.id);
      if (!enr) return Response.json({ error: "No active enrollment for this profile." }, { status: 400 });

      const targetTopicIds = getPath(enr.pathId).targetTopicIds;
      const r = await startDiagnostic(db, graph, liveAssessor, userId, parsed.data.profileId, enr.pathId, targetTopicIds);
      return r.done
        ? Response.json({ sessionId: r.sessionId, done: true, result: r.result })
        : Response.json({ sessionId: r.sessionId, question: { topicId: r.question.topicId, exercise: redactExercise(r.question.exercise) } });
    }

    // no exerciseJson from the client anymore — only exerciseId, a nonce checked against the
    // server-persisted pending question; the server grades whatever it already has stored.
    const r = await answerDiagnostic(db, graph, liveAssessor, userId, {
      profileId: parsed.data.profileId, sessionId: parsed.data.sessionId,
      exerciseId: parsed.data.exerciseId, answer: parsed.data.answer
    });
    return r.done
      ? Response.json({ done: true, result: r.result })
      : Response.json({ question: { topicId: r.question.topicId, exercise: redactExercise(r.question.exercise) } });
  });
}
