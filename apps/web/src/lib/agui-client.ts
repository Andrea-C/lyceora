export interface AguiCallbacks {
  onDelta(text: string): void;
  onDone(): void;
  /** HTTP/network-level failure. `message` is either the server's already-localized `{error}`
   * body (e.g. the 429 budget message) or a generic `HTTP <status>` fallback — safe to show
   * as-is, never raw provider text. */
  onError(message: string): void;
  /** A RUN_ERROR frame arrived mid-stream. Deliberately carries no message: the underlying text
   * is raw, un-localized provider/model output that must never reach the UI — the caller is
   * responsible for showing its own localized copy. */
  onRunError(): void;
}

export async function runAgent(
  body: { threadId: string; runId: string; profileId: string; topicId: string; messages: { role: string; content: string }[] },
  cb: AguiCallbacks
): Promise<void> {
  const res = await fetch("/api/agent", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) {
    // the route already localizes the body it sends on non-OK responses (e.g. the 429 budget
    // message) — parse and surface it verbatim; only fall back to a bare status when the body
    // isn't the expected `{error}` JSON shape at all.
    const parsed = await res.json().catch(() => null);
    cb.onError(typeof parsed?.error === "string" ? parsed.error : `HTTP ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const f of frames) {
      if (!f.startsWith("data: ")) continue;
      const e = JSON.parse(f.slice(6));
      if (e.type === "TEXT_MESSAGE_CONTENT") cb.onDelta(e.delta);
      if (e.type === "RUN_FINISHED") cb.onDone();
      if (e.type === "RUN_ERROR") cb.onRunError();
    }
  }
}
