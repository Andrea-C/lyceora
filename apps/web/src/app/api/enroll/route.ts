import { z } from "zod";
import { db } from "@/lib/db";
import { getPath } from "@/server/content";
import * as repo from "@/server/repo";
import { requireUserId, guarded } from "@/server/http";

const bodySchema = z.object({ profileId: z.string().min(1), pathId: z.string().min(1) });

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });

  return guarded(async () => {
    const p = await repo.getOwnedProfile(db, userId, parsed.data.profileId);
    getPath(parsed.data.pathId); // throws if unknown -> mapped to 500 by `guarded`
    const enrollment = await repo.createEnrollment(db, p.id, parsed.data.pathId);
    return Response.json({ enrollment });
  });
}
