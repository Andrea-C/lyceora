import { z } from "zod";
import { db } from "@/lib/db";
import { getGraph, getPath } from "@/server/content";
import * as repo from "@/server/repo";
import { startSession } from "@/server/services/session";
import { requireUserId, guarded } from "@/server/http";

const bodySchema = z.object({ profileId: z.string().min(1) });

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });

  return guarded(async () => {
    // resolve the enrolled path's target topics up front (session's targetTopicIds param);
    // startSession re-gates the profile internally too, so this pre-check is defense-in-depth.
    const owned = await repo.getOwnedProfile(db, userId, parsed.data.profileId);
    const enr = await repo.getActiveEnrollment(db, owned.id);
    if (!enr) return Response.json({ error: "No active enrollment for this profile." }, { status: 400 });

    const targetTopicIds = getPath(enr.pathId).targetTopicIds;
    const { sessionId, plan } = await startSession(db, getGraph(), userId, parsed.data.profileId, targetTopicIds);
    return Response.json({ sessionId, plan });
  });
}
