import { describe, it, expect } from "vitest";
import { aguiSSE } from "../src/index.js";

async function* fakeStream() { yield "Ciao"; yield " Marco!"; }
async function collect(rs: ReadableStream<Uint8Array>): Promise<string[]> {
  const text = await new Response(rs).text();
  return text.split("\n\n").filter(Boolean).map((f) => f.replace(/^data: /, ""));
}

describe("aguiSSE", () => {
  it("emits the AG-UI lifecycle envelope around text deltas", async () => {
    const frames = (await collect(aguiSSE({ threadId: "t1", runId: "r1" }, fakeStream()))).map((f) => JSON.parse(f));
    expect(frames.map((f) => f.type)).toEqual([
      "RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"
    ]);
    expect(frames[0]).toMatchObject({ threadId: "t1", runId: "r1" });
    expect(frames[2].delta).toBe("Ciao");
    const mid = frames[1].messageId;
    expect(frames[2].messageId).toBe(mid);
    expect(frames[4].messageId).toBe(mid);
  });

  it("emits RUN_ERROR when the stream throws", async () => {
    async function* boom(): AsyncIterable<string> { yield "x"; throw new Error("provider down"); }
    const frames = (await collect(aguiSSE({ threadId: "t1", runId: "r1" }, boom()))).map((f) => JSON.parse(f));
    expect(frames.at(-1)?.type).toBe("RUN_ERROR");
    expect(frames.at(-1)?.message).toMatch(/provider down/);
  });
});
