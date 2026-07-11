import { z } from "zod";
import { db } from "@/lib/db";
import { getTopic } from "@/server/content";
import { redactExercise, withServerExerciseId } from "@/server/exercise";
import * as repo from "@/server/repo";
import { liveAssessor } from "@/server/registry";
import { requireUserId, guarded } from "@/server/http";

const querySchema = z.object({
  profileId: z.string().min(1),
  sessionId: z.string().min(1),
  topicId: z.string().min(1),
  difficulty: z.coerce.number().int().min(1).max(3),
  kind: z.enum(["review", "exercise", "assessment"])
});

/**
 * GET one freshly generated exercise for a session item (owner-gated). Persists the full
 * exercise server-side (servedExercise custody, pinned to this item's kind) and returns only a
 * redacted copy — the client never sees correctAnswer/explanation until it's graded.
 */
export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid query." }, { status: 400 });

  return guarded(async () => {
    const p = await repo.getOwnedProfile(db, userId, parsed.data.profileId);
    const sessionRow = await repo.assertSessionOwnership(db, p.id, parsed.data.sessionId);

    // plan-membership check: only a (topicId, difficulty, kind) triple that's actually an item in
    // this session's composed plan may be generated for — the same topicId+difficulty can appear
    // under more than one kind (e.g. an "exercise" and an "assessment" for the same topic), so
    // kind must be part of the match, not just topicId+difficulty. This also rate-bounds
    // generation to the plan's own size, rather than letting a client request arbitrary
    // topics/difficulties/kinds.
    const inPlan = (sessionRow.planJson?.items ?? []).some(
      (item) => "difficulty" in item && item.kind === parsed.data.kind
        && item.topicId === parsed.data.topicId && item.difficulty === parsed.data.difficulty
    );
    if (!inPlan) {
      return Response.json({ error: "That topic/difficulty/kind is not part of this session's plan." }, { status: 409 });
    }

    const topic = getTopic(parsed.data.topicId); // throws if unknown -> mapped to 500 by `guarded`
    const [generated] = await liveAssessor.generate(topic.id, p.locale, parsed.data.difficulty as 1 | 2 | 3, 1);
    const exercise = withServerExerciseId(generated!);
    const served = await repo.createServedExercise(db, {
      profileId: p.id, sessionId: parsed.data.sessionId, topicId: topic.id,
      difficulty: parsed.data.difficulty, itemKind: parsed.data.kind, exercise
    });
    return Response.json({ servedExerciseId: served.id, exercise: redactExercise(exercise) });
  });
}
