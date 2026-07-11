import { randomUUID } from "node:crypto";

/** AG-UI over SSE: camelCase fields, SCREAMING_SNAKE_CASE types (TS wire convention). */
export function aguiSSE(
  run: { threadId: string; runId: string },
  textStream: AsyncIterable<string>
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const frame = (e: object) => enc.encode(`data: ${JSON.stringify(e)}\n\n`);
  return new ReadableStream({
    async start(controller) {
      const { threadId, runId } = run;
      controller.enqueue(frame({ type: "RUN_STARTED", threadId, runId }));
      const messageId = randomUUID();
      try {
        controller.enqueue(frame({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }));
        for await (const delta of textStream) {
          controller.enqueue(frame({ type: "TEXT_MESSAGE_CONTENT", messageId, delta }));
        }
        controller.enqueue(frame({ type: "TEXT_MESSAGE_END", messageId }));
        controller.enqueue(frame({ type: "RUN_FINISHED", threadId, runId }));
      } catch (err) {
        controller.enqueue(frame({ type: "RUN_ERROR", message: String(err) }));
      } finally {
        controller.close();
      }
    }
  });
}
