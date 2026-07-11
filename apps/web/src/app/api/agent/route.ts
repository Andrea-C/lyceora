import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { learningSignal } from "@lyceora/db";
import { getTopic, getResources } from "@/server/content";
import * as repo from "@/server/repo";
import { registry } from "@/server/registry";
import { streamTeacher, aguiSSE, type TeacherContext } from "@lyceora/agents";
import { requireUserId, guarded } from "@/server/http";

const MAX_USER_MESSAGES = 40;
const MAX_MESSAGE_ENTRIES = 60;

// Only user/assistant turns are accepted from the client — the system prompt is built
// server-side (buildTeacherSystemPrompt) and content is a plain string, never a raw parts
// array, since there's no legitimate reason for the client to send anything richer here.
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1)
});
const bodySchema = z.object({
  threadId: z.string().min(1), runId: z.string().min(1),
  profileId: z.string().min(1), topicId: z.string().min(1),
  messages: z.array(messageSchema).min(1).max(MAX_MESSAGE_ENTRIES)
});

export async function POST(req: Request) {
  const userId = await requireUserId(req);
  if (userId instanceof Response) return userId;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body." }, { status: 400 });
  const { threadId, runId, profileId, topicId, messages } = parsed.data;

  return guarded(async () => {
    const p = await repo.getOwnedProfile(db, userId, profileId);

    // token-budget guard: a runaway chat loop must not burn the family's model budget.
    const userMessageCount = messages.filter((m) => m.role === "user").length;
    if (userMessageCount >= MAX_USER_MESSAGES) {
      const t = await getTranslations({ locale: p.locale, namespace: "agent" });
      return Response.json({ error: t("budgetExceeded") }, { status: 429 });
    }

    const topic = getTopic(topicId);
    const mastery = await repo.getMasteryOrEmpty(db, p.id, topicId);
    const recentErrors = await repo.getRecentErrors(db, p.id, topicId);
    const resources = getResources(topicId).map((r) => ({ title: r.title[p.locale], url: r.url, kind: r.kind }));
    const ctx: TeacherContext = {
      studentName: p.displayName, locale: p.locale, topic,
      masteryStatus: mastery.status, recentErrors, resources
    };

    // construct each message per-branch (rather than a blanket cast) so the role literal narrows
    // correctly against streamTeacher's ModelMessage[] parameter.
    const modelMessages: Parameters<typeof streamTeacher>[2] = messages.map((m) =>
      m.role === "user" ? { role: "user" as const, content: m.content } : { role: "assistant" as const, content: m.content }
    );
    const { textStream } = await streamTeacher(registry, ctx, modelMessages, { maxOutputTokens: 1000 });
    const mirrored = withRunErrorMirror(textStream, async (message) => {
      await db.insert(learningSignal).values({
        profileId: p.id, threadId, runId, actor: "agent", signal: "run_error", after: message
      });
    });

    return new Response(aguiSSE({ threadId, runId }, mirrored), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
  });
}

/** Mirrors a stream failure into `learning_signal` before letting it propagate to aguiSSE's own RUN_ERROR frame. */
async function* withRunErrorMirror(
  stream: AsyncIterable<string>, mirror: (message: string) => Promise<void>
): AsyncGenerator<string> {
  try {
    for await (const chunk of stream) yield chunk;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await mirror(message);
    } catch (mirrorErr) {
      console.error(mirrorErr);
    }
    throw err;
  }
}
