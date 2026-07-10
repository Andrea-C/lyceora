// Frontend learning capture: the interface is the only place that sees BOTH
// what the agent did and what the human did about it. Subscribe to agent
// events, watch user actions, emit LearningSignal records to the server inbox.
import { BaseEvent, EventType } from "@ag-ui/core";

type Ids = { thread_id: string; run_id: string };

type LearningSignal = Ids & {           // mirror of learning-signal.schema.json
  actor: "user" | "agent";
  signal: "correction" | "approval" | "rejection" | "override" | "edit_after_output" | "explicit_teach";
  before?: unknown;
  after?: unknown;
  context?: string;
  event_refs?: string[];
  scope_hint?: string;
};

const post = (s: LearningSignal) =>
  fetch("/learning/signals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });

// 1. Track the last agent-produced values so user edits can be diffed against them.
const lastAgentValue = new Map<string, unknown>();   // fieldId -> value

export function onAgentEvent(ev: BaseEvent) {
  switch (ev.type) {
    case EventType.STATE_DELTA:
      // Agent wrote into shared state — remember what it set so a later user
      // edit can be captured as before/after.
      // for each JSON-Patch op: lastAgentValue.set(op.path, op.value)
      break;
    case EventType.TOOL_CALL_END:
      // Candidate for approval/rejection UI.
      break;
  }
}

// 2. Wire these into your UI handlers:
export const capture = {
  approval: (ids: Ids, toolCallId: string) =>
    post({ ...ids, actor: "user", signal: "approval", event_refs: [toolCallId] }),

  rejection: (ids: Ids, toolCallId: string, reason?: string) =>
    post({ ...ids, actor: "user", signal: "rejection", context: reason, event_refs: [toolCallId] }),

  // User changed a value the agent filled in — the highest-value signal there is.
  fieldEdited: (ids: Ids, fieldId: string, after: unknown) => {
    const before = lastAgentValue.get(fieldId);
    if (before !== undefined && before !== after) {
      return post({ ...ids, actor: "user", signal: "edit_after_output", before, after, context: fieldId });
    }
  },

  // Manager does manually what the agent refused to do.
  override: (ids: Ids, what: string, before: unknown, after: unknown) =>
    post({ ...ids, actor: "user", signal: "override", before, after, context: what }),

  explicitTeach: (ids: Ids, text: string, scope_hint?: string) =>
    post({ ...ids, actor: "user", signal: "explicit_teach", context: text, scope_hint }),
};
