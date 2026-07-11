export interface AguiCallbacks {
  onDelta(text: string): void;
  onDone(): void;
  onError(message: string): void;
}

export async function runAgent(
  body: { threadId: string; runId: string; profileId: string; topicId: string; messages: { role: string; content: string }[] },
  cb: AguiCallbacks
): Promise<void> {
  const res = await fetch("/api/agent", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) { cb.onError(`HTTP ${res.status}`); return; }
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
      if (e.type === "RUN_ERROR") cb.onError(e.message);
    }
  }
}
