import { describe, it, expect, vi, afterEach } from "vitest";
import { runAgent } from "../src/lib/agui-client";

function sseResponse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200 });
}

const noopCb = { onDelta: () => {}, onDone: () => {}, onError: () => {}, onRunError: () => {} };

describe("runAgent error surfacing (IMPORTANT 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the JSON {error} body on a non-OK response and surfaces it verbatim (already-localized server messages, e.g. the 429 budget message, pass through as-is)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: "Facciamo una pausa dalla chat..." }), { status: 429 })));
    const onError = vi.fn();
    await runAgent({ threadId: "t", runId: "r", profileId: "p", topicId: "x", messages: [] }, { ...noopCb, onError });
    expect(onError).toHaveBeenCalledWith("Facciamo una pausa dalla chat...");
  });

  it("falls back to a generic HTTP-status message when the error body isn't the expected JSON shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>not json</html>", { status: 500 })));
    const onError = vi.fn();
    await runAgent({ threadId: "t", runId: "r", profileId: "p", topicId: "x", messages: [] }, { ...noopCb, onError });
    expect(onError).toHaveBeenCalledWith("HTTP 500");
  });

  it("routes a mid-stream RUN_ERROR frame to onRunError, never surfacing the raw provider text via onError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      sseResponse([{ type: "RUN_ERROR", message: "raw provider stack trace, never localized" }])));
    const onError = vi.fn();
    const onRunError = vi.fn();
    await runAgent({ threadId: "t", runId: "r", profileId: "p", topicId: "x", messages: [] }, { ...noopCb, onError, onRunError });
    expect(onRunError).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
