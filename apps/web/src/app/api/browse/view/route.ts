import { z } from "zod";
import { db } from "@/lib/db";
import { recordBrowseView } from "@/server/services/journey";
import { requireUserId, guarded } from "@/server/http";

const bodySchema = z.object({
  profileId: z.string().min(1),
  topicId: z.string().min(1),
  resourceId: z.string().min(1).optional()
});

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });

  return guarded(async () => {
    await recordBrowseView(db, userId, parsed.data.profileId, parsed.data.topicId, parsed.data.resourceId);
    return Response.json({ ok: true });
  });
}
