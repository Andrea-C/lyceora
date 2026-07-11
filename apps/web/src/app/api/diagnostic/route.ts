import { z } from "zod";
import { db } from "@/lib/db";
import { getGraph } from "@/server/content";
import { exerciseSchema } from "@lyceora/agents";
import { startDiagnostic, answerDiagnostic } from "@/server/services/diagnostic";
import { liveAssessor } from "@/server/registry";
import { requireUserId, guarded } from "@/server/http";

const startSchema = z.object({ profileId: z.string().min(1), action: z.literal("start") });
const answerSchema = z.object({
  profileId: z.string().min(1), action: z.literal("answer"),
  sessionId: z.string().min(1), exerciseJson: z.unknown(), answer: z.string().min(1)
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
      const r = await startDiagnostic(db, graph, liveAssessor, userId, parsed.data.profileId);
      return r.done
        ? Response.json({ sessionId: r.sessionId, done: true, result: r.result })
        : Response.json({ sessionId: r.sessionId, question: r.question });
    }

    // exerciseJson is validated separately with @lyceora/agents' own (zod v3) schema instance —
    // never nested inside this file's zod v4 schemas, which would mix incompatible zod majors.
    const exerciseJson = exerciseSchema.parse(parsed.data.exerciseJson);
    const r = await answerDiagnostic(db, graph, liveAssessor, userId, {
      profileId: parsed.data.profileId, sessionId: parsed.data.sessionId,
      exerciseJson, answer: parsed.data.answer
    });
    return r.done ? Response.json({ done: true, result: r.result }) : Response.json({ question: r.question });
  });
}
