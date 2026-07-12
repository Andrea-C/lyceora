import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { learningSignal } from "@lyceora/db";
import { learningSignalSchema } from "@lyceora/agents";
import * as repo from "@/server/repo";
import { requireUserId, guarded } from "@/server/http";

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const parsed = learningSignalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });

  return guarded(async () => {
    // attach the active profile ONLY once its ownership is confirmed for this session's user;
    // an unowned/missing cookie profile still stores the signal, just with profileId: null.
    const cookieProfileId = (await cookies()).get("lyceora_profile")?.value;
    let profileId: string | null = null;
    if (cookieProfileId) {
      try {
        const owned = await repo.getOwnedProfile(db, userId, cookieProfileId);
        profileId = owned.id;
      } catch (err) {
        if (!(err instanceof repo.ForbiddenError)) throw err;
      }
    }

    if (profileId && !(await repo.consumeRateLimit(db, profileId, "signals", repo.RATE_LIMITS.signals))) {
      return Response.json({ error: "rate limited" }, { status: 429 });
    }

    const s = parsed.data;
    await db.insert(learningSignal).values({
      profileId, threadId: s.thread_id, runId: s.run_id, actor: s.actor, signal: s.signal,
      before: s.before, after: s.after, context: s.context, scopeHint: s.scope_hint
    });
    return Response.json({ ok: true });
  });
}
