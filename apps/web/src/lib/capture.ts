type Ids = { threadId: string; runId: string };

async function post(signal: object) {
  await fetch("/api/learning/signals", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signal)
  }).catch(() => {}); // capture must never break the learning flow
}

export const capture = {
  approval: (ids: Ids, context: string) =>
    post({ thread_id: ids.threadId, run_id: ids.runId, actor: "user", signal: "approval", context }),
  rejection: (ids: Ids, context: string) =>
    post({ thread_id: ids.threadId, run_id: ids.runId, actor: "user", signal: "rejection", context }),
  correction: (ids: Ids, before: string, after: string, context: string) =>
    post({ thread_id: ids.threadId, run_id: ids.runId, actor: "user", signal: "correction", before, after, context })
};
