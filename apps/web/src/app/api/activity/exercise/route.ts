import { z } from "zod";
import { db } from "@/lib/db";
import { getTopic } from "@/server/content";
import * as repo from "@/server/repo";
import { liveAssessor } from "@/server/registry";
import { requireUserId, guarded } from "@/server/http";

const querySchema = z.object({
  profileId: z.string().min(1),
  topicId: z.string().min(1),
  difficulty: z.coerce.number().int().min(1).max(3)
});

/** GET one freshly generated exercise for a session item (owner-gated). */
export async function GET(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid query." }, { status: 400 });

  return guarded(async () => {
    const p = await repo.getOwnedProfile(db, userId, parsed.data.profileId);
    const topic = getTopic(parsed.data.topicId); // throws if unknown -> mapped to 500 by `guarded`
    const [exercise] = await liveAssessor.generate(topic.id, p.locale, parsed.data.difficulty as 1 | 2 | 3, 1);
    return Response.json({ exercise });
  });
}
